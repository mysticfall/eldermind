import {pipe} from "effect"
import * as SC from "effect/Schema"

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
