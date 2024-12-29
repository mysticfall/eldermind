import * as SC from "effect/Schema"

export const Severity = SC.Union(
    SC.Literal("debug"),
    SC.Literal("info"),
    SC.Literal("warn"),
    SC.Literal("error"),
    SC.Literal("fatal")
)

export type Severity = typeof Severity.Type

export const BaseError = <TSelf>(
    tag: string,
    defaults?: {message?: string; severity?: Severity}
) =>
    SC.TaggedError<TSelf>()(tag, {
        message: SC.optionalWith(SC.String, {
            default: () => defaults?.message ?? "Unknown error."
        }),
        severity: SC.optionalWith(Severity, {
            default: () => defaults?.severity ?? "error"
        }),
        cause: SC.optional(SC.Unknown)
    })
