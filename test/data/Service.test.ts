import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as FS from "@effect/platform/FileSystem"
import {pipe} from "effect"
import {createGamePaths, DataAccess, GamePaths} from "../../src/data/Service"
import {FileAccessError, FilePath} from "../../src/data/File"
import {NodePath} from "@effect/platform-node"
import {DataPath} from "../../src/data/Data"
import {SystemError} from "@effect/platform/Error"

describe("createGamePaths", () => {
    it.scoped(
        "should create GamePaths layer with default data and mod directories",
        () => {
            const baseDir = FilePath.make(
                "c:/Program Files (x86)/Steam/steamapps/common/Skyrim VR"
            )

            const layer = createGamePaths({
                baseDir
            })

            const fileSystem = FS.layerNoop({
                exists: () => FX.succeed(true), // Assume they exist.
                access: () => FX.void // Assume they are accessible.
            })

            const test = FX.gen(function* () {
                const gamePaths = yield* GamePaths

                expect(gamePaths.baseDir).toBe(baseDir)
                expect(gamePaths.data.path).toBe(
                    FilePath.make(`${baseDir}/Data`)
                )
                expect(gamePaths.mod.path).toBe(
                    FilePath.make(`${baseDir}/Platform/Eldermind`)
                )
            })

            return pipe(
                test,
                FX.provide(layer),
                FX.provide(NodePath.layer),
                FX.provide(fileSystem)
            )
        }
    )

    it.scoped(
        "should create GamePaths layer with custom data and mod directories",
        () => {
            const baseDir = FilePath.make("/home/user/game/skyrim")
            const dataDir = FilePath.make("/home/user/game/data")
            const modDir = FilePath.make("/home/user/game/mod")

            const layer = createGamePaths({
                baseDir,
                dataDir,
                modDir
            })

            const fileSystem = FS.layerNoop({
                exists: () => FX.succeed(true),
                access: () => FX.void
            })

            const test = FX.gen(function* () {
                const gamePaths = yield* GamePaths

                expect(gamePaths.baseDir).toBe(baseDir)
                expect(gamePaths.data.path).toBe(dataDir)
                expect(gamePaths.mod.path).toBe(modDir)
            })

            return pipe(
                test,
                FX.provide(layer),
                FX.provide(NodePath.layer),
                FX.provide(fileSystem)
            )
        }
    )

    it.scoped(
        "should verify DataLoader functionality for text and binary files",
        () => {
            const baseDir = FilePath.make("/home/user/game/skyrim")

            const layer = createGamePaths({baseDir})

            const fileSystem = FS.layerNoop({
                exists: () => FX.succeed(true),
                access: () => FX.void,
                readFile: path => {
                    if (path.includes("test.")) {
                        return FX.succeed(
                            new Uint8Array([72, 101, 108, 108, 111])
                        ) // "Hello" in bytes
                    }

                    return FX.fail(
                        new SystemError({
                            reason: "NotFound",
                            module: "FileSystem",
                            method: "readFile"
                        })
                    )
                }
            })

            const testAccess = (access: DataAccess) =>
                FX.gen(function* () {
                    const text = yield* pipe(
                        "test.txt",
                        DataPath.make,
                        access.loadText
                    )

                    expect(text).toBe("Hello")

                    const bytes = yield* pipe(
                        "test.bin",
                        DataPath.make,
                        access.loadBinary
                    )

                    expect(new TextDecoder().decode(bytes)).toBe("Hello")
                })

            const test = FX.gen(function* () {
                const {data, mod} = yield* GamePaths

                yield* testAccess(data)
                yield* testAccess(mod)
            })

            return pipe(
                test,
                FX.provide(layer),
                FX.provide(NodePath.layer),
                FX.provide(fileSystem)
            )
        }
    )

    it.scoped("should fail when the base directory does not exist", () => {
        const baseDir = FilePath.make("/nonexistent/path")

        const layer = createGamePaths({baseDir})

        const fileSystem = FS.layerNoop({
            exists: p => FX.succeed(!p.toString().includes("nonexistent")),
            access: () => FX.void
        })

        const test = (error: FileAccessError) => {
            expect(error).toBeInstanceOf(FileAccessError)

            expect(error.message).toBe("The path for 'baseDir' does not exist.")
            expect(error.path).toBe(baseDir)
        }

        return pipe(
            GamePaths,
            FX.provide(layer),
            FX.provide(NodePath.layer),
            FX.provide(fileSystem),
            FX.flip,
            FX.map(test)
        )
    })

    it.scoped("should fail when the base directory is inaccessible", () => {
        const baseDir = FilePath.make("/home/user/nonexistent/path")

        const layer = createGamePaths({baseDir})

        const fileSystem = FS.layerNoop({
            exists: () => FX.succeed(true),
            access: p => {
                if (p.includes("nonexistent")) {
                    return new SystemError({
                        reason: "PermissionDenied",
                        module: "FileSystem",
                        method: "access"
                    })
                }

                return FX.void
            }
        })

        const test = (error: FileAccessError) => {
            expect(error).toBeInstanceOf(FileAccessError)

            expect(error.message).toBe(
                "The path for 'baseDir' is inaccessible."
            )
            expect(error.path).toBe(baseDir)
        }

        return pipe(
            GamePaths,
            FX.provide(layer),
            FX.provide(NodePath.layer),
            FX.provide(fileSystem),
            FX.flip,
            FX.map(test)
        )
    })

    it.scoped("should fail when the data directory does not exist", () => {
        const baseDir = FilePath.make("/home/user/game/skyrim")

        const layer = createGamePaths({baseDir})

        const fileSystem = FS.layerNoop({
            exists: p => FX.succeed(!p.toString().includes("Data")),
            access: () => FX.void
        })

        const test = (error: FileAccessError) => {
            expect(error).toBeInstanceOf(FileAccessError)

            expect(error.message).toBe("The path for 'dataDir' does not exist.")
            expect(error.path).toBe(`${baseDir}/Data`)
        }

        return pipe(
            GamePaths,
            FX.provide(layer),
            FX.provide(NodePath.layer),
            FX.provide(fileSystem),
            FX.flip,
            FX.map(test)
        )
    })

    it.scoped("should fail when the data directory is inaccessible", () => {
        const baseDir = FilePath.make("/home/user/game/skyrim")

        const layer = createGamePaths({baseDir})

        const fileSystem = FS.layerNoop({
            exists: () => FX.succeed(true),
            access: p => {
                if (p.includes("Data")) {
                    return new SystemError({
                        reason: "PermissionDenied",
                        module: "FileSystem",
                        method: "access"
                    })
                }

                return FX.void
            }
        })

        const test = (error: FileAccessError) => {
            expect(error).toBeInstanceOf(FileAccessError)

            expect(error.message).toBe(
                "The path for 'dataDir' is inaccessible."
            )
            expect(error.path).toBe(`${baseDir}/Data`)
        }

        return pipe(
            GamePaths,
            FX.provide(layer),
            FX.provide(NodePath.layer),
            FX.provide(fileSystem),
            FX.flip,
            FX.map(test)
        )
    })

    it.scoped("should fail when the mod directory does not exist", () => {
        const baseDir = FilePath.make("/home/user/game/skyrim")

        const layer = createGamePaths({baseDir})

        const fileSystem = FS.layerNoop({
            exists: p => FX.succeed(!p.toString().includes("Platform")),
            access: () => FX.void
        })

        const test = (error: FileAccessError) => {
            expect(error).toBeInstanceOf(FileAccessError)

            expect(error.message).toBe("The path for 'modDir' does not exist.")
            expect(error.path).toBe(`${baseDir}/Platform/Eldermind`)
        }

        return pipe(
            GamePaths,
            FX.provide(layer),
            FX.provide(NodePath.layer),
            FX.provide(fileSystem),
            FX.flip,
            FX.map(test)
        )
    })

    it.scoped("should fail when the mod directory is inaccessible", () => {
        const baseDir = FilePath.make("/home/user/game/skyrim")

        const layer = createGamePaths({baseDir})

        const fileSystem = FS.layerNoop({
            exists: () => FX.succeed(true),
            access: p => {
                if (p.includes("Platform")) {
                    return new SystemError({
                        reason: "PermissionDenied",
                        module: "FileSystem",
                        method: "access"
                    })
                }

                return FX.void
            }
        })

        const test = (error: FileAccessError) => {
            expect(error).toBeInstanceOf(FileAccessError)

            expect(error.message).toBe("The path for 'modDir' is inaccessible.")
            expect(error.path).toBe(`${baseDir}/Platform/Eldermind`)
        }

        return pipe(
            GamePaths,
            FX.provide(layer),
            FX.provide(NodePath.layer),
            FX.provide(fileSystem),
            FX.flip,
            FX.map(test)
        )
    })
})
