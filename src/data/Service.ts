import {BinaryDataLoader, DataPath, TextDataLoader} from "./Data"
import {
    createBinaryFileLoader,
    createTextFileLoader,
    FileAccessError,
    FilePath
} from "./File"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as L from "effect/Layer"
import {Layer} from "effect/Layer"
import * as O from "effect/Option"
import {FileSystem} from "@effect/platform/FileSystem"
import {Path} from "@effect/platform/Path"
import {Tag} from "effect/Context"
import {pipe} from "effect"
import {PlatformError} from "@effect/platform/Error"

export interface DataAccess {
    readonly path: FilePath
    readonly loadBinary: BinaryDataLoader
    readonly loadText: TextDataLoader
}

export class GamePaths extends Tag("GamePaths")<
    GamePaths,
    {
        readonly baseDir: FilePath
        readonly data: DataAccess
        readonly mod: DataAccess
    }
>() {}

export function createGamePaths(paths: {
    baseDir: FilePath
    dataDir?: FilePath
    modDir?: FilePath
}): Layer<GamePaths, FileAccessError, FileSystem | Path> {
    const {baseDir} = paths

    const factory = FX.gen(function* () {
        const fs = yield* FileSystem
        const path = yield* Path

        const dataDir = pipe(
            paths.dataDir,
            O.fromNullable,
            O.getOrElse(() => pipe(path.join(baseDir, "Data"), FilePath.make))
        )

        const modDir = pipe(
            paths.modDir,
            O.fromNullable,
            O.getOrElse(() =>
                pipe(path.join(baseDir, "Platform", "Eldermind"), FilePath.make)
            )
        )

        const resolved = {
            baseDir,
            dataDir,
            modDir
        }

        yield* FX.logInfo(`
Initialising paths:
  - base dir.: ${baseDir}
  - data dir.: ${dataDir}
  - mod dir.: ${modDir}
`)

        const validatePath = (
            key: keyof typeof paths
        ): Effect<FilePath, FileAccessError> =>
            FX.gen(function* () {
                const path = resolved[key]

                const toFileAccessError = (cause: PlatformError) =>
                    new FileAccessError({
                        path,
                        cause,
                        message: `The path for '${key}' is inaccessible.`
                    })

                const handlePlatformError = <A, R>(
                    process: Effect<A, PlatformError, R>
                ): Effect<A, FileAccessError, R> =>
                    pipe(
                        process,
                        FX.catchTags({
                            BadArgument: toFileAccessError,
                            SystemError: toFileAccessError
                        })
                    )

                const exists = yield* pipe(fs.exists(path), handlePlatformError)

                if (!exists) {
                    yield* new FileAccessError({
                        path,
                        message: `The path for '${key}' does not exist.`
                    })
                }

                yield* pipe(
                    fs.access(path, {
                        readable: true,
                        ok: true
                    }),
                    handlePlatformError
                )

                return path
            })

        const createDataAccess = (
            key: keyof typeof paths
        ): Effect<DataAccess, FileAccessError, FileSystem> =>
            pipe(
                FX.Do,
                FX.bind("path", () => validatePath(key)),
                FX.bind("resolver", ({path: root}) =>
                    FX.succeed((p: DataPath) =>
                        pipe(path.join(root, p), FilePath.make, FX.succeed)
                    )
                ),
                FX.bind("loadBinary", ({resolver}) =>
                    pipe(resolver, createBinaryFileLoader)
                ),
                FX.bind("loadText", ({resolver}) =>
                    pipe(resolver, createTextFileLoader)
                )
            )

        return yield* pipe(
            FX.Do,
            FX.bind("baseDir", () => validatePath("baseDir")),
            FX.bind("data", () => createDataAccess("dataDir")),
            FX.bind("mod", () => createDataAccess("modDir"))
        )
    })

    return L.effect(GamePaths, factory)
}
