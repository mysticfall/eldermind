import {afterEach, beforeEach, describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {createRecordingStream} from "../../src/speech/Recorder"
import * as DU from "effect/Duration"
import * as ST from "effect/Stream"
import {Chunk, pipe} from "effect"
import * as SCH from "effect/Schedule"
import {NodeContext} from "@effect/platform-node"
import {PassThrough} from "node:stream"
import fs from "fs"

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
    afterEach(() => {
        vi.unmock("node-microphone")
    })

    it.scopedLive(
        "should create a stream that starts emits the recorded audio",
        () => {
            const process = FX.gen(function* () {
                const ticks = yield* pipe(
                    100,
                    DU.millis,
                    SCH.spaced,
                    ST.fromSchedule,
                    ST.share({capacity: "unbounded"})
                )

                const onStart = yield* pipe(
                    ticks,
                    ST.filter(d => d == 0 || d == 5),
                    ST.share({capacity: "unbounded"})
                )

                const onStop = yield* pipe(
                    ticks,
                    ST.filter(d => d == 2 || d == 6),
                    ST.share({capacity: "unbounded"})
                )

                const stream = createRecordingStream({
                    startWhen: onStart,
                    stopWhen: onStop,
                    maxDuration: DU.seconds(1)
                })

                const recordings = yield* pipe(
                    stream,
                    ST.timeout(DU.seconds(1)),
                    ST.runCollect,
                    FX.map(Chunk.toReadonlyArray)
                )

                yield* FX.addFinalizer(() =>
                    FX.sync(() =>
                        recordings.forEach(r => fs.unlinkSync(r.file))
                    )
                )

                expect(recordings).toHaveLength(2)

                expect(recordings[0].file).satisfy(fs.existsSync)
                expect(recordings[1].file).satisfy(fs.existsSync)

                const duration1 = pipe(recordings[0].duration, DU.toMillis)
                const duration2 = pipe(recordings[1].duration, DU.toMillis)

                expect(duration1).toBeGreaterThan(180)
                expect(duration1).toBeLessThan(220)

                expect(duration2).toBeGreaterThan(80)
                expect(duration2).toBeLessThan(120)
            })

            return pipe(process, FX.provide(NodeContext.layer))
        }
    )

    it.scopedLive(
        "should end the recording when a stop event isn't received until the timeout",
        () => {
            const process = FX.gen(function* () {
                const stream = createRecordingStream({
                    startWhen: ST.make(true),
                    stopWhen: ST.never,
                    maxDuration: DU.seconds(1)
                })

                const recordings = yield* pipe(
                    stream,
                    ST.timeout(DU.seconds(2)),
                    ST.runCollect,
                    FX.map(Chunk.toReadonlyArray)
                )

                yield* FX.addFinalizer(() =>
                    FX.sync(() =>
                        recordings.forEach(r => fs.unlinkSync(r.file))
                    )
                )

                expect(recordings).toHaveLength(1)

                expect(recordings[0].file).satisfy(fs.existsSync)

                const duration = pipe(recordings[0].duration, DU.toSeconds)

                expect(duration).toBeGreaterThan(0.8)
                expect(duration).toBeLessThan(1.2)
            })

            return pipe(process, FX.provide(NodeContext.layer))
        }
    )
})
