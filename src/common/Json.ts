import {flow, pipe} from "effect"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import {
    InvalidDataError,
    TextDataLoader,
    TypedDataLoader,
    validate
} from "./Data"
import * as SC from "effect/Schema"
import type {ParseOptions} from "effect/SchemaAST"

export function parseJson<TData, TInput = unknown>(
    schema: SC.Schema<TData, TInput>,
    options?: ParseOptions
): (text: string) => Effect<TData, InvalidDataError> {
    return text =>
        pipe(
            FX.try(() => JSON.parse(text)),
            FX.catchTag("UnknownException", e =>
                FX.fail(
                    new InvalidDataError({
                        message:
                            e.error instanceof Error
                                ? e.error.message
                                : `Invalid JSON: ${text}`,
                        cause: e
                    })
                )
            ),
            FX.flatMap(validate(schema, options))
        )
}

export function createJsonDataLoader<TData, TInput = unknown>(
    schema: SC.Schema<TData, TInput>,
    options?: ParseOptions
): (loader: TextDataLoader) => TypedDataLoader<TData> {
    return loader => flow(loader, FX.flatMap(parseJson(schema, options)))
}
