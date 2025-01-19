import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import {ReadonlyRecord} from "effect/Record"
import {pipe} from "effect"
import {traverseArray, traverseRecord} from "../common/Type"
import * as A from "effect/Array"

export type TemplateContext = ReadonlyRecord<string, unknown>

export type ContextBuilder<TContext> = (
    context: TContext
) => Effect<TemplateContext>

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
