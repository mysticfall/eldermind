import {installActorMocks, mockActors} from "../actor/mock"
import {describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as CH from "effect/Chunk"
import * as SC from "effect/Schema"
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
    GenericVoiceMappingConfig,
    TtsVoice
} from "../../src/speech/TextToSpeech"
import {DialogueText} from "../../src/speech/Dialogue"
import * as os from "node:os"
import * as path from "node:path"
import {NodeContext} from "@effect/platform-node"
import {getActorId} from "skyrim-effect/game/Actor"
import {BinaryData} from "../../src/data/Data"
import {Emotion, EmotionIntensity} from "../../src/actor/Emotion"
import {defaultScheduler} from "effect/Scheduler"

installActorMocks()

describe("createGenericVoiceMapping", () => {
    it.effect(
        "should return a mapping that can match the actor's voice type for a TTS model",
        () =>
            FX.gen(function* () {
                const config = yield* pipe(
                    {
                        voices: {
                            FemaleYoungEager: {
                                Neutral: "female_01"
                            },
                            FemaleEvenToned: {
                                Neutral: "female_02"
                            },
                            MaleNord: {
                                Neutral: "male_01"
                            },
                            MaleOldGrumpy: {
                                Neutral: "male_02"
                            }
                        },
                        fallback: {
                            female: {Neutral: "fallback-female"},
                            male: {Neutral: "fallback-male"},
                            none: {Neutral: "fallback-none"}
                        }
                    },
                    SC.decodeUnknown(GenericVoiceMappingConfig)
                )

                const voiceMapping = createGenericVoiceMapping(config)

                expect(voiceMapping(mockActors.Lydia)).toBe("female_02")
                expect(voiceMapping(mockActors.Ulfric)).toBe("male_01")
            })
    )

    it.effect(
        "should return a mapping over emotional ranges when specified",
        () =>
            FX.gen(function* () {
                const config = yield* pipe(
                    {
                        voices: {
                            FemaleYoungEager: {
                                Neutral: "female_01",
                                Happy: "female_01_happy",
                                Sad: "female_01_sad"
                            },
                            FemaleEvenToned: {
                                Neutral: "female_02",
                                Happy: "female_02_happy",
                                Sad: "female_02_sad"
                            },
                            MaleNord: {
                                Neutral: "male_01",
                                Happy: [
                                    {
                                        min: 0,
                                        max: 50,
                                        value: "male_01_happy"
                                    },
                                    {
                                        min: 51,
                                        max: 100,
                                        value: "male_01_very_happy"
                                    }
                                ],
                                Sad: "unique-voice-female-sad"
                            },
                            MaleOldGrumpy: {
                                Neutral: "male_02"
                            }
                        },
                        fallback: {
                            female: {Neutral: "fallback-female"},
                            male: {Neutral: "fallback-male"},
                            none: {Neutral: "fallback-none"}
                        }
                    },
                    SC.decodeUnknown(GenericVoiceMappingConfig)
                )

                const voiceMapping = createGenericVoiceMapping(config)

                const veryHappy = Emotion.make({
                    type: "Happy",
                    intensity: EmotionIntensity.make(60)
                })

                const fear = Emotion.make({
                    type: "Fear",
                    intensity: EmotionIntensity.make(30)
                })

                expect(voiceMapping(mockActors.Lydia, veryHappy)).toBe(
                    "female_02_happy"
                )

                expect(voiceMapping(mockActors.Ulfric, veryHappy)).toBe(
                    "male_01_very_happy"
                )

                expect(voiceMapping(mockActors.Ulfric, fear)).toBe("male_01")
            })
    )

    it.effect(
        "should return a mapping with a fallback for actors with a non-matching voice type",
        () =>
            FX.gen(function* () {
                const config = yield* pipe(
                    {
                        voices: {
                            FemaleYoungEager: {
                                Neutral: "female_01"
                            },
                            MaleCommoner: {
                                Neutral: "male_01"
                            }
                        },
                        fallback: {
                            female: {Neutral: "fallback-female"},
                            male: {Neutral: "fallback-male"},
                            none: {Neutral: "fallback-none"}
                        }
                    },
                    SC.decodeUnknown(GenericVoiceMappingConfig)
                )

                const voiceMapping = createGenericVoiceMapping(config)

                expect(voiceMapping(mockActors.Lydia)).toBe("fallback-female")
                expect(voiceMapping(mockActors.Ulfric)).toBe("fallback-male")
            })
    )
})

describe("createAllTalkSpeechGenerator", () => {
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
                        createAllTalkSpeechGenerator(
                            {
                                endpoint: AllTalkEndpoint.make(
                                    "http://localhost:8000"
                                ),
                                speed: AllTalkSpeed.make(0.7),
                                temperature: AllTalkTemperature.make(0.8),
                                voices: {
                                    fallback: {
                                        female: {
                                            Neutral: TtsVoice.make("female_01")
                                        },
                                        male: {
                                            Neutral: TtsVoice.make("male_02")
                                        },
                                        none: {
                                            Neutral: TtsVoice.make("female_05")
                                        }
                                    }
                                }
                            },
                            defaultScheduler
                        ),
                        FX.provide(TestLayer)
                    )

                    const stream = yield* generate(
                        DialogueText.make("You never should've come here!"),
                        getActorId(mockActors.Lydia)
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

                    const data = body.body as FormData

                    expect(data.get("text_input")).toBe(
                        "You never should've come here!"
                    )
                    expect(data.get("text_filtering")).toBe("standard")
                    expect(data.get("language")).toBe("en")
                    expect(data.get("character_voice_gen")).toBe(
                        "female_01.wav"
                    )
                    expect(data.get("narrator_enabled")).toBe("false")
                    expect(data.get("autoplay")).toBe("false")
                    expect(data.get("temperature")).toBe("0.8")
                    expect(data.get("speed")).toBe("0.7")

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
                                        female: {
                                            Neutral: TtsVoice.make("female01")
                                        },
                                        male: {
                                            Neutral: TtsVoice.make("male02")
                                        },
                                        none: {
                                            Neutral: TtsVoice.make("female05")
                                        }
                                    }
                                }
                            }),
                            defaultScheduler
                        ),
                        FX.provide(TestLayer)
                    )

                    const stream = yield* generate(
                        DialogueText.make("You never should've come here!"),
                        getActorId(mockActors.Lydia)
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
                                        female: {
                                            Neutral: TtsVoice.make("female01")
                                        },
                                        male: {
                                            Neutral: TtsVoice.make("male02")
                                        },
                                        none: {
                                            Neutral: TtsVoice.make("female05")
                                        }
                                    }
                                }
                            }),
                            defaultScheduler
                        ),
                        FX.provide(TestLayer)
                    )

                    const message = yield* pipe(
                        generator(
                            DialogueText.make("You never should've come here!"),
                            getActorId(mockActors.Lydia)
                        ),
                        FX.catchAll(e => FX.succeed(e.message))
                    )

                    expect(message).toBe(
                        "The TTS service responded with status: (500) Internal Server Error"
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
                                        female: {
                                            Neutral: TtsVoice.make("female01")
                                        },
                                        male: {
                                            Neutral: TtsVoice.make("male02")
                                        },
                                        none: {
                                            Neutral: TtsVoice.make("female05")
                                        }
                                    }
                                }
                            }),
                            defaultScheduler
                        ),
                        FX.provide(TestLayer)
                    )

                    const message = yield* pipe(
                        generator(
                            DialogueText.make("You never should've come here!"),
                            getActorId(mockActors.Lydia)
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
