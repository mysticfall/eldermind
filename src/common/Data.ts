import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import * as ST from "effect/String"
import {flow, pipe} from "effect"
import type {ParseOptions} from "effect/SchemaAST"
import {BaseError} from "./Error"
import {PlatformError} from "@effect/platform/Error"

export const DataIdentifier = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.pattern(/^[a-z](?!.*__)([a-zA-Z0-9_]*[a-zA-Z0-9])?$/u)
)

export type DataIdentifier = typeof DataIdentifier.Type

export function makeIdentifier(text: string): string {
    return pipe(
        text,
        ST.trim,
        ST.replaceAll(/[\s!@#$%^&*()\-=_+{}\[\]]+/g, "_"),
        ST.toLowerCase
    )
}

export const DataPath = SC.String.pipe(
    SC.nonEmptyString(),
    SC.pattern(/^(?!.*\/\/)[\p{L}\p{N}_\-.]+(?:\/[\p{L}\p{N}_\-.]+)*$/u),
    SC.brand("DataPath")
).annotations({
    title: "Data Path",
    description: "The path to a specific game data."
})

export type DataPath = typeof DataPath.Type

export type DataLoader<T> = (path: DataPath) => Effect<T, PlatformError>

export type BinaryData = Uint8Array<ArrayBufferLike>

export type TextDataLoader = DataLoader<string>

export type BinaryDataLoader = DataLoader<BinaryData>

export function createTextDataLoader(
    loader: BinaryDataLoader,
    decoder: TextDecoder = new TextDecoder()
): TextDataLoader {
    return flow(
        loader,
        FX.map(c => decoder.decode(c))
    )
}

export class InvalidDataError extends BaseError<InvalidDataError>(
    "InvalidDataError",
    {
        message: "Data validation failed."
    }
) {}

export function validate<TData, TSource>(
    schema: SC.Schema<TData, TSource>,
    options?: ParseOptions
): (source: TSource) => Effect<TData, InvalidDataError> {
    return flow(
        SC.decodeUnknown(schema, options),
        FX.catchTag("ParseError", e =>
            FX.fail(
                new InvalidDataError({
                    message: e.message,
                    cause: e
                })
            )
        )
    )
}

export type TypedDataLoader<T> = (
    path: DataPath
) => Effect<T, InvalidDataError | PlatformError>
