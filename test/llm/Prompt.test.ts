import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import {pipe} from "effect"
import * as FX from "effect/Effect"
import * as SC from "effect/Schema"
import {LlmExecutionError} from "../../src/llm/Model"
import {PromptTemplate, runPrompt} from "../../src/llm/Prompt"
import {BaseMessage, HumanMessage} from "@langchain/core/messages"
import {FakeChatModel, FakeListChatModel} from "@langchain/core/utils/testing"
import {CallbackManagerForLLMRun} from "@langchain/core/callbacks/manager"
import {ChatResult} from "@langchain/core/outputs"
import {InvalidDataError} from "../../src/common/Data"

describe("runPrompt", () => {
    const context = {
        name: "Anna"
    }

    const schema = SC.Struct({
        name: SC.String,
        age: SC.Number
    }).annotations({
        description: "User"
    })

    type Context = typeof context
    type Response = typeof schema.Type

    const prompt: PromptTemplate<Context, Response> = {
        schema,
        render: (context: Context) => {
            return pipe(
                [new HumanMessage(`Who is ${context.name}?`)],
                FX.succeed
            )
        }
    }

    it.effect("should return a successful response from the model", () =>
        FX.gen(function* () {
            const model = new FakeListChatModel({
                responses: [`{"name": "Anna", "age": 42}`]
            })

            const response = yield* pipe(context, runPrompt(prompt, model))

            expect(response).toBeDefined()

            const {output, duration} = response

            expect(output.name).toBe("Anna")
            expect(output.age).toBe(42)
            expect(duration).toBeDefined()
        })
    )

    it.effect("should return an LlmModelExecutionError on model failure", () =>
        FX.gen(function* () {
            class ChatModelFixture extends FakeChatModel {
                _generate(
                    _messages: BaseMessage[],
                    _options?: this["ParsedCallOptions"],
                    _runManager?: CallbackManagerForLLMRun
                ): Promise<ChatResult> {
                    return Promise.reject(new Error("Who is Anna?"))
                }
            }

            const error = yield* pipe(
                context,
                runPrompt(prompt, new ChatModelFixture({})),
                FX.catchTag("LlmExecutionError", (e: LlmExecutionError) =>
                    FX.succeed(e.message)
                )
            )

            expect(error).toBe("Who is Anna?")
        })
    )

    it.effect(
        "should return an InvalidDataError when it fails to validate the response",
        () =>
            FX.gen(function* () {
                const model = new FakeListChatModel({
                    responses: [`{"name": "Anna"}`]
                })

                const error = yield* pipe(
                    context,
                    runPrompt(prompt, model),
                    FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).toMatch(
                    `User
└─ ["age"]
   └─ is missing`
                )
            })
    )

    it.effect(
        "should retry up to the given number of times if it fails with InvalidDataError",
        () =>
            FX.gen(function* () {
                const model = new FakeListChatModel({
                    responses: [
                        `{"name": "Anna"}`,
                        `{"age": 42}`,
                        `"name": "Anna", "age": 42}`,
                        `{"name": "Anna", "age": 42}`
                    ]
                })

                const response = yield* pipe(
                    context,
                    runPrompt(prompt, model, {retryTimes: 3})
                )

                expect(response).toBeDefined()

                const {output, duration} = response

                expect(output.name).toBe("Anna")
                expect(output.age).toBe(42)
                expect(duration).toBeDefined()
            })
    )

    it.effect(
        "should return an InvalidDataError when it exceeds the maximum number of retries",
        () =>
            FX.gen(function* () {
                const model = new FakeListChatModel({
                    responses: [
                        `{"name": "Anna"}`,
                        `{"age": 42}`,
                        `"name": "Anna", "age": 42}`,
                        `{"name": "Anna"}`
                    ]
                })

                const error = yield* pipe(
                    context,
                    runPrompt(prompt, model, {retryTimes: 2}),
                    FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).toMatch(
                    `User
└─ ["age"]
   └─ is missing`
                )
            })
    )
})
