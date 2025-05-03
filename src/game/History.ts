import * as SC from "effect/Schema"
import {Schema} from "effect/Schema"
import {DialogueText} from "./Dialogue"
import {ActorId} from "skyrim-effect/game/Actor"
import {GameTime} from "skyrim-effect/game/Time"
import {pipe} from "effect"

export const GameEvent = SC.Struct({
    time: GameTime
})

export type GameEvent = typeof GameEvent.Type

export const DialogueEvent = pipe(
    SC.extend(
        GameEvent,
        SC.Struct({
            type: SC.tag("dialogue"),
            speaker: ActorId,
            target: ActorId,
            dialogue: DialogueText
        })
    ),
    SC.annotations({
        title: "Dialogue Event",
        description:
            "Dialogue event containing the text and speaker information."
    })
)

type DialogueEvent = typeof DialogueEvent.Type

export type History<T extends GameEvent> = readonly T[]

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
