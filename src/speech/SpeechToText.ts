import * as SC from "effect/Schema"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as O from "effect/Option"
import {BaseError} from "../common/Error"
import {pipe} from "effect"
import {HttpClient} from "@effect/platform/HttpClient"
import {FormData} from "formdata-node"
import {formData} from "@effect/platform/HttpBody"
import {Scope} from "effect/Scope"
import {parseJson} from "../data/Json"
import {DialogueText} from "./Dialogue"
import {BinaryData} from "../data/Data"

export class SttServiceError extends BaseError<SttServiceError>(
    "SttServiceError",
    {
        message: "Failed to transcribe the audio file."
    }
) {}

export const SttModelId = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("SttModelId"),
    SC.annotations({
        title: "STT Model ID",
        description: "Identifier for the STT model"
    })
)

export type SttModelId = typeof SttModelId.Type

export const SttApiKey = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("SttApiKey"),
    SC.annotations({
        title: "STT API Key",
        description: "API key for the STT service provider"
    })
)

export type SttApiKey = typeof SttApiKey.Type

export const SttEndpoint = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("SttEndpoint"),
    SC.annotations({
        title: "STT Endpoint",
        description: "URL for the Stt service endpoint"
    })
)

export type SttEndPoint = typeof SttEndpoint.Type

export const TranscriberConfig = SC.Struct({
    model: SC.optionalWith(SttModelId, {
        default: () => SttModelId.make("whisper-1")
    }),
    endpoint: SC.optionalWith(SttEndpoint, {
        default: () => SttEndpoint.make("https://api.openai.com")
    }),
    apiKey: SC.optional(SttApiKey)
})

export type TranscriberConfig = typeof TranscriberConfig.Type

export interface TranscriberOptions {
    readonly prompt?: string
    readonly hotWords?: string
}

export type Transcriber = (
    data: BinaryData,
    options?: TranscriberOptions
) => Effect<DialogueText, SttServiceError, Scope>

export function createOpenAICompatibleTranscriber(
    config: TranscriberConfig
): Effect<Transcriber, never, HttpClient> {
    const Response = SC.Struct({
        text: DialogueText
    })

    const {endpoint, model, apiKey} = config

    const headers = pipe(
        apiKey,
        O.fromNullable,
        O.map(v => ({Authorization: `Bearer ${v}`})),
        O.getOrElse(() => ({}))
    )

    return FX.gen(function* () {
        const client = yield* HttpClient

        return (data, options) =>
            FX.gen(function* () {
                const form = new FormData()

                form.append("model", model)
                form.append("language", "en")
                form.append(
                    "file",
                    new File([data], "recording.wav", {type: "audio/x-wav"})
                )

                if (options?.prompt) {
                    form.append("prompt", options.prompt)
                }

                if (options?.hotWords) {
                    form.append("hotwords", options.hotWords)
                }

                const response = yield* pipe(
                    client.post(`${endpoint}/v1/audio/transcriptions`, {
                        headers,
                        body: formData(form as globalThis.FormData)
                    }),
                    FX.catchAll(
                        e =>
                            new SttServiceError({
                                message: `Failed to connect to the STT service: ${e.message}`,
                                cause: e
                            })
                    )
                )

                if (response.status < 200 || response.status >= 300) {
                    yield* pipe(
                        response.text,
                        FX.catchAll(e => FX.succeed(e.message)),
                        FX.flatMap(
                            msg =>
                                new SttServiceError({
                                    message: `The STT service responded with an error: ${msg}`
                                })
                        )
                    )
                }

                const {text: transcription} = yield* pipe(
                    response.text,
                    FX.flatMap(parseJson(Response)),
                    FX.catchAll(
                        e =>
                            new SttServiceError({
                                message: `Invalid response from the STT service: ${e.message}`,
                                cause: e
                            })
                    )
                )

                yield* FX.logDebug(`Transcribed result: "${transcription}"`)

                return transcription
            })
    })
}
