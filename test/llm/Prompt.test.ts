import {describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as SC from "effect/Schema"
import {createLlmRunner, LlmExecutionError} from "../../src/llm/Model"
import {
    AIMessageChunk,
    HumanMessage,
    SystemMessage
} from "@langchain/core/messages"
import {FakeChatModel} from "@langchain/core/utils/testing"
import {createPrompt, MessageTemplate} from "../../src/llm/Prompt"
import {Duration, pipe} from "effect"
import {InvalidDataError} from "../../src/common/Data"
import {ContextBuilder} from "../../src/llm/Context"

const schema = SC.Struct({
    name: SC.String.annotations({
        description: "The name of the user"
    }),
    age: SC.Number.annotations({
        description: "The age of the user"
    })
}).annotations({
    description: "User"
})

type User = {
    name: string
}

const user = {
    name: "Anna"
}

describe("createPrompt", () => {
    it.live("should create a prompt with the given information", () =>
        FX.gen(function* () {
            const templates: MessageTemplate[] = [
                ctx =>
                    FX.succeed(
                        new SystemMessage(
                            `Reply using this schema: ${ctx.schema}`
                        )
                    ),
                ctx => FX.succeed(new HumanMessage(`Who is ${ctx.name}?`))
            ]

            const builders: ContextBuilder<User>[] = [ctx => FX.succeed(ctx)]

            const model = new FakeChatModel({})

            const runner = createLlmRunner(model)
            const prompt = createPrompt(templates, builders, schema, runner)

            const spy = vi.spyOn(model, "invoke")

            spy.mockReturnValue(
                pipe(
                    FX.succeed(
                        new AIMessageChunk({
                            content: JSON.stringify({name: "Anna", age: 41}),
                            response_metadata: {
                                model: "fake_model"
                            },
                            usage_metadata: {
                                input_tokens: 20,
                                output_tokens: 30,
                                total_tokens: 50
                            }
                        })
                    ),
                    FX.delay("100 millis"),
                    FX.runPromise
                )
            )

            const response = yield* prompt(user)

            expect(spy).toHaveBeenCalledWith(
                [
                    new SystemMessage(
                        'Reply using this schema: {"$schema":"http://json-schema.org/draft-07/schema#","type":"object","required":["name","age"],"properties":{"name":{"type":"string","description":"The name of the user"},"age":{"type":"number","description":"The age of the user"}},"additionalProperties":false,"description":"User"}'
                    ),
                    new HumanMessage(`Who is ${user.name}?`)
                ],
                undefined
            )

            const {output, duration, metadata, usage} = response

            expect(output.name).toBe("Anna")
            expect(output.age).toBe(41)

            expect(duration).toSatisfy(
                Duration.between({minimum: "80 millis", maximum: "120 millis"})
            )

            expect(metadata).toHaveProperty("model", "fake_model")

            expect(usage).toBeDefined()
            expect(usage).toHaveProperty("input_tokens", 20)
            expect(usage).toHaveProperty("output_tokens", 30)
            expect(usage).toHaveProperty("total_tokens", 50)
        })
    )

    it.effect(
        "should create a prompt that returns an LlmModelExecutionError on model failure",
        () =>
            FX.gen(function* () {
                const templates: MessageTemplate[] = [
                    ctx => FX.succeed(new HumanMessage(`Who is ${ctx.name}?`))
                ]

                const builders: ContextBuilder<User>[] = [
                    ctx => FX.succeed(ctx)
                ]

                const model = new FakeChatModel({})

                const runner = createLlmRunner(model)
                const prompt = createPrompt(templates, builders, schema, runner)

                const spy = vi.spyOn(model, "invoke")

                spy.mockRejectedValue("Who is Anna?")

                const error = yield* pipe(
                    user,
                    prompt,
                    FX.catchTag("LlmExecutionError", (e: LlmExecutionError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).toBe("Who is Anna?")
            })
    )

    it.effect(
        "should create a prompt that returns an InvalidDataError when it fails to validate the response",
        () =>
            FX.gen(function* () {
                const templates: MessageTemplate[] = [
                    ctx => FX.succeed(new HumanMessage(`Who is ${ctx.name}?`))
                ]

                const builders: ContextBuilder<User>[] = [
                    ctx => FX.succeed(ctx)
                ]

                const model = new FakeChatModel({})

                const runner = createLlmRunner(model)
                const prompt = createPrompt(templates, builders, schema, runner)

                const spy = vi.spyOn(model, "invoke")

                spy.mockResolvedValue(
                    new AIMessageChunk({
                        content: JSON.stringify({name: "Anna"}),
                        response_metadata: {
                            model: "fake_model"
                        }
                    })
                )

                const error = yield* pipe(
                    user,
                    prompt,
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
        "should create a prompt that retries up to the given number of times if it fails with InvalidDataError",
        () =>
            FX.gen(function* () {
                const templates: MessageTemplate[] = [
                    ctx => FX.succeed(new HumanMessage(`Who is ${ctx.name}?`))
                ]

                const builders: ContextBuilder<User>[] = [
                    ctx => FX.succeed(ctx)
                ]

                const model = new FakeChatModel({})

                const runner = createLlmRunner(model)
                const prompt = createPrompt(
                    templates,
                    builders,
                    schema,
                    runner,
                    {retryTimes: 2}
                )

                const spy = vi.spyOn(model, "invoke")

                spy.mockResolvedValueOnce(
                    new AIMessageChunk({
                        content: JSON.stringify({name: "Anna"}),
                        response_metadata: {
                            model: "fake_model"
                        }
                    })
                )
                    .mockResolvedValueOnce(
                        new AIMessageChunk({
                            content: JSON.stringify({name: "Anna"}),
                            response_metadata: {
                                model: "fake_model"
                            }
                        })
                    )
                    .mockResolvedValueOnce(
                        new AIMessageChunk({
                            content: JSON.stringify({name: "Anna", age: 41}),
                            response_metadata: {
                                model: "fake_model"
                            }
                        })
                    )

                const {output} = yield* pipe(user, prompt)

                expect(output.name).toBe("Anna")
                expect(output.age).toBe(41)
            })
    )

    it.effect(
        "should create a prompt that returns an InvalidDataError when it exceeds the maximum number of retries",
        () =>
            FX.gen(function* () {
                const templates: MessageTemplate[] = [
                    ctx => FX.succeed(new HumanMessage(`Who is ${ctx.name}?`))
                ]

                const builders: ContextBuilder<User>[] = [
                    ctx => FX.succeed(ctx)
                ]

                const model = new FakeChatModel({})

                const runner = createLlmRunner(model)
                const prompt = createPrompt(
                    templates,
                    builders,
                    schema,
                    runner,
                    {retryTimes: 1}
                )

                const spy = vi.spyOn(model, "invoke")

                spy.mockResolvedValueOnce(
                    new AIMessageChunk({
                        content: JSON.stringify({name: "Anna"}),
                        response_metadata: {
                            model: "fake_model"
                        }
                    })
                )
                    .mockResolvedValueOnce(
                        new AIMessageChunk({
                            content: JSON.stringify({name: "Anna"}),
                            response_metadata: {
                                model: "fake_model"
                            }
                        })
                    )
                    .mockResolvedValueOnce(
                        new AIMessageChunk({
                            content: JSON.stringify({name: "Anna", age: 41}),
                            response_metadata: {
                                model: "fake_model"
                            }
                        })
                    )

                const error = yield* pipe(
                    user,
                    prompt,
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
