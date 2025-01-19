import {BaseMessage, MessageContent} from "@langchain/core/messages"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as E from "effect/Either"
import {Either} from "effect/Either"
import {ReadonlyRecord} from "effect/Record"
import * as A from "effect/Array"
import * as SC from "effect/Schema"
import {JSONSchema, pipe, Schedule} from "effect"
import {traverseArray, traverseRecord} from "../common/Type"
import {LlmExecutionError, LlmResponse, LlmRunner} from "./Model"
import {ParseOptions} from "effect/SchemaAST"
import {parseJson} from "../common/Json"
import {InvalidDataError} from "../common/Data"

export type ContextBuilder<TContext> = (
    context: TContext
) => Effect<ReadonlyRecord<string, unknown>>

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

export type MessageTemplate = (
    context: ReadonlyRecord<string, unknown>
) => Effect<BaseMessage>

export type Prompt<TContext, TOutput> = (
    context: TContext
) => Effect<LlmResponse<TOutput>, LlmExecutionError | InvalidDataError>

const parseContent = (
    content: MessageContent
): Either<string, InvalidDataError> => {
    if (typeof content == "string") {
        return E.right(content)
    } else if (content.length != 1) {
        return E.left(
            new InvalidDataError({
                message: A.isEmptyArray(content)
                    ? "Received an empty response from the LLM."
                    : `Expected a single response from the LLM, but got multiple ${content.length}.`
            })
        )
    } else if (content[0].type == "text") {
        return E.right(content[0].text)
    } else {
        return E.left(
            new InvalidDataError({
                message: `Expected a text response from the LLM, but got ${content[0].type}.`
            })
        )
    }
}

export const DefaultRetryTimes = 3

export function createPrompt<TContext, TOutput, TSource = TOutput>(
    templates: readonly MessageTemplate[],
    builders: readonly ContextBuilder<TContext>[],
    schema: SC.Schema<TOutput, TSource>,
    runner: LlmRunner,
    options?: {
        readonly retryTimes?: number
        readonly parseOptions?: ParseOptions
    }
): Prompt<TContext, TOutput> {
    return context =>
        FX.gen(function* () {
            const ctx = yield* pipe(
                builders,
                traverseArray(b => b(context)),
                FX.map(
                    A.reduceRight(
                        {
                            schema: JSON.stringify(JSONSchema.make(schema))
                        },
                        (a, b) => ({...a, ...b})
                    )
                )
            )

            const messages = yield* pipe(
                templates,
                traverseArray(b => b(ctx))
            )

            const request = FX.gen(function* () {
                const response = yield* runner(messages)

                const {duration, metadata, usage} = response

                const content = yield* pipe(response.output, parseContent)
                const output = yield* pipe(
                    content,
                    parseJson(schema, options?.parseOptions)
                )

                return {output, duration, metadata, usage}
            })

            return yield* pipe(
                request,
                FX.retryOrElse(
                    Schedule.recurs(
                        (options?.retryTimes ?? DefaultRetryTimes) - 1
                    ),
                    e => {
                        if (e._tag != "InvalidDataError") {
                            return FX.fail(e)
                        }

                        return pipe(
                            FX.logWarning(
                                `The LLM returned invalid data: ${e.message}. Retrying.`,
                                e
                            ),
                            FX.flatMap(() => request)
                        )
                    }
                )
            )
        })
}
