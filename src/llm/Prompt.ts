import {
    BaseMessage,
    MessageContent,
    UsageMetadata
} from "@langchain/core/messages"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as E from "effect/Either"
import {Either} from "effect/Either"
import {ReadonlyRecord} from "effect/Record"
import * as A from "effect/Array"
import * as SC from "effect/Schema"
import {flow, pipe, Schedule} from "effect"
import {Duration} from "effect/Duration"
import {traverseArray} from "../common/Type"
import {
    BaseChatModel,
    BaseChatModelCallOptions
} from "@langchain/core/language_models/chat_models"
import {LlmExecutionError, runLlm} from "./Model"
import {ParseOptions} from "effect/SchemaAST"
import {parseJson} from "../common/Json"
import {InvalidDataError} from "../common/Data"

export type PromptContextBuilder<in TContext> = (
    context: TContext
) => Effect<ReadonlyRecord<string, unknown>>

export interface PromptTemplate<in TContext, TOutput, TSource = TOutput> {
    readonly schema: SC.Schema<TOutput, TSource>

    render(context: TContext): Effect<readonly BaseMessage[]>
}

export abstract class AbstractPromptTemplate<
    in TContext,
    TOutput,
    TSource = unknown
> implements PromptTemplate<TContext, TOutput, TSource>
{
    constructor(
        readonly builders: readonly PromptContextBuilder<TContext>[],
        readonly schema: SC.Schema<TOutput, TSource>
    ) {
        this.doRender = this.doRender.bind(this)
        this.render = this.render.bind(this)
    }

    protected abstract doRender(
        context: ReadonlyRecord<string, unknown>
    ): Effect<readonly BaseMessage[]>

    render(context: TContext): Effect<readonly BaseMessage[]> {
        return pipe(
            this.builders,
            traverseArray(b => b(context)),
            FX.map(A.reduceRight({}, (a, b) => ({...a, ...b}))),
            FX.flatMap(this.doRender)
        )
    }
}

export interface PromptExecutionResult<T> {
    readonly output: T
    readonly duration: Duration
    readonly metadata: ReadonlyRecord<any, any>
    readonly usage?: UsageMetadata
}

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

export function runPrompt<TContext, TOutput, TSource = unknown>(
    prompt: PromptTemplate<TContext, TOutput, TSource>,
    model: BaseChatModel,
    options?: {
        readonly retryTimes?: number
        readonly parseOptions?: ParseOptions
        readonly callOptions?: BaseChatModelCallOptions
    }
): (
    context: TContext
) => Effect<
    PromptExecutionResult<TOutput>,
    LlmExecutionError | InvalidDataError
> {
    return flow(
        prompt.render,
        FX.flatMap(messages => {
            const request = FX.gen(function* () {
                const [duration, response] = yield* pipe(
                    messages,
                    runLlm(model, options?.callOptions),
                    FX.timed
                )

                const {content, response_metadata, usage_metadata} = response

                const output = yield* pipe(
                    parseContent(content),
                    FX.flatMap(parseJson(prompt.schema, options?.parseOptions))
                )

                return {
                    output,
                    duration,
                    metadata: response_metadata,
                    usage: usage_metadata
                }
            })

            return pipe(
                request,
                FX.retryOrElse(
                    Schedule.recurs(options?.retryTimes ?? DefaultRetryTimes),
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
    )
}
