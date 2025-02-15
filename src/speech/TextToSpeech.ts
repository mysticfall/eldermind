import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import {BaseError} from "../common/Error"
import {HttpClient} from "@effect/platform/HttpClient"
import {DialogueText} from "../game/Dialogue"
import {pipe} from "effect"
import * as O from "effect/Option"
import * as R from "effect/Record"
import * as SC from "effect/Schema"
import {FormData} from "formdata-node"
import {formData} from "@effect/platform/HttpBody"
import {FileSystem} from "@effect/platform/FileSystem"
import {parseJson} from "../common/Json"
import {PlatformError} from "@effect/platform/Error"
import {Scope} from "effect/Scope"
import * as path from "node:path"
import {HttpClientResponse} from "@effect/platform/HttpClientResponse"
import * as ST from "effect/Stream"
import {HttpClientError} from "@effect/platform/HttpClientError"
import {Actor, ActorBase} from "@skyrim-platform/skyrim-platform"
import {getStockVoiceType, StockVoiceType} from "skyrim-effect/game/VoiceType"
import {ActorHexId, getActorId, getSex, Sex} from "skyrim-effect/game/Actor"
import {toHexId} from "skyrim-effect/game/Form"

export class TtsServiceError extends BaseError<TtsServiceError>(
    "TtsServiceError",
    {
        message: "Failed to generate an audio file from the given text."
    }
) {}

export type SpeechGenerator = (
    text: DialogueText,
    speaker: Actor,
    outputFile: string
) => Effect<void, TtsServiceError | PlatformError, Scope>

export type VoiceMapping = (speaker: Actor) => string

export const GenericVoiceMappingConfig = pipe(
    SC.Struct({
        type: pipe(
            SC.Record({key: StockVoiceType, value: SC.String}),
            SC.partial,
            SC.optional
        ),
        unique: pipe(
            SC.Record({key: ActorHexId, value: SC.String}),
            SC.optional
        ),
        fallback: SC.Record({key: Sex, value: SC.String})
    }),
    SC.annotations({
        title: "Voice Mapping",
        description: "Mapping between actors and voice names"
    })
)

export type GenericVoiceMappingConfig = typeof GenericVoiceMappingConfig.Type

export function createGenericVoiceMapping(
    config: GenericVoiceMappingConfig
): VoiceMapping {
    const {type, unique, fallback} = config

    const voiceForActor = (speaker: Actor) =>
        pipe(
            O.Do,
            O.bind("mappings", () => O.fromNullable(unique)),
            O.bind("key", () =>
                pipe(speaker, getActorId, toHexId(ActorHexId), O.some)
            ),
            O.flatMap(({mappings, key}) => pipe(mappings, R.get(key)))
        )

    const voiceForType = (speaker: Actor) =>
        pipe(
            O.Do,
            O.bind("mappings", () => O.fromNullable(type)),
            O.bind("key", () => getStockVoiceType(speaker)),
            O.flatMap(({mappings, key}) => pipe(mappings[key], O.fromNullable))
        )

    const voiceForSex = (speaker: Actor) => {
        const base = speaker.getBaseObject() as ActorBase
        const sex = getSex(base)

        return fallback[sex]
    }

    return speaker =>
        pipe(
            voiceForActor(speaker),
            O.orElse(() => voiceForType(speaker)),
            O.getOrElse(() => voiceForSex(speaker))
        )
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
        default: () => AllTalkEndpoint.make("http://localhost:8000")
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
    config: AllTalkConfig
): Effect<SpeechGenerator, never, HttpClient | FileSystem> {
    const Response = SC.Struct({
        status: SC.Union(
            SC.Literal("generate-success"),
            SC.Literal("generate-failure")
        ),
        output_file_path: SC.String,
        output_file_url: SC.String,
        output_cache_url: SC.String
    })

    const {endpoint, speed, temperature, voices} = config

    return FX.gen(function* () {
        const client = yield* HttpClient
        const fs = yield* FileSystem

        const isLocal =
            endpoint.toLowerCase().includes("://localhost") ||
            endpoint.includes("://127.0.0.1")

        const checkHttpResponse = (response: HttpClientResponse) =>
            pipe(
                response,
                FX.liftPredicate(
                    r => r.status >= 200 && r.status < 300,
                    r =>
                        new TtsServiceError({
                            message: `The TTS service responded with status: ${r.status}`
                        })
                )
            )

        const handleConnectionError = (e: HttpClientError) =>
            new TtsServiceError({
                message: `Failed to connect to the TTS service: ${e.message}`,
                cause: e
            })

        const voiceMappings = createGenericVoiceMapping(voices)

        return (text, speaker, outputFile) =>
            FX.gen(function* () {
                const voice = voiceMappings(speaker)

                const fileName = path.basename(outputFile)

                const dir = path.dirname(outputFile)
                const dirExists = yield* fs.exists(dir)

                if (!dirExists) {
                    yield* fs.makeDirectory(dir, {recursive: true})
                }

                const form = new FormData()

                form.append("text_input", text)
                form.append("text_filtering", "standard")
                form.append("language", "en")
                form.append("character_voice_gen", `${voice}.wav`)
                form.append("narrator_enabled", false)
                form.append("output_file_name", fileName)
                form.append("output_file_timestamp", false)
                form.append("autoplay", false)
                form.append("temperature", temperature)
                form.append("speed", speed)

                const response = yield* pipe(
                    client.post(`${endpoint}/api/tts-generate`, {
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded"
                        },
                        body: formData(form as globalThis.FormData)
                    }),
                    FX.catchAll(handleConnectionError),
                    FX.flatMap(checkHttpResponse)
                )

                const {output_file_path, output_file_url} = yield* pipe(
                    response.text,
                    FX.flatMap(parseJson(Response)),
                    FX.catchAll(
                        e =>
                            new TtsServiceError({
                                message: `Invalid response from the TTS service: ${e.message}`,
                                cause: e
                            })
                    ),
                    FX.flatMap(r =>
                        r.status == "generate-success"
                            ? FX.succeed(r)
                            : new TtsServiceError({
                                  message:
                                      "The request to the TTS service failed for an unknown reason."
                              })
                    )
                )

                const exists = yield* fs.exists(outputFile)

                if (exists) {
                    yield* FX.logDebug(`Removing old TTS output: ${outputFile}`)
                    yield* fs.remove(outputFile)
                }

                if (isLocal) {
                    yield* FX.logDebug(
                        `Moving TTS output: from ${output_file_path} to ${outputFile}`
                    )

                    yield* fs.rename(output_file_path, outputFile)
                } else {
                    const {stream} = yield* pipe(
                        client.get([endpoint, output_file_url].join("")),
                        FX.catchAll(handleConnectionError),
                        FX.flatMap(checkHttpResponse)
                    )

                    yield* pipe(
                        ST.run(stream, fs.sink(outputFile)),
                        FX.catchAll(
                            e =>
                                new TtsServiceError({
                                    message: `Failed to download the output from the TTS service: ${e.message}`
                                })
                        )
                    )
                }
            })
    })
}
