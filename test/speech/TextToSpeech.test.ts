import {describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as CH from "effect/Chunk"
import * as SI from "effect/Sink"
import * as ST from "effect/Stream"
import {Stream} from "effect/Stream"
import {Layer, pipe} from "effect"
import {FetchHttpClient} from "@effect/platform"
import {FileSystem} from "@effect/platform/FileSystem"
import {
    AllTalkConfig,
    AllTalkEndpoint,
    AllTalkSpeed,
    AllTalkTemperature,
    createAllTalkSpeechGenerator,
    createGenericVoiceMapping,
    GenericVoiceMappingConfig
} from "../../src/speech/TextToSpeech"
import {DialogueText} from "../../src/game/Dialogue"
import * as os from "node:os"
import * as path from "node:path"
import {NodeContext} from "@effect/platform-node"
import {Actor} from "@skyrim-platform/skyrim-platform"
import {ActorHexId} from "skyrim-effect/game/Actor"
import {BinaryData} from "../../src/common/Data"

describe("createGenericVoiceMapping", () => {
    const mockActorFemale: Actor = {
        getFormID: () => 0x000a2c94,
        getName: () => "Lydia",
        getBaseObject: () => ({
            getSex: () => 1
        }),
        getVoiceType: () => ({
            getName: () => "FemaleEvenToned"
        })
    } as unknown as Actor

    const mockActorMale: Actor = {
        getFormID: () => 0x000a2c95,
        getName: () => "Ulfric",
        getBaseObject: () => ({
            getSex: () => 0
        }),
        getVoiceType: () => ({
            getName: () => "MaleNord"
        })
    } as unknown as Actor

    it("should return a unique mapping if the actor's unique ID has a match", () => {
        const config: GenericVoiceMappingConfig = {
            unique: {
                [ActorHexId.make("000A2C94")]: "unique-voice-female",
                [ActorHexId.make("000A2C95")]: "unique-voice-male"
            },
            type: {},
            fallback: {
                female: "fallback-female",
                male: "fallback-male",
                none: "fallback-none"
            }
        }

        const voiceMapping = createGenericVoiceMapping(config)

        expect(voiceMapping(mockActorFemale)).toBe("unique-voice-female")
        expect(voiceMapping(mockActorMale)).toBe("unique-voice-male")
    })

    it("should return a voice type mapping if the type has a match and unique does not match", () => {
        const config: GenericVoiceMappingConfig = {
            type: {
                FemaleEvenToned: "type-voice-female",
                MaleNord: "type-voice-male"
            },
            fallback: {
                female: "fallback-female",
                male: "fallback-male",
                none: "fallback-none"
            }
        }

        const voiceMapping = createGenericVoiceMapping(config)

        expect(voiceMapping(mockActorFemale)).toBe("type-voice-female")
        expect(voiceMapping(mockActorMale)).toBe("type-voice-male")
    })

    it("should return a fallback mapping if neither unique nor type has a match", () => {
        const config: GenericVoiceMappingConfig = {
            fallback: {
                female: "fallback-female",
                male: "fallback-male",
                none: "fallback-none"
            }
        }

        const voiceMapping = createGenericVoiceMapping(config)

        expect(voiceMapping(mockActorFemale)).toBe("fallback-female")
        expect(voiceMapping(mockActorMale)).toBe("fallback-male")
    })

    it("should prioritize unique mapping over type and fallback", () => {
        const config: GenericVoiceMappingConfig = {
            unique: {
                [ActorHexId.make("000A2C94")]: "unique-voice-female"
            },
            type: {
                FemaleEvenToned: "type-voice-female",
                MaleNord: "type-voice-male"
            },
            fallback: {
                female: "fallback-female",
                male: "fallback-male",
                none: "fallback-none"
            }
        }

        const voiceMapping = createGenericVoiceMapping(config)

        expect(voiceMapping(mockActorFemale)).toBe("unique-voice-female")
        expect(voiceMapping(mockActorMale)).toBe("type-voice-male") // Falls back to type
    })

    it("should prioritize type mapping over fallback if unique mapping does not exist", () => {
        const config: GenericVoiceMappingConfig = {
            unique: {},
            type: {
                FemaleEvenToned: "type-voice-female",
                MaleNord: "type-voice-male"
            },
            fallback: {
                female: "fallback-female",
                male: "fallback-male",
                none: "fallback-none"
            }
        }

        const voiceMapping = createGenericVoiceMapping(config)

        expect(voiceMapping(mockActorFemale)).toBe("type-voice-female")
        expect(voiceMapping(mockActorMale)).toBe("type-voice-male")
    })

    it("should handle fallback mappings for actors with undefined sex", () => {
        const mockActorUndefinedSex = {
            getFormID: () => 0x000a2c96,
            getName: () => "Unknown",
            getBaseObject: () => ({
                getSex: () => undefined // No sex defined
            }),
            getVoiceType: () => undefined
        } as unknown as Actor

        const config: GenericVoiceMappingConfig = {
            type: {},
            fallback: {
                female: "fallback-female",
                male: "fallback-male",
                none: "fallback-none"
            }
        }

        const voiceMapping = createGenericVoiceMapping(config)

        expect(voiceMapping(mockActorUndefinedSex)).toBe("fallback-none")
    })
})

describe("createAllTalkSpeechGenerator", () => {
    const speaker = {
        getFormID: () => 0x000a2c94,
        getName: () => "Lydia",
        getBaseObject: () => ({
            getSex: () => 1
        }),
        getVoiceType: () => ({
            getName: () => "FemaleEvenToned"
        })
    } as unknown as Actor

    const readStream = <E>(stream: Stream<BinaryData, E>) =>
        pipe(
            ST.run(stream, SI.collectAll()),
            FX.flatMap(CH.head),
            FX.map(v => new TextDecoder().decode(v))
        )

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
                            temperature: AllTalkTemperature.make(0.8),
                            voices: {
                                fallback: {
                                    female: "female01",
                                    male: "male02",
                                    none: "female05"
                                }
                            }
                        }),
                        FX.provide(TestLayer)
                    )

                    const stream = yield* generate(
                        DialogueText.make("You never should've come here!"),
                        speaker
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
                    expect(form.get("character_voice_gen")).toBe("female01.wav")
                    expect(form.get("narrator_enabled")).toBe("false")
                    expect(form.get("autoplay")).toBe("false")
                    expect(form.get("temperature")).toBe("0.8")
                    expect(form.get("speed")).toBe("0.7")

                    const content = yield* readStream(stream)

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
                                ),
                                voices: {
                                    fallback: {
                                        female: "female01",
                                        male: "male02",
                                        none: "female05"
                                    }
                                }
                            })
                        ),
                        FX.provide(TestLayer)
                    )

                    const stream = yield* generate(
                        DialogueText.make("You never should've come here!"),
                        speaker
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

                    const content = yield* readStream(stream)

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
                                ),
                                voices: {
                                    fallback: {
                                        female: "female01",
                                        male: "male02",
                                        none: "female05"
                                    }
                                }
                            })
                        ),
                        FX.provide(TestLayer)
                    )

                    const message = yield* pipe(
                        generator(
                            DialogueText.make("You never should've come here!"),
                            speaker
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
                                ),
                                voices: {
                                    fallback: {
                                        female: "female01",
                                        male: "male02",
                                        none: "female05"
                                    }
                                }
                            })
                        ),
                        FX.provide(TestLayer)
                    )

                    const message = yield* pipe(
                        generator(
                            DialogueText.make("You never should've come here!"),
                            speaker
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
