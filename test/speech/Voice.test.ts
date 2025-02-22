import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as SR from "effect/SynchronizedRef"
import {Fiber, pipe, TestClock} from "effect"
import {
    executeWithVoice,
    NoAvailableVoiceFileError,
    reserveVoiceFile,
    VoiceFile
} from "../../src/speech/Voice"

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
