import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as E from "effect/Either"
import * as FX from "effect/Effect"
import * as SC from "effect/Schema"
import * as SR from "effect/SynchronizedRef"
import {Fiber, TestClock} from "effect"
import {
    executeWithVoice,
    NoAvailableVoiceFileError,
    reserveVoiceFile,
    reserveVoiceFileForEmotion,
    VoiceFile,
    VoiceFileEmotionMap,
    VoiceIntensityMap,
    VoiceIntensityRange
} from "../../src/speech/Voice"
import {pipe} from "effect/Function"
import {EmotionIntensity} from "../../src/actor/Emotion"

describe("VoiceIntensityRange", () => {
    it("should validate a valid voice intensity range", () => {
        const validRange = {
            min: 0,
            max: 50,
            voices: [VoiceFile.make("voice1"), VoiceFile.make("voice2")]
        }

        const result = pipe(
            validRange,
            SC.decodeUnknownEither(VoiceIntensityRange)
        )

        expect(result).toSatisfy(E.isRight)
    })

    it("should fail validation if min > max", () => {
        const invalidRange = {
            min: 60,
            max: 50,
            voices: [VoiceFile.make("voice1")]
        }

        const message = pipe(
            invalidRange,
            SC.decodeUnknownEither(VoiceIntensityRange),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toBe(
            "Voice Intensity Range\n" +
                "└─ Predicate refinement failure\n" +
                '   └─ The "min" value (60) must be less than the "max" value (50).'
        )
    })

    it("should fail validation for out-of-range min value", () => {
        const invalidRange = {
            min: -10,
            max: 80,
            voices: [VoiceFile.make("voice1")]
        }

        const message = pipe(
            invalidRange,
            SC.decodeUnknownEither(VoiceIntensityRange),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toMatch(/Expected Emotion intensity .+, actual -10/)
    })

    it("should fail validation for out-of-range max value", () => {
        const invalidRange = {
            min: 10,
            max: 120,
            voices: [VoiceFile.make("voice1")]
        }

        const message = pipe(
            invalidRange,
            SC.decodeUnknownEither(VoiceIntensityRange),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toMatch(/Expected Emotion intensity .+, actual 120/)
    })
})

describe("VoiceIntensityMap", () => {
    it("should validate a valid voice intensity map covering 0-100", () => {
        const validMap = [
            {min: 0, max: 50, voices: [VoiceFile.make("voice1")]},
            {min: 51, max: 100, voices: [VoiceFile.make("voice2")]}
        ]

        const result = pipe(validMap, SC.decodeUnknownEither(VoiceIntensityMap))

        expect(result).toSatisfy(E.isRight)
    })

    it("should fail validation if ranges are not contiguous", () => {
        const invalidMap = [
            {min: 0, max: 40, voices: [VoiceFile.make("voice1")]},
            {min: 42, max: 100, voices: [VoiceFile.make("voice2")]}
        ]

        const message = pipe(
            invalidMap,
            SC.decodeUnknownEither(VoiceIntensityMap),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toBe(
            "Voice Intensity Map\n└─ " +
                "Predicate refinement failure\n" +
                "   └─ Voice intensity map must be contiguous."
        )
    })

    it("should fail validation if the full range 0-100 is not covered", () => {
        const invalidMap = [
            {min: 0, max: 30, voices: [VoiceFile.make("voice1")]},
            {min: 31, max: 90, voices: [VoiceFile.make("voice2")]}
        ]

        const message = pipe(
            invalidMap,
            SC.decodeUnknownEither(VoiceIntensityMap),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toBe(
            "Voice Intensity Map\n" +
                "└─ Predicate refinement failure\n" +
                "   └─ Voice intensity map must cover the full range of intensity (0-100)."
        )
    })

    it("should fail validation for overlapping ranges", () => {
        const invalidMap = [
            {min: 0, max: 60, voices: [VoiceFile.make("voice1")]},
            {min: 50, max: 100, voices: [VoiceFile.make("voice2")]}
        ]

        const message = pipe(
            invalidMap,
            SC.decodeUnknownEither(VoiceIntensityMap),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toBe(
            "Voice Intensity Map\n" +
                "└─ Predicate refinement failure\n" +
                "   └─ Voice intensity map must be contiguous."
        )
    })

    it("should allow a minimal valid configuration", () => {
        const validMinimalMap = [
            {min: 0, max: 100, voices: [VoiceFile.make("voice1")]}
        ]

        const result = pipe(
            validMinimalMap,
            SC.decodeUnknownEither(VoiceIntensityMap)
        )

        expect(result).toSatisfy(E.isRight)
    })
})

describe("reserveVoiceFile", () => {
    it.effect(
        "should return a voice file from the pool if one is available",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(
                    new Set([
                        VoiceFile.make("voice1"),
                        VoiceFile.make("voice2")
                    ])
                )

                const voice1 = yield* reserveVoiceFile(pool)

                expect(voice1.file).toBe("voice1")

                expect(yield* SR.get(pool)).toEqual(
                    new Set([VoiceFile.make("voice2")])
                )

                const voice2 = yield* reserveVoiceFile(pool)

                expect(voice2.file).toBe("voice2")
                expect(yield* SR.get(pool)).toEqual(new Set())
            })
    )

    it.effect(
        "should return the file to the pool after release is called",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(
                    new Set([
                        VoiceFile.make("voice1"),
                        VoiceFile.make("voice2")
                    ])
                )

                const voice1 = yield* reserveVoiceFile(pool)
                const voice2 = yield* reserveVoiceFile(pool)

                expect(yield* SR.get(pool)).toEqual(new Set())

                yield* voice2.release

                expect(yield* SR.get(pool)).toEqual(
                    new Set([VoiceFile.make("voice2")])
                )

                yield* voice1.release

                expect(yield* SR.get(pool)).toEqual(
                    new Set([
                        VoiceFile.make("voice2"),
                        VoiceFile.make("voice1")
                    ])
                )
            })
    )

    it.effect(
        "should retry to acquire a voice file if none is available initially",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(new Set([VoiceFile.make("voice1")]))

                const {release} = yield* reserveVoiceFile(pool)

                const fiber = yield* FX.fork(reserveVoiceFile(pool))

                yield* TestClock.adjust("1 seconds")

                yield* release

                yield* TestClock.adjust("2 seconds")

                const voice = yield* Fiber.join(fiber)

                expect(voice.file).toBe("voice1")
            })
    )

    it.effect(
        "should throw NoAvailableVoiceFileError if retries are exhausted",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(new Set([VoiceFile.make("voice1")]))

                yield* reserveVoiceFile(pool)

                const fiber = yield* FX.fork(reserveVoiceFile(pool))

                yield* TestClock.adjust("10 seconds")

                const message = yield* pipe(
                    Fiber.join(fiber),
                    FX.catchTag(
                        "NoAvailableVoiceFileError",
                        (e: NoAvailableVoiceFileError) => FX.succeed(e.message)
                    )
                )

                expect(message).toBe("No available voice files.")
            })
    )
})

describe("reserveVoiceFileForEmotion", () => {
    it.effect("should create pools for Neutral emotion", () =>
        FX.gen(function* () {
            const voices = new Set([
                VoiceFile.make("neutral_voice1"),
                VoiceFile.make("neutral_voice2")
            ])

            const emotions: VoiceFileEmotionMap = {
                Neutral: voices
            }

            const findPool = yield* reserveVoiceFileForEmotion(emotions)

            const neutralPool = findPool({
                type: "Neutral",
                intensity: EmotionIntensity.make(50)
            })

            const retrieved = yield* SR.get(neutralPool)

            expect(retrieved).toEqual(voices)
        })
    )

    it.effect(
        "should create separate pools for other emotions using VoiceIntensityMap",
        () =>
            FX.gen(function* () {
                const happyVoicesRange1 = {
                    min: EmotionIntensity.make(0),
                    max: EmotionIntensity.make(50),
                    voices: new Set([VoiceFile.make("happy_voice1")])
                }

                const happyVoicesRange2 = {
                    min: EmotionIntensity.make(51),
                    max: EmotionIntensity.make(100),
                    voices: new Set([VoiceFile.make("happy_voice2")])
                }

                const emotions: VoiceFileEmotionMap = {
                    Neutral: new Set([VoiceFile.make("neutral_voice")]),
                    Happy: [happyVoicesRange1, happyVoicesRange2]
                }

                const findPool = yield* reserveVoiceFileForEmotion(emotions)

                const happyPool1 = findPool({
                    type: "Happy",
                    intensity: EmotionIntensity.make(25)
                })

                const retrievedHappyPool1 = yield* SR.get(happyPool1)

                expect(retrievedHappyPool1).toEqual(happyVoicesRange1.voices)

                const happyPool2 = findPool({
                    type: "Happy",
                    intensity: EmotionIntensity.make(75)
                })

                const retrievedHappyPool2 = yield* SR.get(happyPool2)

                expect(retrievedHappyPool2).toEqual(happyVoicesRange2.voices)
            })
    )

    it.effect("should fallback to Neutral pool for unconfigured emotions", () =>
        FX.gen(function* () {
            const fallbackVoices = new Set([VoiceFile.make("neutral_voice")])

            const emotions: VoiceFileEmotionMap = {
                Neutral: fallbackVoices
            }

            const findPool = yield* reserveVoiceFileForEmotion(emotions)

            const unconfiguredPool = findPool({
                type: "Anger",
                intensity: EmotionIntensity.make(75)
            })

            const retrieved = yield* SR.get(unconfiguredPool)

            expect(retrieved).toEqual(fallbackVoices)
        })
    )

    it.effect(
        "should handle mixed configuration with sets and intensity ranges",
        () =>
            FX.gen(function* () {
                const happyVoices = new Set([VoiceFile.make("happy_voice")])

                const angryVoices = [
                    {
                        min: EmotionIntensity.make(0),
                        max: EmotionIntensity.make(50),
                        voices: new Set([VoiceFile.make("anger_voice1")])
                    },
                    {
                        min: EmotionIntensity.make(51),
                        max: EmotionIntensity.make(100),
                        voices: new Set([VoiceFile.make("anger_voice2")])
                    }
                ]

                const emotions: VoiceFileEmotionMap = {
                    Neutral: new Set([VoiceFile.make("neutral_voice")]),
                    Happy: happyVoices,
                    Anger: angryVoices
                }

                const findPool = yield* reserveVoiceFileForEmotion(emotions)

                const happyPool = findPool({
                    type: "Happy",
                    intensity: EmotionIntensity.make(30)
                })

                const retrievedHappyPool = yield* SR.get(happyPool)

                expect(retrievedHappyPool).toEqual(happyVoices)

                const angerPool1 = findPool({
                    type: "Anger",
                    intensity: EmotionIntensity.make(20)
                })

                const retrievedAngerPool1 = yield* SR.get(angerPool1)

                expect(retrievedAngerPool1).toEqual(angryVoices[0].voices)

                const angerPool2 = findPool({
                    type: "Anger",
                    intensity: EmotionIntensity.make(80)
                })

                const retrievedAngerPool2 = yield* SR.get(angerPool2)

                expect(retrievedAngerPool2).toEqual(angryVoices[1].voices)
            })
    )
})

describe("executeWithVoice", () => {
    it.scoped(
        "should execute the task with a reserved voice file and release it after the task",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(
                    new Set([
                        VoiceFile.make("voice1"),
                        VoiceFile.make("voice2")
                    ])
                )

                const runTask = pipe(pool, reserveVoiceFile, executeWithVoice)

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

    it.scoped(
        "should propagate errors from the task while releasing the voice file to the pool",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(new Set([VoiceFile.make("voice1")]))

                const runTask = pipe(pool, reserveVoiceFile, executeWithVoice)

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

    it.scoped(
        "should retry acquiring a voice file and execute the task when one becomes available",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(new Set([VoiceFile.make("voice1")]))
                const runTask = pipe(pool, reserveVoiceFile, executeWithVoice)

                const {release} = yield* reserveVoiceFile(pool)

                const fiber = yield* FX.fork(
                    runTask(file => FX.succeed(`Task completed with ${file}`))
                )

                yield* TestClock.adjust("1 seconds")
                yield* release
                yield* TestClock.adjust("3 seconds")

                const result = yield* Fiber.join(fiber)

                expect(result).toBe("Task completed with voice1")
            })
    )

    it.scoped(
        "should throw NoAvailableVoiceFileError if no voice file becomes available",
        () =>
            FX.gen(function* () {
                const pool = yield* SR.make(new Set([VoiceFile.make("voice1")]))
                const runTask = pipe(pool, reserveVoiceFile, executeWithVoice)

                yield* reserveVoiceFile(pool)

                const fiber = yield* FX.fork(
                    runTask(file => FX.succeed(`Task completed with ${file}`))
                )

                yield* TestClock.adjust("10 seconds")

                const message = yield* pipe(
                    Fiber.join(fiber),
                    FX.catchTag(
                        "NoAvailableVoiceFileError",
                        (e: NoAvailableVoiceFileError) => FX.succeed(e.message)
                    )
                )

                expect(message).toBe("No available voice files.")
            })
    )
})
