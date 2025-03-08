import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as SCH from "effect/Schedule"
import * as SR from "effect/SynchronizedRef"
import {Fiber, TestClock} from "effect"
import {
    executeWithVoice,
    NoAvailableVoiceFileError,
    VoiceFile
} from "../../src/speech/Voice"
import {pipe} from "effect/Function"

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

                expect(message).toBe("No available voice files.")
            })
    )
})
