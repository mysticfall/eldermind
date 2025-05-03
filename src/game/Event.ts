import * as SC from "effect/Schema"
import {Schema} from "effect/Schema"
import {GameTime} from "skyrim-effect/game/Time"
import {pipe} from "effect"

export const GameEvent = SC.Struct({
    time: GameTime
})

export type GameEvent = typeof GameEvent.Type

export type Event<T extends GameEvent> = readonly T[]

export const History = <A extends GameEvent, I = A, R = never>(
    schema: Schema<A, I, R>
) =>
    pipe(
        SC.Array(schema),
        SC.annotations({
            title: "History",
            description: "Collection of game events ordered by timestamp."
        })
    )
