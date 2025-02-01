import {pipe} from "effect"
import * as SC from "effect/Schema"
import {RoleId} from "./Role"
import {GameTime} from "skyrim-effect/game/Time"

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

export const DialogueLine = pipe(
    SC.Struct({
        speaker: RoleId,
        text: DialogueText,
        time: GameTime
    }),
    SC.annotations({
        title: "Dialogue Line",
        description:
            "Dialogue line containing the text and speaker information."
    })
)

export type DialogueLine = typeof DialogueLine.Type
