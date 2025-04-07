import {afterEach, beforeEach, describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {createRecordingStream} from "../../src/speech/Recorder"
import * as DU from "effect/Duration"
import * as ST from "effect/Stream"
import {Chunk, Fiber, pipe, TestClock} from "effect"
import * as SCH from "effect/Schedule"
import {PassThrough} from "node:stream"

function installMocks() {
    vi.mock("node-microphone", () => ({
        default: vi.fn().mockImplementation(() => ({
            startRecording: vi.fn(() => {
                const readable = new PassThrough()

                process.nextTick(() => {
                    readable.emit("data", "Mock audio data")
                    readable.end()
                })
                return readable
            }),
            stopRecording: vi.fn()
        }))
    }))
}

describe("createRecordingStream", () => {
    beforeEach(installMocks)
    afterEach(() => vi.doUnmock("node-microphone"))

    const mockData = new TextEncoder().encode("Mock audio data")

    it.effect(
        "should create a stream that emits the recorded audio when receiving an event",
        () =>
            FX.gen(function* () {
                const stream = createRecordingStream({
                    event: pipe(DU.seconds(2), SCH.spaced, ST.fromSchedule),
                    maxDuration: DU.seconds(3)
                })

                const fiber = yield* pipe(
                    stream,
                    ST.take(2),
                    ST.runCollect,
                    FX.map(Chunk.toReadonlyArray),
                    FX.fork
                )

                yield* TestClock.adjust("8 seconds")

                const recordings = yield* Fiber.join(fiber)

                expect(recordings).toHaveLength(2)

                expect(recordings[0].data).toEqual(mockData)
                expect(recordings[1].data).toEqual(mockData)

                const duration1 = pipe(recordings[0].duration, DU.toMillis)
                const duration2 = pipe(recordings[1].duration, DU.toMillis)

                expect(duration1).toBe(2000)
                expect(duration2).toBe(2000)
            })
    )

    it.effect(
        "should end the recording when a stop event isn't received until the timeout",
        () =>
            FX.gen(function* () {
                const stream = createRecordingStream({
                    event: pipe(DU.seconds(1), SCH.fromDelay, ST.fromSchedule),
                    maxDuration: DU.seconds(1)
                })

                const fiber = yield* pipe(
                    stream,
                    ST.take(1),
                    ST.runCollect,
                    FX.map(Chunk.toReadonlyArray),
                    FX.fork
                )

                yield* TestClock.adjust("3 seconds")

                const recordings = yield* Fiber.join(fiber)

                expect(recordings).toHaveLength(1)

                expect(recordings[0].data).toEqual(mockData)

                const duration = pipe(recordings[0].duration, DU.toSeconds)

                expect(duration).toBeGreaterThan(0.8)
                expect(duration).toBeLessThan(1.2)
            })
    )
})
