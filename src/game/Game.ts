import {pipe} from "effect"
import * as FX from "effect/Effect"
import * as SC from "effect/Schema"
import {FilePath, FilePathResolver} from "../data/File"
import * as path from "node:path"

export const GameTitle = pipe(SC.NonEmptyString, SC.brand("GameTitle"))

export type GameTitle = typeof GameTitle.Type

export const Game = SC.Struct({
    title: GameTitle
})

export type Game = typeof Game.Type

export const GamePath = pipe(
    SC.NonEmptyString,
    SC.brand("GamePath"),
    SC.annotations({
        title: "Game Path",
        description: "Absolute path to the base game folder"
    })
)

export type GamePath = typeof GamePath.Type

export const SkyrimPath = pipe(
    SC.NonEmptyString,
    SC.brand("SkyrimPath"),
    SC.annotations({
        title: "Game Path",
        description: "Absolute path to the Skyrim installation folder"
    })
)

export type SkyrimPath = typeof SkyrimPath.Type

export function createGameDataPathResolver(root: GamePath): FilePathResolver {
    return relative =>
        pipe(path.join(root, relative), FilePath.make, FX.succeed)
}

export function createSkyrimDataPathResolver(
    root: SkyrimPath
): FilePathResolver {
    return relative =>
        pipe(path.join(root, relative), FilePath.make, FX.succeed)
}
