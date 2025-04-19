import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import {BaseError} from "../common/Error"
import {HttpClient} from "@effect/platform/HttpClient"
import {DialogueText} from "../game/Dialogue"
import {pipe} from "effect"
import * as A from "effect/Array"
import * as O from "effect/Option"
import * as R from "effect/Record"
import * as SC from "effect/Schema"
import * as ST from "effect/Stream"
import {Stream} from "effect/Stream"
import {FileSystem} from "@effect/platform/FileSystem"
import {parseJson} from "../common/Json"
import {Scope} from "effect/Scope"
import {HttpClientResponse} from "@effect/platform/HttpClientResponse"
import {Actor, ActorBase} from "@skyrim-platform/skyrim-platform"
import {getStockVoiceType, StockVoiceType} from "skyrim-effect/game/VoiceType"
import {
    ActorHexId,
    ActorId,
    getActor,
    getActorId,
    getSex,
    Sex
} from "skyrim-effect/game/Actor"
import {FormError, toHexId} from "skyrim-effect/game/Form"
import {BinaryData} from "../common/Data"
import {Emotion, EmotionRangeMap, EmotionRangeValues} from "../actor/Emotion"
import {formData} from "@effect/platform/HttpBody"
import {Scheduler} from "effect/Scheduler"

export class TtsServiceError extends BaseError<TtsServiceError>(
    "TtsServiceError",
    {
        message: "Failed to generate an audio file from the given text."
    }
) {}

export type SpeechGenerator = (
    text: DialogueText,
    speaker: ActorId,
    emotion?: Emotion
) => Effect<
    Stream<BinaryData, TtsServiceError | FormError>,
    TtsServiceError | FormError,
    Scope
>

export const TtsVoice = pipe(
    SC.NonEmptyString,
    SC.brand("TtsVoice"),
    SC.annotations({
        title: "TTS Voice",
        description: "Voice to use when using a TTS service"
    })
)

export type TtsVoice = typeof TtsVoice.Type

export type TtsVoiceMapping = (speaker: Actor, emotion?: Emotion) => TtsVoice

export const GenericVoiceMappingConfig = pipe(
    SC.Struct({
        type: pipe(
            SC.Record({key: StockVoiceType, value: EmotionRangeMap(TtsVoice)}),
            SC.partial,
            SC.optional
        ),
        unique: pipe(
            SC.Record({key: ActorHexId, value: EmotionRangeMap(TtsVoice)}),
            SC.optional
        ),
        fallback: SC.Record({key: Sex, value: EmotionRangeMap(TtsVoice)})
    }),
    SC.annotations({
        title: "Voice Mapping",
        description: "Mapping between actors and voice names"
    })
)

export type GenericVoiceMappingConfig = typeof GenericVoiceMappingConfig.Type

export function createGenericVoiceMapping(
    config: GenericVoiceMappingConfig
): TtsVoiceMapping {
    const {type, unique, fallback} = config

    const getEmotionMapping =
        (mapping: EmotionRangeMap<TtsVoice>) => (emotion?: Emotion) =>
            pipe(
                emotion,
                O.fromNullable,
                O.flatMap(({type, intensity}) => {
                    const valueForEmotion = mapping[type]

                    if (SC.is(TtsVoice)(valueForEmotion)) {
                        return O.some(valueForEmotion)
                    }

                    return pipe(
                        valueForEmotion,
                        O.liftPredicate(SC.is(EmotionRangeValues(TtsVoice))),
                        A.fromOption,
                        A.flatten,
                        A.findFirst(
                            ({min, max}) => min <= intensity && intensity <= max
                        ),
                        O.map(({value}) => value)
                    )
                }),
                O.getOrElse(() => mapping.Neutral)
            )

    const voiceForActor = (speaker: Actor) =>
        pipe(
            O.Do,
            O.bind("mappings", () => O.fromNullable(unique)),
            O.bind("key", () =>
                pipe(speaker, getActorId, toHexId(ActorHexId), O.some)
            ),
            O.flatMap(({mappings, key}) => pipe(mappings, R.get(key))),
            O.map(getEmotionMapping)
        )

    const voiceForType = (speaker: Actor) =>
        pipe(
            O.Do,
            O.bind("mappings", () => O.fromNullable(type)),
            O.bind("key", () => getStockVoiceType(speaker)),
            O.flatMap(({mappings, key}) => pipe(mappings[key], O.fromNullable)),
            O.map(getEmotionMapping)
        )

    const voiceForSex = (speaker: Actor) => {
        //FIXME Handle the case when `null` is returned (e.g. throwing a FormError).
        const base = speaker.getLeveledActorBase() as ActorBase
        const sex = getSex(base)

        return pipe(fallback[sex], getEmotionMapping)
    }

    return (speaker, emotion) => {
        const voiceForEmotion = pipe(
            voiceForActor(speaker),
            O.orElse(() => voiceForType(speaker)),
            O.getOrElse(() => voiceForSex(speaker))
        )

        return voiceForEmotion(emotion)
    }
}

export const AllTalkEndpoint = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("AllTalkEndpoint"),
    SC.annotations({
        title: "AllTalk Endpoint",
        description: "URL for the AllTalk TTS service endpoint"
    })
)

export type AllTalkEndpoint = typeof AllTalkEndpoint.Type

export const AllTalkSpeed = pipe(
    SC.Number,
    SC.clamp(0.25, 2.0),
    SC.brand("AllTalkSpeed"),
    SC.annotations({
        title: "AllTalk Speed",
        description: "Set the speed of the generated audio"
    })
)

export type AllTalkSpeed = typeof AllTalkSpeed.Type

export const AllTalkTemperature = pipe(
    SC.Number,
    SC.clamp(0.1, 1.0),
    SC.brand("AllTalkTemperature"),
    SC.annotations({
        title: "AllTalk Temperature",
        description: "Set the temperature for the TTS engine"
    })
)

export type AllTalkTemperature = typeof AllTalkTemperature.Type

export const AllTalkConfig = SC.Struct({
    endpoint: SC.optionalWith(AllTalkEndpoint, {
        default: () => AllTalkEndpoint.make("http://localhost:7851")
    }),
    speed: pipe(
        SC.optionalWith(AllTalkSpeed, {
            default: () => AllTalkSpeed.make(1.0)
        })
    ),
    temperature: SC.optionalWith(AllTalkTemperature, {
        default: () => AllTalkTemperature.make(1.0)
    }),
    voices: GenericVoiceMappingConfig
})

export type AllTalkConfig = typeof AllTalkConfig.Type

export function createAllTalkSpeechGenerator(
    config: AllTalkConfig,
    gameScheduler: Scheduler
): Effect<SpeechGenerator, never, HttpClient | FileSystem> {
    const Response = SC.Union(
        SC.Struct({
            status: SC.Literal("generate-success"),
            output_file_path: SC.String,
            output_file_url: SC.String,
            output_cache_url: SC.String
        }),
        SC.Struct({
            status: SC.Literal("generate-failure"),
            error: SC.String
        })
    )

    const {endpoint, speed, temperature, voices} = config

    const isLocal =
        endpoint.toLowerCase().includes("://localhost") ||
        endpoint.includes("://127.0.0.1")

    const voiceMappings = createGenericVoiceMapping(voices)

    const handleError =
        (message: string) =>
        <T>(e?: {_tag: T; message: string}) =>
            new TtsServiceError({
                message: e ? `${message}: ${e.message}` : `${message}.`,
                cause: e
            })

    const invalidRequest = handleError("Invalid request to the TTS service")
    const invalidResponse = handleError("Invalid response from the TTS service")
    const unknownError = handleError(
        "The request to the TTS service failed for an unknown reason"
    )

    const checkHttpResponse = (response: HttpClientResponse) =>
        FX.gen(function* () {
            const {status} = response

            if (status < 200 || status >= 300) {
                const text = yield* pipe(
                    response.text,
                    FX.map(text => `(${status}) ${text}`),
                    FX.catchAll(() => FX.succeed(status))
                )

                yield* new TtsServiceError({
                    message: `The TTS service responded with status: ${text}`
                })
            }

            return response
        })

    return FX.gen(function* () {
        const client = yield* HttpClient
        const fs = yield* FileSystem

        return (text, speaker, emotion) =>
            FX.gen(function* () {
                yield* FX.logDebug(`Generating speech for text: "${text}".`)

                const voice = yield* pipe(
                    FX.Do,
                    FX.bind("actor", () => getActor(speaker)),
                    FX.bind("voice", ({actor}) =>
                        FX.sync(() => voiceMappings(actor, emotion))
                    ),
                    FX.tap(({voice, actor}) =>
                        FX.logDebug(
                            `Using voice "${voice}" for actor ${actor.getDisplayName()}.`
                        )
                    ),
                    FX.map(({voice}) => voice),
                    FX.withScheduler(gameScheduler)
                )

                yield* FX.logTrace(
                    `temperature: ${temperature}, speed: ${speed}`
                )

                const form = new FormData()

                form.append("text_input", text)
                form.append("text_filtering", "standard")
                form.append("language", "en")
                form.append("character_voice_gen", `${voice}.wav`)
                form.append("narrator_enabled", "false")
                form.append("autoplay", "false")
                form.append("temperature", temperature.toString())
                form.append("speed", speed.toString())

                const response = yield* pipe(
                    client.post(`${endpoint}/api/tts-generate`, {
                        body: formData(form as globalThis.FormData)
                    }),
                    FX.catchTag("RequestError", invalidRequest),
                    FX.catchTag("ResponseError", invalidResponse),
                    FX.flatMap(checkHttpResponse)
                )

                const {output_file_path, output_file_url} = yield* pipe(
                    response.text,
                    FX.tap(text =>
                        FX.logDebug(`Response from the server: ${text}`)
                    ),
                    FX.flatMap(parseJson(Response)),
                    FX.catchTag("RequestError", invalidRequest),
                    FX.catchTag("ResponseError", invalidResponse),
                    FX.catchTag("InvalidDataError", invalidResponse),
                    FX.flatMap(r =>
                        r.status == "generate-success"
                            ? FX.succeed(r)
                            : handleError(
                                  `The server returned an error: ${r.error}`
                              )()
                    )
                )

                if (isLocal) {
                    yield* FX.logDebug(
                        `Speech file generated: ${output_file_path}.`
                    )

                    FX.addFinalizer(() =>
                        pipe(fs.remove(output_file_path), FX.ignore)
                    )

                    return pipe(
                        fs.stream(output_file_path),
                        ST.catchTag("BadArgument", unknownError),
                        ST.catchTag("SystemError", unknownError)
                    )
                } else {
                    yield* FX.logDebug(
                        `Speech file generated: ${output_file_url}.`
                    )

                    const {stream} = yield* pipe(
                        client.get([endpoint, output_file_url].join("")),
                        FX.catchTag("RequestError", invalidRequest),
                        FX.catchTag("ResponseError", invalidResponse),
                        FX.flatMap(checkHttpResponse)
                    )

                    return pipe(
                        stream,
                        ST.catchTag("ResponseError", unknownError)
                    )
                }
            })
    })
}
