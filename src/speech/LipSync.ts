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
import {BinaryData} from "../data/Data"
import {FileSystem} from "@effect/platform/FileSystem"
import {DialogueText} from "./Dialogue"
import {CommandExecutor} from "@effect/platform/CommandExecutor"
import {Scope} from "effect/Scope"
import * as os from "node:os"
import {TaggedError} from "effect/Data"
import {ErrorArgs, ErrorLike} from "../common/Error"
import {ActorId} from "skyrim-effect/game/Actor"
import {VoiceFile, VoicePathResolver} from "./Voice"
import {FilePath} from "../data/File"
import {Path} from "@effect/platform/Path"
import {GamePaths} from "../data/Service"

export class LipSyncError extends TaggedError("LipSyncError")<ErrorLike> {
    constructor(args: ErrorArgs = {}) {
        super({
            ...args,
            message: args.message ?? "Failed to generate a lipsync file."
        })
    }
}

export type LipSyncGenerator<E = never> = (
    audio: Stream<BinaryData, E>,
    text: DialogueText,
    voice: VoiceFile,
    speaker: ActorId
) => Effect<
    void,
    LipSyncError,
    GamePaths | FileSystem | Path | CommandExecutor | Scope
>

export type LipSyncCommandCreator = (
    audioFile: FilePath,
    lipFile: FilePath,
    text: DialogueText
) => Command

const decoder = new TextDecoder("UTF-8")

export function createLipSyncGenerator<E = never>(
    resolvePaths: VoicePathResolver,
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

    return (audio, text, voice, speaker) =>
        FX.gen(function* () {
            const fs = yield* FileSystem
            const path = yield* Path

            yield* FX.logDebug(
                `Generating dialogue resources for text: "${text}"`
            )

            const files = yield* pipe(
                resolvePaths(speaker, voice),
                FX.catchTag(
                    "FormError",
                    handleError(`Failed to resolve the speaker: ${speaker}.`)
                )
            )

            const dir = path.dirname(files.wav)

            yield* pipe(
                fs.makeDirectory(dir, {recursive: true}),
                FX.catchAll(
                    handleError(
                        `Failed to create the target directory for audio: ${dir}`
                    )
                )
            )

            yield* FX.logDebug(`Creating an audio file: ${files.wav}`)

            yield* pipe(
                audio,
                ST.run(fs.sink(files.wav)),
                FX.catchAll(
                    handleError(`Failed to create the audio file ${files.wav}`)
                )
            )

            yield* FX.logDebug(`Creating a lipsync animation: ${files.lip}`)

            const command = createCommand(files.wav, files.lip, text)

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
                `Generated dialogue resources in ${DU.format(elapsed)}.`
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
