import * as SC from "effect/Schema"

export const Identifier = SC.String.pipe(
    SC.nonEmptyString(),
    SC.pattern(/^(?!.*\/\/)[\p{L}\p{N}_\-.]+(?:\/[\p{L}\p{N}_\-.]+)*$/u),
    SC.brand("Identifier")
).annotations({
    title: "Identifier",
    description: "A unique identifier data."
})

export type Identifier = typeof Identifier.Type
