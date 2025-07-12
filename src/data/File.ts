import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as FS from "@effect/platform/FileSystem"
import {FileSystem} from "@effect/platform/FileSystem"
import * as SC from "effect/Schema"
import {pipe} from "effect"
import {
    BinaryData,
    BinaryDataLoader,
    createTextDataLoader,
    DataAccessError,
    DataPath,
    TextDataLoader
} from "./Data"
import {ErrorArgs, ErrorLike} from "../common/Error"
import {TaggedError} from "effect/Data"

const DefaultDecoder = new TextDecoder("UTF-8")

export const FilePath = pipe(
    SC.NonEmptyString,
    SC.brand("FilePath"),
    SC.annotations({
        title: "File Path",
        description: "Absolute path to a file or directory on the file system"
    })
)

export type FilePath = typeof FilePath.Type

export class FileAccessError extends TaggedError("FileAccessError")<ErrorLike> {
    constructor(args: ErrorArgs & {path: FilePath}) {
        super({
            ...args,
            message:
                args.message ??
                `File does not exist or is not accessible: ${args.path}`
        })
    }
}

export const readBinaryFile = (
    path: FilePath
): Effect<BinaryData, FileAccessError, FileSystem> =>
    pipe(
        FX.Do,
        FX.tap(() => FX.logTrace(`Reading text file: ${path}`)),
        FX.bind("fs", () => FS.FileSystem),
        FX.flatMap(({fs}) => fs.readFile(path)),
        FX.catchTags({
            BadArgument: cause => new FileAccessError({path, cause}),
            SystemError: cause => new FileAccessError({path, cause})
        })
    )

export const readTextFile = (
    path: FilePath,
    decoder: TextDecoder = DefaultDecoder
): Effect<string, FileAccessError, FileSystem> =>
    pipe(
        readBinaryFile(path),
        FX.map(c => decoder.decode(c))
    )

export type FilePathResolver = (
    path: DataPath
) => Effect<FilePath, FileAccessError>

export function createBinaryFileLoader(
    resolver: FilePathResolver
): Effect<BinaryDataLoader, never, FileSystem> {
    return FX.gen(function* () {
        const fs = yield* FileSystem

        return path =>
            pipe(
                path,
                resolver,
                FX.flatMap(readBinaryFile),
                FX.provideService(FileSystem, fs),
                FX.catchTag(
                    "FileAccessError",
                    cause => new DataAccessError({path, cause})
                )
            )
    })
}

export function createTextFileLoader(
    resolver: FilePathResolver,
    decoder: TextDecoder = DefaultDecoder
): Effect<TextDataLoader, never, FileSystem> {
    return pipe(
        resolver,
        createBinaryFileLoader,
        FX.map(loader => createTextDataLoader(loader, decoder))
    )
}
