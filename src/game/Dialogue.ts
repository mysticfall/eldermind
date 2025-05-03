import {pipe} from "effect"
import * as SC from "effect/Schema"

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
