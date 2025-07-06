import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as FS from "@effect/platform/FileSystem"
import {FileSystem} from "@effect/platform/FileSystem"
import {flow, pipe} from "effect"
import {PlatformError} from "@effect/platform/Error"
import {
    BinaryData,
    BinaryDataLoader,
    createTextDataLoader,
    DataPath,
    TextDataLoader
} from "./Data"

const DefaultDecoder = new TextDecoder("UTF-8")

export const readBinaryFile = (
    path: string
): Effect<BinaryData, PlatformError, FileSystem> =>
    pipe(
        FX.Do,
        FX.tap(() => FX.logTrace(`Reading text file: ${path}`)),
        FX.bind("fs", () => FS.FileSystem),
        FX.flatMap(({fs}) => fs.readFile(path))
    )

export const readTextFile = (
    path: string,
    decoder: TextDecoder = DefaultDecoder
): Effect<string, PlatformError, FileSystem> =>
    pipe(
        readBinaryFile(path),
        FX.map(c => decoder.decode(c))
    )

export type FilePathResolver = (path: DataPath) => Effect<string, PlatformError>

export function createBinaryFileLoader(
    resolver: FilePathResolver
): Effect<BinaryDataLoader, never, FileSystem> {
    return FX.gen(function* () {
        const fs = yield* FileSystem

        return flow(
            resolver,
            FX.flatMap(readBinaryFile),
            FX.provideService(FileSystem, fs)
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
