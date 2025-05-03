import * as A from "effect/Array"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as CMD from "@effect/platform/Command"
import {Command} from "@effect/platform/Command"
import * as DU from "effect/Duration"
import * as ST from "effect/Stream"
import {Stream} from "effect/Stream"
import * as STR from "effect/String"
import {flow, pipe} from "effect"
import * as CH from "effect/Chunk"
import {Chunk} from "effect/Chunk"
import * as SC from "effect/Schema"
import * as SI from "effect/Sink"
import * as path from "node:path"
import {BinaryData} from "../common/Data"
import {FileSystem} from "@effect/platform/FileSystem"
import {BaseError} from "../common/Error"
import {DialogueText} from "./Dialogue"
import {VoicePathResolver} from "./Voice"
import {FilePathResolver} from "../common/File"
import {CommandExecutor} from "@effect/platform/CommandExecutor"
import {Scope} from "effect/Scope"
import * as os from "node:os"

export class LipSyncError extends BaseError<LipSyncError>("LipSyncError", {
    message: "Failed to generate a lip sync animation."
}) {}

export type LipSyncGenerator<E = never> = (
    audio: Stream<BinaryData, E>,
    text: DialogueText,
    resolver: VoicePathResolver
) => Effect<void, LipSyncError, FileSystem | CommandExecutor | Scope>

export type LipSyncCommandCreator = (
    audioFile: string,
    lipFile: string,
    text: DialogueText
) => Command

const decoder = new TextDecoder("UTF-8")

export function createLipSyncGenerator<E = never>(
    resolver: FilePathResolver,
    createCommand: LipSyncCommandCreator
): LipSyncGenerator<E> {
    const handleError =
        (message: string) =>
        <T>(e?: {_tag: T; message: string} | E) =>
            new LipSyncError({
                message:
                    e && typeof e == "object" && "message" in e
                        ? `${message}: ${e.message}`
                        : `${message}.`,
                cause: e
            })

    const collectStdErr = SI.foldLeftChunks(
        new Uint8Array(),
        (bytes, chunk: Chunk<Uint8Array>) =>
            CH.reduce(chunk, bytes, (acc, curr) => {
                const newArray = new Uint8Array(acc.length + curr.length)

                newArray.set(acc)
                newArray.set(curr, acc.length)

                return newArray
            })
    )

    return (audio, text, getPath) =>
        FX.gen(function* () {
            const fs = yield* FileSystem

            const resolvePath = flow(
                getPath,
                flow(
                    FX.flatMap(resolver),
                    FX.catchAll(handleError(`Failed to resolve the voice path`))
                )
            )

            const audioPath = yield* resolvePath(".wav")
            const lipPath = yield* resolvePath(".lip")

            const dir = path.dirname(audioPath)

            yield* pipe(
                fs.makeDirectory(dir, {recursive: true}),
                FX.catchAll(
                    handleError(`Failed to create the target directory ${dir}`)
                )
            )

            yield* FX.logDebug(`Creating audio file: ${audioPath}`)

            yield* pipe(
                audio,
                ST.run(fs.sink(audioPath)),
                FX.catchAll(
                    handleError(`Failed to create the audio file ${audioPath}`)
                )
            )

            yield* FX.logDebug(
                `Creating lip-sync animation for text: "${text}"`
            )

            const command = createCommand(audioPath, lipPath, text)

            yield* FX.logDebug(`Executing command: "${command}"`)

            const [elapsed, p] = yield* pipe(
                command,
                CMD.workingDirectory(dir),
                CMD.start,
                FX.timed,
                FX.catchAll(
                    handleError(`Failed to execute the command "${command}"`)
                )
            )

            yield* pipe(
                ST.run(p.stderr, collectStdErr),
                FX.map(a => decoder.decode(a)),
                FX.catchAll(
                    handleError("Failed to read the command's error stream")
                ),
                FX.flatMap(
                    flow(
                        STR.trim,
                        FX.liftPredicate(
                            STR.isEmpty,
                            message =>
                                new LipSyncError({
                                    message: `The command failed with an error: ${message}`
                                })
                        )
                    )
                )
            )

            yield* pipe(
                p.exitCode,
                FX.catchAll(
                    handleError("Failed to read the command's exit code.")
                ),
                FX.flatMap(
                    FX.liftPredicate(
                        code => code === 0,
                        code =>
                            new LipSyncError({
                                message: `The command returned a non-zero exit code: ${code}`
                            })
                    )
                )
            )

            yield* FX.logDebug(
                `Generated lip-sync animation in ${DU.format(elapsed)}.`
            )
        })
}

export const FaceFXWrapperConfig = pipe(
    SC.Struct({
        programFile: SC.NonEmptyString,
        dataFile: SC.NonEmptyString,
        useWine: SC.optionalWith(SC.Boolean, {default: () => false})
    }),
    SC.annotations({
        title: "LipSync Command Configuration",
        description: "Configuration for FaceFXWrapper command line tool."
    })
)

export type FaceFXWrapperConfig = typeof FaceFXWrapperConfig.Type

export function createFaceFXWrapperConfig(dir: string): FaceFXWrapperConfig {
    return {
        programFile: path.join(dir, "FaceFXWrapper.exe"),
        dataFile: path.join(dir, "FonixData.cdf"),
        useWine: os.platform() !== "win32"
    }
}

export function createFaceFXWrapperCommand(
    config: FaceFXWrapperConfig
): LipSyncCommandCreator {
    const {programFile, dataFile, useWine} = config

    return (audioFile, lipFile, text) => {
        const [command, args] = pipe(
            A.make(
                programFile,
                "Skyrim",
                "USEnglish",
                dataFile,
                audioFile,
                audioFile,
                lipFile,
                text
            ),
            A.prependAll(useWine ? ["wine"] : A.empty()),
            A.unprepend
        )

        return CMD.make(command, ...args)
    }
}
