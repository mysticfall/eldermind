import {afterEach, beforeEach, describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {
    convertToWav,
    createRecordingStream,
    Recording,
    RecordingOptions
} from "../../src/speech/Recorder"
import * as DU from "effect/Duration"
import * as ST from "effect/Stream"
import {Chunk, Fiber, pipe, TestClock} from "effect"
import * as SCH from "effect/Schedule"
import {PassThrough} from "node:stream"
import {NodeContext} from "@effect/platform-node"
import {CommandExecutor, Process} from "@effect/platform/CommandExecutor"

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

describe("convertToWav", () => {
    it("should create correct WAV header structure", () => {
        const inputData = new Uint8Array([1, 2, 3, 4]) // Simple test data

        const result = pipe(
            inputData,
            convertToWav({sampleRate: 44100, bitsPerSample: 16})
        )

        // WAV header should be 44 bytes
        expect(result.length).toBe(44 + inputData.length)

        const decoder = new TextDecoder()

        // Check RIFF header
        const riffHeader = decoder.decode(result.slice(0, 4))
        expect(riffHeader).toBe("RIFF")

        // Check WAVE format
        const waveFormat = decoder.decode(result.slice(8, 12))
        expect(waveFormat).toBe("WAVE")

        // Check fmt chunk
        const fmtChunk = decoder.decode(result.slice(12, 16))
        expect(fmtChunk).toBe("fmt ")

        // Check data chunk
        const dataChunk = decoder.decode(result.slice(36, 40))
        expect(dataChunk).toBe("data")
    })

    it.each<Pick<RecordingOptions, "sampleRate" | "bitsPerSample">>([
        {sampleRate: 8000, bitsPerSample: 16},
        {sampleRate: 16000, bitsPerSample: 16},
        {sampleRate: 44100, bitsPerSample: 16}
    ])(
        "should handle sample rate $sampleRate",
        ({sampleRate, bitsPerSample}) => {
            const inputData = new Uint8Array([1, 2, 3, 4])
            const options = {sampleRate, bitsPerSample}

            const result = pipe(inputData, convertToWav(options))

            const view = new DataView(result.buffer)

            const headerSampleRate = view.getUint32(24, true)

            expect(headerSampleRate).toBe(sampleRate)
        }
    )

    it.each<Pick<RecordingOptions, "sampleRate" | "bitsPerSample">>([
        {bitsPerSample: 8, sampleRate: 44100},
        {bitsPerSample: 16, sampleRate: 44100},
        {bitsPerSample: 24, sampleRate: 44100}
    ])(
        "should handle bits per sample $bitsPerSample",
        ({bitsPerSample, sampleRate}) => {
            const inputData = new Uint8Array([1, 2, 3, 4])
            const options = {bitsPerSample, sampleRate}

            const result = pipe(inputData, convertToWav(options))

            const view = new DataView(result.buffer)

            const headerBitsPerSample = view.getUint16(34, true)

            expect(headerBitsPerSample).toBe(bitsPerSample)
        }
    )

    it("should preserve the input data", () => {
        const inputData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

        const result = pipe(
            inputData,
            convertToWav({sampleRate: 44100, bitsPerSample: 16})
        )

        const audioData = result.slice(44)

        expect(Array.from(audioData)).toEqual(Array.from(inputData))
    })

    it("should use default values when options are not provided", () => {
        const inputData = new Uint8Array([1, 2, 3, 4])
        const options = {}

        const result = pipe(inputData, convertToWav(options))

        const view = new DataView(result.buffer)
        const checks = [
            {
                name: "sample rate",
                value: view.getUint32(24, true),
                expected: 44100
            },
            {
                name: "bits per sample",
                value: view.getUint16(34, true),
                expected: 16
            }
        ]

        checks.forEach(({name, value, expected}) => {
            expect(value, name).toBe(expected)
        })
    })

    it("should calculate correct file size in header", () => {
        const inputData = new Uint8Array(1000)

        const result = pipe(
            inputData,
            convertToWav({sampleRate: 44100, bitsPerSample: 16})
        )

        const view = new DataView(result.buffer)
        const sizeChecks = [
            {
                name: "ChunkSize",
                value: view.getUint32(4, true),
                expected: result.length - 8
            },
            {
                name: "Subchunk2Size",
                value: view.getUint32(40, true),
                expected: inputData.length
            }
        ]

        sizeChecks.forEach(({name, value, expected}) => {
            expect(value, name).toBe(expected)
        })
    })
})

describe("createRecordingStream", () => {
    beforeEach(installMocks)
    afterEach(() => vi.doUnmock("node-microphone"))

    const mockData = new TextEncoder().encode("Mock audio data")

    // noinspection JSUnusedGlobalSymbols
    const mockCommandExecutor: CommandExecutor = {
        start: () =>
            FX.succeed({
                exitCode: FX.succeed(0),
                stdout: ST.fromIterable([mockData]),
                stderr: ST.empty,
                kill: () => FX.void
            } as unknown as Process)
    } as unknown as CommandExecutor

    const extractData = ({data}: Recording) =>
        new Uint8Array(data.buffer.slice(44))

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
                    FX.provideService(CommandExecutor, mockCommandExecutor),
                    FX.provide(NodeContext.layer),
                    FX.fork
                )

                yield* TestClock.adjust("8 seconds")

                const recordings = yield* Fiber.join(fiber)

                expect(recordings).toHaveLength(2)

                expect(extractData(recordings[0])).toEqual(mockData)
                expect(extractData(recordings[1])).toEqual(mockData)

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
                    FX.provideService(CommandExecutor, mockCommandExecutor),
                    FX.provide(NodeContext.layer),
                    FX.fork
                )

                yield* TestClock.adjust("3 seconds")

                const recordings = yield* Fiber.join(fiber)

                expect(recordings).toHaveLength(1)

                expect(extractData(recordings[0])).toEqual(mockData)

                const duration = pipe(recordings[0].duration, DU.toSeconds)

                expect(duration).toBeGreaterThan(0.8)
                expect(duration).toBeLessThan(1.2)
            })
    )
})
