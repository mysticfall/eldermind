import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {
    createGameDataPathResolver,
    createSkyrimDataPathResolver,
    GamePath,
    SkyrimPath
} from "../../src/game/Game"
import {DataPath} from "../../src/common/Data"
import {pipe} from "effect"

describe("createGameDataPathResolver", () => {
    const mockGamePath = GamePath.make("/home/user/game/eldermind")

    it.effect("should resolve relative paths correctly for GamePath", () =>
        FX.gen(function* () {
            const resolver = createGameDataPathResolver(mockGamePath)

            const resolved = yield* pipe(
                "data/file.txt",
                DataPath.make,
                resolver
            )

            expect(resolved).toBe("/home/user/game/eldermind/data/file.txt")
        })
    )

    it.effect("should handle paths with no relative portion correctly", () =>
        FX.gen(function* () {
            const resolver = createGameDataPathResolver(mockGamePath)

            const resolved = yield* pipe("file.txt", DataPath.make, resolver)

            expect(resolved).toBe("/home/user/game/eldermind/file.txt")
        })
    )
})

describe("createSkyrimDataPathResolver", () => {
    const mockSkyrimPath = SkyrimPath.make("/home/user/game/Skyrim VR")

    it.effect("should resolve relative paths correctly for SkyrimPath", () =>
        FX.gen(function* () {
            const resolver = createSkyrimDataPathResolver(mockSkyrimPath)

            const resolved = yield* pipe(
                "Data/Eldermind.esp",
                DataPath.make,
                resolver
            )

            expect(resolved).toBe(
                "/home/user/game/Skyrim VR/Data/Eldermind.esp"
            )
        })
    )

    it.effect("should handle paths with nested directories correctly", () =>
        FX.gen(function* () {
            const resolver = createSkyrimDataPathResolver(mockSkyrimPath)

            const resolved = yield* pipe(
                "Data/textures/texture.dds",
                DataPath.make,
                resolver
            )

            expect(resolved).toBe(
                "/home/user/game/Skyrim VR/Data/textures/texture.dds"
            )
        })
    )
})
