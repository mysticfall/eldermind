import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import {BaseError} from "../common/Error"
import {HttpClient} from "@effect/platform/HttpClient"
import {StockVoiceType} from "skyrim-effect/game/VoiceType"
import {DialogueText} from "../game/Dialogue"
import {pipe} from "effect"
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

export class TtsServiceError extends BaseError<TtsServiceError>(
    "TtsServiceError",
    {
        message: "Failed to generate an audio file from the given text."
    }
) {}

export type SpeechGenerator = (
    text: DialogueText,
    voice: StockVoiceType,
    outputFile: string
) => Effect<void, TtsServiceError | PlatformError, Scope>

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
    speed: SC.optionalWith(AllTalkSpeed, {
        default: () => AllTalkSpeed.make(1.0)
    }),
    temperature: SC.optionalWith(AllTalkTemperature, {
        default: () => AllTalkTemperature.make(1.0)
    })
})

export type AllTalkConfig = typeof AllTalkConfig.Type

export function createLocalAllTalkSpeechGenerator(
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

    const {endpoint, speed, temperature} = config

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

        return (text, voice, outputFile) =>
            FX.gen(function* () {
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
