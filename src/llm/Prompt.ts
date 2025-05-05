import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as A from "effect/Array"
import * as F from "effect/Function"
import {Schema} from "effect/Schema"
import * as SCH from "effect/Scheduler"
import {Scheduler} from "effect/Scheduler"
import {JSONSchema, pipe, Schedule} from "effect"
import {traverseArray} from "../common/Type"
import {ParseOptions} from "effect/SchemaAST"
import {parseJson} from "../common/Json"
import {InvalidDataError} from "../common/Data"
import {Template} from "../template/Template"
import {extractCodeContent} from "../markdown/Parser"
import {Completions} from "@effect/ai/Completions"
import {AiError} from "@effect/ai/AiError"
import {Message, SystemInstruction} from "@effect/ai/AiInput"
import {AiRole} from "@effect/ai"

export type Prompt<TContext, TOutput> = (
    context: TContext
) => Effect<TOutput, AiError | InvalidDataError, Completions>

export const DefaultRetryTimes = 3

export function createPrompt<TContext, TOutput, TSource = TOutput>(
    templates: {
        readonly system: Template
        readonly user: readonly Template[]
    },
    schema: Schema<TOutput, TSource>,
    options?: {
        readonly retryTimes?: number
        readonly parseOptions?: ParseOptions
        readonly contextScheduler?: Scheduler
    }
): Prompt<TContext, TOutput> {
    const scheduler = options?.contextScheduler ?? SCH.defaultScheduler

    return data =>
        FX.gen(function* () {
            const context = {
                ...data,
                schema: JSON.stringify(JSONSchema.make(schema))
            }

            yield* FX.logDebug(
                `Rendering template using context: ${JSON.stringify(context, null, 2)}`
            )

            const {system, user} = yield* pipe(
                FX.Do,
                FX.bind("system", () => templates.system(context)),
                FX.bind("user", () =>
                    pipe(
                        templates.user,
                        traverseArray(F.apply(context)),
                        FX.map(A.map(s => Message.fromInput(s, AiRole.user)))
                    )
                ),
                FX.withScheduler(scheduler)
            )

            yield* FX.logDebug(`Using a system instruction: ${system}`)

            yield* pipe(
                user,
                traverseArray(m =>
                    FX.logDebug(
                        `Rendered a base message (${m.role}):\n${m.parts}`
                    )
                )
            )

            const completions = yield* Completions

            const request = FX.gen(function* () {
                const response = yield* completions.create(user)

                const content = pipe(response.text, extractCodeContent)

                FX.logTrace(`LLM output: ${content}`)

                return yield* pipe(
                    content,
                    parseJson(schema, options?.parseOptions)
                )
            })

            return yield* pipe(
                request,
                FX.provideService(SystemInstruction, system),
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
