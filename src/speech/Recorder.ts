import * as FX from "effect/Effect"
import * as O from "effect/Option"
import {Fiber, pipe, Schedule} from "effect"
import * as DU from "effect/Duration"
import {Duration} from "effect/Duration"
import * as ST from "effect/Stream"
import {Stream} from "effect/Stream"
import * as SCH from "effect/Schedule"
import {BinaryData} from "../data/Data"
import * as CMD from "@effect/platform/Command"
import * as CH from "effect/Chunk"
import {Chunk} from "effect/Chunk"
import * as SI from "effect/Sink"
import {CommandExecutor} from "@effect/platform/CommandExecutor"
import {PlatformError} from "@effect/platform/Error"
import {ErrorArgs, ErrorLike} from "../common/Error"
import {TaggedError} from "effect/Data"

export class AudioSystemError extends TaggedError(
    "AudioSystemError"
)<ErrorLike> {
    constructor(args: ErrorArgs = {}) {
        super({
            ...args,
            message: args.message ?? "Audio error has occurred."
        })
    }
}

export interface Recording {
    readonly data: BinaryData
    readonly duration: Duration
}

export interface RecordingOptions {
    event: Stream<unknown>
    maxDuration?: Duration
    bitsPerSample?: 8 | 16 | 24
    sampleRate?: 8000 | 16000 | 44100
    device?: "hw:0,0" | "plughw:1,0" | "default"
}

const DefaultSampleRate = 44100
const DefaultBitsPerSample = 16

const textEncoder = new TextEncoder()

export const convertToWav =
    (options: Pick<RecordingOptions, "bitsPerSample" | "sampleRate">) =>
    (data: BinaryData): BinaryData => {
        const sampleRate = options.sampleRate ?? DefaultSampleRate
        const bitsPerSample = options.bitsPerSample ?? DefaultBitsPerSample

        // WAV header is 44 bytes
        const headerLength = 44
        const dataLength = data.length
        const totalLength = headerLength + dataLength

        const buffer = new Uint8Array(totalLength)
        const view = new DataView(buffer.buffer)

        // RIFF chunk descriptor
        buffer.set(textEncoder.encode("RIFF"), 0) // ChunkID
        view.setUint32(4, totalLength - 8, true) // ChunkSize (true = little-endian)
        buffer.set(textEncoder.encode("WAVE"), 8) // Format

        // fmt sub-chunk
        buffer.set(textEncoder.encode("fmt "), 12) // Subchunk1ID
        view.setUint32(16, 16, true) // Subchunk1Size (16 for PCM)
        view.setUint16(20, 1, true) // AudioFormat (1 for PCM)
        view.setUint16(22, 1, true) // NumChannels (1 for mono)
        view.setUint32(24, sampleRate, true) // SampleRate
        view.setUint32(28, sampleRate * 2, true) // ByteRate
        view.setUint16(32, 2, true) // BlockAlign
        view.setUint16(34, bitsPerSample, true) // BitsPerSample

        // data sub-chunk
        buffer.set(textEncoder.encode("data"), 36) // Subchunk2ID
        view.setUint32(40, dataLength, true) // Subchunk2Size

        // Copy the audio data
        buffer.set(new Uint8Array(data), headerLength)

        return buffer
    }

export function createRecordingStream(
    options: RecordingOptions
): Stream<Recording, AudioSystemError, CommandExecutor> {
    const maxDuration = pipe(
        options?.maxDuration,
        O.fromNullable,
        O.map(DU.clamp({minimum: DU.seconds(1), maximum: DU.seconds(30)})),
        O.getOrElse(() => DU.seconds(30))
    )

    const {event} = options

    const sampleRate = options.sampleRate ?? DefaultSampleRate
    const bitsPerSample = options.bitsPerSample ?? DefaultBitsPerSample

    const handleError = (e: PlatformError) =>
        new AudioSystemError({
            message: `Failed to start recording: ${e}`,
            cause: e
        })

    const record = pipe(
        FX.gen(function* () {
            const command = CMD.make(
                "sox",
                "-q",
                "-d",
                "-t",
                "raw",
                "-r",
                sampleRate.toString(),
                "-c",
                "1",
                "-b",
                bitsPerSample.toString(),
                "-e",
                "signed-integer",
                "-"
            )

            yield* FX.logDebug(`Start recording with command: "${command}"`)

            const process = yield* pipe(
                command,
                CMD.start,
                FX.catchAll(handleError)
            )

            const collectAudio = SI.foldLeftChunks(
                new Uint8Array(),
                (bytes, chunk: Chunk<Uint8Array>) =>
                    CH.reduce(chunk, bytes, (acc, curr) => {
                        const newArray = new Uint8Array(
                            acc.length + curr.length
                        )

                        newArray.set(acc)
                        newArray.set(curr, acc.length)

                        return newArray
                    })
            )

            const collector = pipe(
                ST.run(process.stdout, collectAudio),
                FX.catchAll(handleError),
                FX.runFork
            )

            return {
                process,
                collector
            }
        }),
        FX.flatMap(({process, collector}) =>
            pipe(
                FX.void,
                FX.repeat({
                    schedule: SCH.addDelay(Schedule.forever, () =>
                        DU.millis(100)
                    ),
                    until: () =>
                        pipe(
                            event,
                            ST.take(1),
                            ST.runCollect,
                            FX.map(c => c.length > 0)
                        )
                }),
                FX.timeout(maxDuration),
                FX.catchTag("TimeoutException", () => FX.void),
                FX.tap(() => pipe(process.kill(), FX.catchAll(handleError))),
                FX.flatMap(() =>
                    pipe(Fiber.join(collector), FX.map(convertToWav(options)))
                ),
                FX.tap(data =>
                    FX.logDebug(
                        `Recorded ${data.length.toLocaleString()} bytes.`
                    )
                )
            )
        ),
        FX.timed,
        FX.scoped,
        FX.map(([duration, data]) => ({data, duration}))
    )

    return pipe(
        event,
        ST.take(1),
        ST.flatMap(() => pipe(record, ST.fromEffect)),
        ST.repeat(Schedule.forever)
    )
}
