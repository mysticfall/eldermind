import fs from "fs"
import * as FX from "effect/Effect"
import * as O from "effect/Option"
import {pipe, Schedule} from "effect"
import * as DU from "effect/Duration"
import {Duration} from "effect/Duration"
import Microphone from "node-microphone"
import * as ST from "effect/Stream"
import {Stream} from "effect/Stream"
import {BaseError} from "../common/Error"
import {FileSystem} from "@effect/platform/FileSystem"
import {PlatformError} from "@effect/platform/Error"
import * as os from "node:os"
import {Path} from "@effect/platform/Path"

export class AudioSystemError extends BaseError<AudioSystemError>(
    "AudioSystemError",
    {
        message: "Audio error has occurred."
    }
) {}

export interface Recording {
    readonly file: string
    readonly duration: Duration
}

export interface RecordingOptions {
    startWhen: Stream<unknown>
    stopWhen: Stream<unknown>
    maxDuration?: Duration
    directory?: string
    prefix?: string
}

export function createRecordingStream(
    options: RecordingOptions
): Stream<Recording, AudioSystemError | PlatformError, FileSystem | Path> {
    const maxDuration = pipe(
        options?.maxDuration,
        O.fromNullable,
        O.map(DU.clamp({minimum: DU.seconds(1), maximum: DU.seconds(30)})),
        O.getOrElse(() => DU.seconds(30))
    )

    const {startWhen, stopWhen} = options

    const targetFile = pipe(
        FX.Do,
        FX.bind("fs", () => FileSystem),
        FX.bind("path", () => Path),
        FX.bind("directory", ({fs, path}) =>
            pipe(
                options.directory,
                FX.fromNullable,
                FX.catchTag("NoSuchElementException", () =>
                    FX.succeed(
                        path.join(os.tmpdir(), "eldermind", "recordings")
                    )
                ),
                FX.tap(dir => fs.makeDirectory(dir, {recursive: true}))
            )
        ),
        FX.map(({path, directory}) =>
            path.join(
                directory,
                `${options.prefix ?? "recording-"}${new Date().getTime()}.wav`
            )
        )
    )

    const record = pipe(
        targetFile,
        FX.tap(file => FX.logDebug(`Start recording: ${file}`)),
        FX.tryMap({
            try: file => {
                const mic = new Microphone()

                const output = fs.createWriteStream(file)
                const input = mic.startRecording()

                input.pipe(output)

                return {
                    file,
                    mic,
                    output
                }
            },
            catch: e =>
                new AudioSystemError({
                    message: `Failed to start recording: ${e}`,
                    cause: e
                })
        }),
        FX.flatMap(({mic, output, file}) =>
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
                FX.tap(() =>
                    FX.gen(function* () {
                        yield* FX.logDebug(`Stop recording: ${file}`)

                        mic.stopRecording()
                        output.close()
                    })
                ),
                FX.as(file)
            )
        ),
        FX.timed,
        FX.map(([duration, file]) => ({file, duration}))
    )

    return pipe(
        startWhen,
        ST.flatMap(() => pipe(record, ST.fromEffect))
    )
}
