import * as SC from "effect/Schema"

export const Identifier = SC.String.pipe(
    SC.nonEmptyString(),
    SC.pattern(/^(?!.*\/\/)[\p{L}\p{N}_\-.]+(?:\/[\p{L}\p{N}_\-.]+)*$/u),
    SC.brand("Identifier")
).annotations({
    title: "Identifier",
    description: "Unique identifier for a resource"
})

export type Identifier = typeof Identifier.Type
