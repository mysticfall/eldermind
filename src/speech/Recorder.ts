import * as FX from "effect/Effect"
import * as O from "effect/Option"
import {pipe, Schedule} from "effect"
import * as DU from "effect/Duration"
import {Duration} from "effect/Duration"
import Microphone from "node-microphone"
import * as ST from "effect/Stream"
import {Stream} from "effect/Stream"
import {BaseError} from "../common/Error"
import {Writable} from "stream"

export class AudioSystemError extends BaseError<AudioSystemError>(
    "AudioSystemError",
    {
        message: "Audio error has occurred."
    }
) {}

export interface Recording {
    readonly data: Uint8Array<ArrayBufferLike>
    readonly duration: Duration
}

export interface RecordingOptions {
    startWhen: Stream<unknown>
    stopWhen: Stream<unknown>
    maxDuration?: Duration
    bitwidth?: 8 | 16 | 24
    rate?: 8000 | 16000 | 44100
    device?: "hw:0,0" | "plughw:1,0" | "default"
}

export function createRecordingStream(
    options: RecordingOptions
): Stream<Recording, AudioSystemError> {
    const maxDuration = pipe(
        options?.maxDuration,
        O.fromNullable,
        O.map(DU.clamp({minimum: DU.seconds(1), maximum: DU.seconds(30)})),
        O.getOrElse(() => DU.seconds(30))
    )

    const {startWhen, stopWhen, bitwidth, rate, device} = options

    const record = pipe(
        FX.logDebug("Start recording."),
        FX.tryMap({
            try: () => {
                const mic = new Microphone({
                    bitwidth,
                    rate,
                    device,
                    channels: 1
                })

                const chunks: Buffer[] = []

                const output = new Writable({
                    write(chunk, encoding, callback) {
                        chunks.push(
                            Buffer.isBuffer(chunk)
                                ? chunk
                                : Buffer.from(chunk, encoding)
                        )
                        callback()
                    }
                })

                const input = mic.startRecording()

                input.pipe(output)

                return {
                    mic,
                    chunks
                }
            },
            catch: e =>
                new AudioSystemError({
                    message: `Failed to start recording: ${e}`,
                    cause: e
                })
        }),
        FX.flatMap(({mic, chunks}) =>
            pipe(
                FX.void,
                FX.repeat({
                    schedule: Schedule.addDelay(Schedule.forever, () =>
                        DU.millis(100)
                    ),
                    until: () =>
                        pipe(
                            stopWhen,
                            ST.take(1),
                            ST.runCollect,
                            FX.map(c => c.length > 0)
                        )
                }),
                FX.timeout(maxDuration),
                FX.catchTag("TimeoutException", () => FX.void),
                FX.map(() => {
                    mic.stopRecording()
                    return new Uint8Array(Buffer.concat(chunks))
                }),
                FX.tap(data =>
                    FX.logDebug(
                        `Recorded ${data.length.toLocaleString()} bytes.`
                    )
                )
            )
        ),
        FX.timed,
        FX.map(([duration, data]) => ({data, duration}))
    )

    return pipe(
        startWhen,
        ST.flatMap(() => pipe(record, ST.fromEffect))
    )
}
