import {pipe} from "effect"
import * as SC from "effect/Schema"

export const ModName = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.pattern(/^[^\\.]+.*\.(esp|esm)$/i),
    SC.brand("ModName")
).annotations({
    title: "Mod Name",
    description: "Name of a mod file, either .esp or .esm"
})

export type ModName = typeof ModName.Type
