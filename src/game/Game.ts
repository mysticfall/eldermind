import * as SC from "effect/Schema"

export const GameTitle = SC.String.pipe(
    SC.nonEmptyString(),
    SC.brand("GameTitle")
)

export type GameTitle = typeof GameTitle.Type

export const Game = SC.Struct({
    title: GameTitle
})

export type Game = typeof Game.Type
