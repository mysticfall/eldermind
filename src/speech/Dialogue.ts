import {pipe} from "effect"
import * as SC from "effect/Schema"
import {GameEvent} from "../event/Event"
import {ActorId} from "skyrim-effect/game/Actor"

export const DialogueText = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("DialogueText"),
    SC.annotations({
        title: "Dialogue Text",
        description:
            "Dialogue text without any non-verbal content like emotes, preferably under 20 words."
    })
)

export type DialogueText = typeof DialogueText.Type

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

export type DialogueEvent = typeof DialogueEvent.Type
