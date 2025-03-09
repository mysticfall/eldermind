import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as SCH from "effect/Schedule"
import * as SR from "effect/SynchronizedRef"
import {Fiber, TestClock} from "effect"
import {
    executeWithVoice,
    getVoiceFilePath,
    NoAvailableVoiceFileError,
    VoiceFile,
    VoicePathConfig
} from "../../src/speech/Voice"
import {pipe} from "effect/Function"
import {Actor} from "@skyrim-platform/skyrim-platform"
import {ActorHexId} from "skyrim-effect/game/Actor"

describe("getVoiceFilePath", () => {
    const mockActorFemale: Actor = {
        getFormID: () => 0x000a2c94,
        getName: () => "Lydia",
        getActorOwner: () => ({
            getSex: () => 1
        }),
        getVoiceType: () => ({
            getName: () => "UniqueLydia"
        })
    } as unknown as Actor

    const mockActorMale: Actor = {
        getFormID: () => 0x000a2c95,
        getName: () => "Ulfric",
        getActorOwner: () => ({
            getSex: () => 0
        }),
        getVoiceType: () => ({
            getName: () => "MaleNord"
        })
    } as unknown as Actor

    it("should return a voice file path matching the given actor's voice type", () => {
        const config: VoicePathConfig = {
            root: "Sound/Voice/Eldermind.esp",
            fallback: {
                male: "MaleEvenToned",
                female: "FemaleEvenToned",
                none: "FemaleCommoner"
            }
        }

        const getPath = getVoiceFilePath(config)

        const result = getPath(mockActorMale)

        expect(result).toBe("Sound/Voice/Eldermind.esp/MaleNord")
    })

    it("should allow overriding voice files for unique actors", () => {
        const config: VoicePathConfig = {
            root: "Sound/Voice/Eldermind.esp",
            overrides: {
                [ActorHexId.make("000A2C94")]: "SomeModdedLydiaVoice"
            },
            fallback: {
                male: "MaleEvenToned",
                female: "FemaleEvenToned",
                none: "FemaleCommoner"
            }
        }

        const getPath = getVoiceFilePath(config)

        const result = getPath(mockActorFemale)

        expect(result).toBe("Sound/Voice/Eldermind.esp/SomeModdedLydiaVoice")
    })

    it("should use a gender specific path when no override exists for the given unique actor", () => {
        const config: VoicePathConfig = {
            root: "Sound/Voice/Eldermind.esp",
            fallback: {
                male: "MaleEvenToned",
                female: "FemaleEvenToned",
                none: "FemaleCommoner"
            }
        }

        const getPath = getVoiceFilePath(config)

        const result = getPath(mockActorFemale)

        expect(result).toBe("Sound/Voice/Eldermind.esp/FemaleEvenToned")
    })
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

                expect(message).toBe("No available voice files.")
            })
    )
})
