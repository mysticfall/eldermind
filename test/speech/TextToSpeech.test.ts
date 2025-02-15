import {describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {Layer, pipe} from "effect"
import {FetchHttpClient} from "@effect/platform"
import {FileSystem} from "@effect/platform/FileSystem"
import {
    AllTalkConfig,
    AllTalkEndpoint,
    AllTalkSpeed,
    AllTalkTemperature,
    createAllTalkSpeechGenerator
} from "../../src/speech/TextToSpeech"
import {DialogueText} from "../../src/game/Dialogue"
import * as os from "node:os"
import * as path from "node:path"
import {NodeContext} from "@effect/platform-node"

describe("createAllTalkSpeechGenerator", () => {
    it.scoped(
        "should return a SpeechGenerator instance for an AllTalk TTS endpoint",
        () =>
            pipe(
                FX.gen(function* () {
                    const fs = yield* FileSystem
                    const mockFetch = vi.fn<typeof fetch>()

                    const FetchTest = Layer.succeed(
                        FetchHttpClient.Fetch,
                        mockFetch
                    )

                    const TestLayer = pipe(
                        FetchHttpClient.layer,
                        Layer.provide(FetchTest)
                    )

                    const generatedFile = yield* pipe(
                        fs.makeTempFile({
                            prefix: "alltalk-",
                            directory: os.tmpdir()
                        }),
                        FX.tap(path =>
                            fs.writeFileString(path, "Mock audio data")
                        )
                    )

                    yield* FX.addFinalizer(() =>
                        pipe(
                            fs.remove(path.dirname(generatedFile), {
                                force: true,
                                recursive: true
                            }),
                            FX.ignore
                        )
                    )

                    mockFetch.mockReturnValue(
                        Promise.resolve(
                            new Response(
                                JSON.stringify({
                                    status: "generate-success",
                                    output_file_path: generatedFile,
                                    output_file_url: "/audio/Dialogue001.wav",
                                    output_cache_url:
                                        "/audiocache/Dialogue001.wav"
                                })
                            )
                        )
                    )

                    const generate = yield* pipe(
                        createAllTalkSpeechGenerator({
                            endpoint: AllTalkEndpoint.make(
                                "http://localhost:8000"
                            ),
                            speed: AllTalkSpeed.make(0.7),
                            temperature: AllTalkTemperature.make(0.8)
                        }),
                        FX.provide(TestLayer)
                    )

                    const outputFile = path.join(
                        os.tmpdir(),
                        "eldermind",
                        "Dialogue001.wav"
                    )

                    yield* FX.addFinalizer(() =>
                        pipe(
                            fs.remove(path.dirname(outputFile), {
                                force: true,
                                recursive: true
                            }),
                            FX.ignore
                        )
                    )

                    yield* generate(
                        DialogueText.make("You never should've come here!"),
                        "FemaleYoungEager",
                        outputFile
                    )

                    expect(mockFetch).toHaveBeenCalledOnce()

                    const [url, body] = mockFetch.mock.calls[0] as [
                        URL,
                        RequestInit
                    ]

                    expect(url?.toString()).toBe(
                        "http://localhost:8000/api/tts-generate"
                    )

                    expect(body.method).toBe("POST")
                    expect(body.headers).toBeInstanceOf(Headers)

                    const headers = body.headers as Headers

                    expect(headers.get("content-type")).toBe(
                        "application/x-www-form-urlencoded"
                    )

                    expect(body.body).toBeDefined()

                    const form = body.body as FormData

                    expect(form.get("text_input")).toBe(
                        "You never should've come here!"
                    )
                    expect(form.get("character_voice_gen")).toBe(
                        "FemaleYoungEager.wav"
                    )
                    expect(form.get("narrator_enabled")).toBe("false")
                    expect(form.get("output_file_name")).toBe("Dialogue001.wav")
                    expect(form.get("output_file_timestamp")).toBe("false")
                    expect(form.get("autoplay")).toBe("false")
                    expect(form.get("temperature")).toBe("0.8")
                    expect(form.get("speed")).toBe("0.7")

                    const outputExists = yield* fs.exists(outputFile)
                    expect(outputExists).toBeTruthy()

                    const generatedFileExists = yield* fs.exists(generatedFile)
                    expect(generatedFileExists).toBeFalsy()

                    const content = yield* fs.readFileString(outputFile)

                    expect(content).toBe("Mock audio data")
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should download the generated file to the given path when a remote endpoint is used",
        () =>
            pipe(
                FX.gen(function* () {
                    const fs = yield* FileSystem
                    const mockFetch = vi.fn<typeof fetch>()

                    const FetchTest = Layer.succeed(
                        FetchHttpClient.Fetch,
                        mockFetch
                    )

                    const TestLayer = pipe(
                        FetchHttpClient.layer,
                        Layer.provide(FetchTest)
                    )

                    const generatedFile = yield* pipe(
                        fs.makeTempFile({
                            prefix: "alltalk-",
                            directory: os.tmpdir()
                        }),
                        FX.tap(path =>
                            fs.writeFileString(path, "Mock audio data")
                        )
                    )

                    yield* FX.addFinalizer(() =>
                        pipe(
                            fs.remove(path.dirname(generatedFile), {
                                force: true,
                                recursive: true
                            }),
                            FX.ignore
                        )
                    )

                    mockFetch.mockReturnValueOnce(
                        Promise.resolve(
                            new Response(
                                JSON.stringify({
                                    status: "generate-success",
                                    output_file_path: generatedFile,
                                    output_file_url: "/audio/Dialogue001.wav",
                                    output_cache_url:
                                        "/audiocache/Dialogue001.wav"
                                })
                            )
                        )
                    )

                    mockFetch.mockReturnValueOnce(
                        Promise.resolve(new Response("Mock audio data"))
                    )

                    const generate = yield* pipe(
                        createAllTalkSpeechGenerator(
                            AllTalkConfig.make({
                                endpoint: AllTalkEndpoint.make(
                                    "http://remote.alltalk.server"
                                )
                            })
                        ),
                        FX.provide(TestLayer)
                    )

                    const outputFile = path.join(
                        os.tmpdir(),
                        "eldermind",
                        "Dialogue001.wav"
                    )

                    yield* FX.addFinalizer(() =>
                        pipe(
                            fs.remove(path.dirname(outputFile), {
                                force: true,
                                recursive: true
                            }),
                            FX.ignore
                        )
                    )

                    yield* generate(
                        DialogueText.make("You never should've come here!"),
                        "FemaleYoungEager",
                        outputFile
                    )

                    expect(mockFetch).toHaveBeenCalledTimes(2)

                    const [url, body] = mockFetch.mock.calls[1] as [
                        URL,
                        RequestInit
                    ]

                    expect(url?.toString()).toBe(
                        "http://remote.alltalk.server/audio/Dialogue001.wav"
                    )

                    expect(body.method).toBe("GET")

                    const outputExists = yield* fs.exists(outputFile)
                    expect(outputExists).toBeTruthy()

                    const content = yield* fs.readFileString(outputFile)

                    expect(content).toBe("Mock audio data")
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should return a SpeechGenerator that throws TtsServiceError if it fails to connect to the server",
        () =>
            pipe(
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

                    const generator = yield* pipe(
                        createAllTalkSpeechGenerator(
                            AllTalkConfig.make({
                                endpoint: AllTalkEndpoint.make(
                                    "http://remote.alltalk.server"
                                )
                            })
                        ),
                        FX.provide(TestLayer)
                    )

                    const outputFile = path.join(
                        os.tmpdir(),
                        "eldermind",
                        "Dialogue001.wav"
                    )

                    const message = yield* pipe(
                        generator(
                            DialogueText.make("You never should've come here!"),
                            "FemaleYoungEager",
                            outputFile
                        ),
                        FX.catchAll(e => FX.succeed(e.message))
                    )

                    expect(message).toBe(
                        "The TTS service responded with status: 500"
                    )
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should return a SpeechGenerator that throws TtsServiceError if the server returns an invalid response",
        () =>
            pipe(
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

                    const generator = yield* pipe(
                        createAllTalkSpeechGenerator(
                            AllTalkConfig.make({
                                endpoint: AllTalkEndpoint.make(
                                    "http://remote.alltalk.server"
                                )
                            })
                        ),
                        FX.provide(TestLayer)
                    )

                    const outputFile = path.join(
                        os.tmpdir(),
                        "eldermind",
                        "Dialogue001.wav"
                    )

                    const message = yield* pipe(
                        generator(
                            DialogueText.make("You never should've come here!"),
                            "FemaleYoungEager",
                            outputFile
                        ),
                        FX.catchAll(e => FX.succeed(e.message))
                    )

                    expect(message).toBe(
                        "Invalid response from the TTS service: " +
                            "Unexpected token 'N', \"No Data\" is not valid JSON"
                    )
                }),
                FX.provide(NodeContext.layer)
            )
    )
})
