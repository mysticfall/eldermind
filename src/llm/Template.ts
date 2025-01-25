import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import {BaseError} from "../common/Error"
import {InvalidDataError, TextDataLoader, TypedDataLoader} from "../common/Data"
import {flow, pipe} from "effect"
import {ReadonlyRecord} from "effect/Record"
import {traverseArray, traverseRecord} from "../common/Type"
import * as A from "effect/Array"

export class MissingContextDataError extends BaseError<MissingContextDataError>(
    "MissingContextDataError",
    {
        message: "Missing template context data."
    }
) {}

export type TemplateContext = ReadonlyRecord<string, unknown>

export type ContextBuilder<TContext> = (
    context: TContext
) => Effect<TemplateContext, MissingContextDataError>

export namespace ContextBuilder {
    export function union<TContext>(
        builders: ReadonlyRecord<string, ContextBuilder<TContext>>
    ): ContextBuilder<TContext> {
        return context =>
            pipe(
                builders,
                traverseRecord(b => b(context))
            )
    }

    export function merge<TContext>(
        ...builders: readonly ContextBuilder<TContext>[]
    ): ContextBuilder<TContext> {
        return context =>
            pipe(
                builders,
                traverseArray(b => b(context)),
                FX.map(A.reduce({}, (a, b) => ({...a, ...b})))
            )
    }

    export function append<TContext>(
        builders: ReadonlyRecord<string, ContextBuilder<TContext>>
    ): (addTo: ContextBuilder<TContext>) => ContextBuilder<TContext> {
        return addTo => context =>
            pipe(
                FX.Do,
                FX.bind("parent", () => addTo(context)),
                FX.bind("children", () =>
                    pipe(
                        builders,
                        traverseRecord(b => b(context))
                    )
                ),
                FX.map(({parent, children}) => ({...parent, ...children}))
            )
    }
}

export type Template = (
    context: TemplateContext
) => Effect<string, MissingContextDataError>

export type TemplateCompiler = (
    source: string
) => Effect<Template, InvalidDataError>

export type TemplateLoader = TypedDataLoader<Template>

export function createTemplateLoader(
    loader: TextDataLoader,
    compiler: TemplateCompiler
): TemplateLoader {
    return flow(loader, FX.flatMap(compiler))
}
