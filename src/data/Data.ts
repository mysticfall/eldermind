import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import * as STR from "effect/String"
import {flow, pipe} from "effect"
import type {ParseOptions} from "effect/SchemaAST"
import {ErrorArgs, ErrorLike} from "../common/Error"
import {TaggedError} from "effect/Data"

export const DataIdentifier = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.pattern(/^[a-z](?!.*__)([a-zA-Z0-9_]*[a-zA-Z0-9])?$/u)
)

export type DataIdentifier = typeof DataIdentifier.Type

export function makeIdentifier(text: string): string {
    return pipe(
        text,
        STR.trim,
        STR.replaceAll(/[\s!@#$%^&*()\-=_+{}[\]]+/g, "_"),
        STR.toLowerCase
    )
}

export const DataPath = SC.String.pipe(
    SC.nonEmptyString(),
    SC.pattern(
        /^(?!.*\/\/)(?!\s)[\p{L}\p{N}_\-. ]*[\p{L}\p{N}_\-. ](?:\/[\p{L}\p{N}_\-. ]*[\p{L}\p{N}_\-. ])*$/u
    ),
    SC.brand("DataPath")
).annotations({
    title: "Data Path",
    description: "Path to specific game data"
})

export type DataPath = typeof DataPath.Type

export class DataAccessError extends TaggedError("DataAccessError")<ErrorLike> {
    readonly path: DataPath

    constructor(args: ErrorArgs & {path: DataPath}) {
        super({
            ...args,
            message:
                args.message ??
                `Failed to access data from the path: ${args.path}`
        })

        this.path = args.path
    }
}

export type DataLoader<T> = (path: DataPath) => Effect<T, DataAccessError>

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

export class InvalidDataError extends TaggedError(
    "InvalidDataError"
)<ErrorLike> {
    constructor(args: ErrorArgs = {}) {
        super({
            ...args,
            message: args.message ?? "Data validation failed."
        })
    }
}

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
) => Effect<T, InvalidDataError | DataAccessError>

export class ContextDataError extends TaggedError(
    "ContextDataError"
)<ErrorLike> {
    constructor(args: ErrorArgs) {
        super({
            ...args,
            message: args.message ?? "Failed to build context data"
        })
    }
}

export type ContextBuilder<TData, TContext extends object = object> = (
    context: TData
) => Effect<TContext, ContextDataError>
