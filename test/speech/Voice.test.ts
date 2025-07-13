import {installActorMocks, mockActors} from "../actor/mock"
import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as FS from "@effect/platform/FileSystem"
import * as SC from "effect/Schema"
import * as SCH from "effect/Schedule"
import * as SR from "effect/SynchronizedRef"
import {Fiber, TestClock} from "effect"
import {
    createVoicePathResolver,
    executeWithVoice,
    getVoicePoolForEmotion,
    NoAvailableVoiceFileError,
    VoiceFile,
    VoiceFilesEmotionRangeMap,
    VoiceFolderConfig
} from "../../src/speech/Voice"
import {pipe} from "effect/Function"
import {getActorHexId, getActorId} from "skyrim-effect/game/Actor"
import {Emotion, EmotionIntensity, EmotionType} from "../../src/actor/Emotion"
import {createGamePaths} from "../../src/data/Service"
import {FilePath} from "../../src/data/File"
import {NodePath} from "@effect/platform-node"

installActorMocks()

const createEmotion = (type: EmotionType, intensity: number): Emotion => ({
    type,
    intensity: EmotionIntensity.make(intensity)
})

describe("createVoicePathResolver", () => {
    const baseDir = FilePath.make("/home/user/skyrim")

    const gamePaths = createGamePaths({baseDir})

    const mockFileSystem = FS.layerNoop({
        exists: () => FX.succeed(true),
        access: () => FX.void
    })

    const voiceFile = VoiceFile.make("Eldermind_Dialogue_00001827_1")

    it.effect(
        "should return a voice file path matching the given actor's voice type",
        () => {
            const test = FX.gen(function* () {
                const config = yield* pipe(
                    {
                        fallback: {
                            male: "MaleEvenToned",
                            female: "FemaleEvenToned",
                            none: "FemaleCommoner"
                        }
                    },
                    SC.decodeUnknown(VoiceFolderConfig)
                )

                const resolver = createVoicePathResolver(config)

                const {wav, lip} = yield* resolver(
                    getActorId(mockActors.Ulfric),
                    voiceFile
                )

                const voiceRoot = `${baseDir}/Data/Sound/Voice/Eldermind.esp/MaleNord`

                expect(wav).toBe(`${voiceRoot}/${voiceFile}.wav`)
                expect(lip).toBe(`${voiceRoot}/${voiceFile}.lip`)
            })

            return pipe(
                test,
                FX.provide(gamePaths),
                FX.provide(NodePath.layer),
                FX.provide(mockFileSystem)
            )
        }
    )

    it.effect("should return a voice file path with a custom mod name", () => {
        const test = FX.gen(function* () {
            const config = yield* pipe(
                {
                    modName: "MyMod.esm",
                    fallback: {
                        male: "MaleEvenToned",
                        female: "FemaleEvenToned",
                        none: "FemaleCommoner"
                    }
                },
                SC.decodeUnknown(VoiceFolderConfig)
            )

            const resolver = createVoicePathResolver(config)

            const {wav, lip} = yield* resolver(
                getActorId(mockActors.Ulfric),
                voiceFile
            )

            const voiceRoot = `${baseDir}/Data/Sound/Voice/MyMod.esm/MaleNord`

            expect(wav).toBe(`${voiceRoot}/${voiceFile}.wav`)
            expect(lip).toBe(`${voiceRoot}/${voiceFile}.lip`)
        })

        return pipe(
            test,
            FX.provide(gamePaths),
            FX.provide(NodePath.layer),
            FX.provide(mockFileSystem)
        )
    })

    it.effect("should allow overriding voice files for unique actors", () => {
        const test = FX.gen(function* () {
            const config = yield* pipe(
                {
                    overrides: {
                        [getActorHexId(mockActors.Lydia)]:
                            "SomeModdedLydiaVoice"
                    },
                    fallback: {
                        male: "MaleEvenToned",
                        female: "FemaleEvenToned",
                        none: "FemaleCommoner"
                    }
                },
                SC.decodeUnknown(VoiceFolderConfig)
            )

            const resolver = createVoicePathResolver(config)
            const {wav, lip} = yield* resolver(
                getActorId(mockActors.Lydia),
                voiceFile
            )

            const voiceRoot = `${baseDir}/Data/Sound/Voice/Eldermind.esp/SomeModdedLydiaVoice/`

            expect(wav).toBe(`${voiceRoot}${voiceFile}.wav`)
            expect(lip).toBe(`${voiceRoot}${voiceFile}.lip`)
        })

        return pipe(
            test,
            FX.provide(gamePaths),
            FX.provide(NodePath.layer),
            FX.provide(mockFileSystem)
        )
    })

    it.effect(
        "should use a gender-specific path when no override exists for the given unique actor",
        () => {
            const test = FX.gen(function* () {
                const config = yield* pipe(
                    {
                        fallback: {
                            male: "MaleEvenToned",
                            female: "FemaleEvenToned",
                            none: "FemaleCommoner"
                        }
                    },
                    SC.decodeUnknown(VoiceFolderConfig)
                )

                const resolver = createVoicePathResolver(config)
                const {wav, lip} = yield* resolver(
                    getActorId(mockActors.Lydia),
                    voiceFile
                )

                const voiceRoot = `${baseDir}/Data/Sound/Voice/Eldermind.esp/FemaleEvenToned/`

                expect(wav).toBe(`${voiceRoot}${voiceFile}.wav`)
                expect(lip).toBe(`${voiceRoot}${voiceFile}.lip`)
            })

            return pipe(
                test,
                FX.provide(gamePaths),
                FX.provide(NodePath.layer),
                FX.provide(mockFileSystem)
            )
        }
    )
})

describe("getVoicePoolForEmotion", () => {
    it.effect(
        "should return the correct pool for a specific emotion type and intensity",
        () =>
            FX.gen(function* () {
                const happyEmotionRanges = [
                    {
                        min: 0,
                        max: 50,
                        value: ["happy-low"]
                    },
                    {
                        min: 51,
                        max: 100,
                        value: ["happy-high"]
                    }
                ]

                const emotionMap = yield* pipe(
                    {
                        Neutral: ["neutral-voice1", "neutral-voice2"],
                        Happy: happyEmotionRanges,
                        Sad: ["sad-general"]
                    },
                    SC.decodeUnknown(VoiceFilesEmotionRangeMap)
                )

                const voicePoolForEmotion =
                    yield* getVoicePoolForEmotion(emotionMap)

                const neutralEmotion = createEmotion("Neutral", 100)
                const happyEmotionLow = createEmotion("Happy", 30)
                const happyEmotionHigh = createEmotion("Happy", 75)
                const sadEmotion = createEmotion("Sad", 50)
                const angryEmotion = createEmotion("Anger", 80)

                const neutralPool = yield* voicePoolForEmotion(neutralEmotion)
                const happyPoolLow = yield* voicePoolForEmotion(happyEmotionLow)
                const happyPoolHigh =
                    yield* voicePoolForEmotion(happyEmotionHigh)
                const sadPool = yield* voicePoolForEmotion(sadEmotion)
                const angerPool = yield* voicePoolForEmotion(angryEmotion)

                expect(neutralPool).toEqual(
                    new Set(["neutral-voice1", "neutral-voice2"])
                )

                expect(happyPoolLow).toEqual(new Set(["happy-low"]))
                expect(happyPoolHigh).toEqual(new Set(["happy-high"]))
                expect(sadPool).toEqual(new Set(["sad-general"]))

                expect(angerPool).toEqual(
                    new Set(["neutral-voice1", "neutral-voice2"])
                )
            })
    )

    it.effect(
        "should return fallback pool when emotion type is not mapped",
        () =>
            FX.gen(function* () {
                const emotionMap: VoiceFilesEmotionRangeMap = {
                    Neutral: new Set([
                        VoiceFile.make("neutral-voice1"),
                        VoiceFile.make("neutral-voice2")
                    ])
                }

                const voicePoolForEmotion =
                    yield* getVoicePoolForEmotion(emotionMap)

                const fearEmotion = createEmotion("Fear", 30)

                const fallbackPool = yield* voicePoolForEmotion(fearEmotion)

                expect(fallbackPool).toEqual(
                    new Set(["neutral-voice1", "neutral-voice2"])
                )
            })
    )

    it.effect(
        "should return the neutral fallback pool when no specific emotion ranges exist",
        () =>
            FX.gen(function* () {
                const neutralPoolSet = new Set([
                    VoiceFile.make("neutral-1"),
                    VoiceFile.make("neutral-2")
                ])

                const emotionMap: VoiceFilesEmotionRangeMap = {
                    Neutral: neutralPoolSet
                }

                const voicePoolForEmotion =
                    yield* getVoicePoolForEmotion(emotionMap)

                const emotion = createEmotion("Happy", 20)

                const pool = yield* voicePoolForEmotion(emotion)

                expect(pool).toEqual(neutralPoolSet)
            })
    )
})

describe("executeWithVoice", () => {
    it.effect(
        "should execute the task with a reserved voice file and release it after the task",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(
                    new Set([
                        VoiceFile.make("voice1"),
                        VoiceFile.make("voice2")
                    ])
                )

                const runTask = executeWithVoice(pool)

                const result = yield* runTask(f =>
                    FX.succeed(`Voice File: ${f}`)
                )

                expect(result).toBe("Voice File: voice1")

                expect(yield* SR.get(pool)).toEqual(
                    new Set([
                        VoiceFile.make("voice2"),
                        VoiceFile.make("voice1")
                    ])
                )
            })
    )

    it.effect(
        "should propagate errors from the task while releasing the voice file to the pool",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(new Set([VoiceFile.make("voice1")]))

                const runTask = executeWithVoice(pool)

                const result = yield* pipe(
                    runTask(f => FX.fail(`Voice File: ${f}`)),
                    FX.catchAll(FX.succeed)
                )

                expect(result).toBe("Voice File: voice1")

                expect(yield* SR.get(pool)).toEqual(
                    new Set([VoiceFile.make("voice1")])
                )
            })
    )

    it.effect(
        "should retry acquiring a voice file and execute the task when one becomes available",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(new Set<VoiceFile>())
                const runTask = executeWithVoice(pool)

                const fiber = yield* FX.fork(
                    runTask(file => FX.succeed(`Task completed with ${file}`))
                )

                yield* TestClock.adjust("2 seconds")

                yield* pipe(pool, SR.set(new Set([VoiceFile.make("voice1")])))

                yield* TestClock.adjust("2 seconds")

                const result = yield* Fiber.join(fiber)

                expect(result).toBe("Task completed with voice1")
            })
    )

    it.effect("should use a custom retry schedule when specified", () =>
        FX.gen(function* () {
            const pool = yield* SR.make(new Set<VoiceFile>())
            const runTask = executeWithVoice(
                pool,
                SCH.addDelay(SCH.recurs(1), () => "30 second")
            )

            const fiber = yield* FX.fork(
                runTask(file => FX.succeed(`Task completed with ${file}`))
            )

            yield* TestClock.adjust("29 seconds")

            yield* pipe(pool, SR.set(new Set([VoiceFile.make("voice1")])))

            yield* TestClock.adjust("1 seconds")

            const result = yield* Fiber.join(fiber)

            expect(result).toBe("Task completed with voice1")
        })
    )

    it.effect(
        "should throw NoAvailableVoiceFileError if no voice file becomes available",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(new Set<VoiceFile>())
                const runTask = executeWithVoice(pool)

                const fiber = yield* FX.fork(
                    runTask(file => FX.succeed(`Task completed with ${file}`))
                )

                yield* TestClock.adjust("30 seconds")

                const message = yield* pipe(
                    Fiber.join(fiber),
                    FX.catchTag(
                        "NoAvailableVoiceFileError",
                        (e: NoAvailableVoiceFileError) => FX.succeed(e.message)
                    )
                )

                expect(message).toBe("No available voice file.")
            })
    )
})
