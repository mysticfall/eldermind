import {describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {Layer, pipe} from "effect"
import {
    createOpenAICompatibleTranscriber,
    SttApiKey,
    SttEndpoint,
    SttModelId
} from "../../src/speech/SpeechToText"
import {FetchHttpClient} from "@effect/platform"

describe("createOpenAICompatibleTranscriber", () => {
    it.scoped(
        "should return a Transcriber instance for an OpenAI compatible endpoint",
        () =>
            FX.gen(function* () {
                const mockFetch = vi.fn<typeof fetch>()

                const FetchTest = Layer.succeed(
                    FetchHttpClient.Fetch,
                    mockFetch
                )

                const TestLayer = pipe(
                    FetchHttpClient.layer,
                    Layer.provide(FetchTest)
                )

                mockFetch.mockReturnValue(
                    Promise.resolve(
                        new Response(
                            JSON.stringify({
                                text: "You never should've come here!"
                            })
                        )
                    )
                )

                const transcriber = yield* pipe(
                    createOpenAICompatibleTranscriber({
                        apiKey: SttApiKey.make("secret"),
                        endpoint: SttEndpoint.make("http://localhost:8000"),
                        model: SttModelId.make("fast-whisper")
                    }),
                    FX.provide(TestLayer)
                )

                const data = new TextEncoder().encode("Mock audio data")

                const transcribe = yield* pipe(data, transcriber)

                expect(transcribe).toBe("You never should've come here!")

                expect(mockFetch).toHaveBeenCalledOnce()

                const [url, body] = mockFetch.mock.calls[0] as [
                    URL,
                    RequestInit
                ]

                expect(url?.toString()).toBe(
                    "http://localhost:8000/v1/audio/transcriptions"
                )

                expect(body.method).toBe("POST")

                const headers = new Headers(body.headers)

                expect(headers.get("authorization")).toBe("Bearer secret")
                expect(headers.get("content-type")).toBe("multipart/form-data")

                expect(body.body).toBeDefined()

                const form = body.body as FormData

                expect(form.get("model")).toBe("fast-whisper")
                expect(form.get("language")).toBe("en")
                expect(form.get("file")).toBeDefined()

                const file = form.get("file") as File

                expect(file.size).toBe(data.length)
            })
    )

    it.scoped(
        "should return a Transcriber that throws SttServiceError if it fails to connect to the server",
        () =>
            FX.gen(function* () {
                const mockFetch = vi.fn<typeof fetch>()

                const FetchTest = Layer.succeed(
                    FetchHttpClient.Fetch,
                    mockFetch
                )

                const TestLayer = pipe(
                    FetchHttpClient.layer,
                    Layer.provide(FetchTest)
                )

                mockFetch.mockReturnValue(
                    Promise.resolve(
                        new Response("Internal Server Error", {status: 500})
                    )
                )

                const transcriber = yield* pipe(
                    createOpenAICompatibleTranscriber({
                        apiKey: SttApiKey.make("secret"),
                        endpoint: SttEndpoint.make("http://localhost:8000"),
                        model: SttModelId.make("fast-whisper")
                    }),
                    FX.provide(TestLayer)
                )

                const data = new TextEncoder().encode("Mock audio data")

                const message = yield* pipe(
                    data,
                    transcriber,
                    FX.catchAll(e => FX.succeed(e.message))
                )

                expect(message).toBe(
                    "The STT service responded with an error: Internal Server Error"
                )
            })
    )

    it.scoped(
        "should return a Transcriber that throws SttServiceError if the server returns an invalid response",
        () =>
            FX.gen(function* () {
                const mockFetch = vi.fn<typeof fetch>()

                const FetchTest = Layer.succeed(
                    FetchHttpClient.Fetch,
                    mockFetch
                )

                const TestLayer = pipe(
                    FetchHttpClient.layer,
                    Layer.provide(FetchTest)
                )

                mockFetch.mockReturnValue(
                    Promise.resolve(new Response("No Data", {status: 200}))
                )

                const transcriber = yield* pipe(
                    createOpenAICompatibleTranscriber({
                        apiKey: SttApiKey.make("secret"),
                        endpoint: SttEndpoint.make("http://localhost:8000"),
                        model: SttModelId.make("fast-whisper")
                    }),
                    FX.provide(TestLayer)
                )

                const data = new TextEncoder().encode("Mock audio data")

                const message = yield* pipe(
                    data,
                    transcriber,
                    FX.catchAll(e => FX.succeed(e.message))
                )

                expect(message).toBe(
                    "Invalid response from the STT service: " +
                        "Unexpected token 'N', \"No Data\" is not valid JSON"
                )
            })
    )
})
