import {afterEach, describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as SC from "effect/Schema"
import {createPrompt} from "../../src/llm/Prompt"
import {Layer, pipe} from "effect"
import {InvalidDataError} from "../../src/common/Data"
import {OpenAiClient, OpenAiLanguageModel} from "@effect/ai-openai"
import {FetchHttpClient} from "@effect/platform"
import {AiError} from "@effect/ai/AiError"

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

interface User {
    readonly name: string
}

const anna: User = {
    name: "Anna"
}

const mockFetch = vi.fn<typeof fetch>()

const FetchTest = Layer.succeed(FetchHttpClient.Fetch, mockFetch)
const TestLayer = pipe(FetchHttpClient.layer, Layer.provide(FetchTest))

describe("createPrompt", () => {
    afterEach(() => mockFetch.mockRestore())

    it.effect("should create a prompt with the given information", () =>
        FX.gen(function* () {
            const prompt = createPrompt(
                {
                    system: ctx =>
                        FX.succeed(`Reply using this schema: ${ctx.schema}`),
                    user: [ctx => FX.succeed(`Who is ${ctx.name}?`)]
                },
                schema
            )

            mockFetch.mockResolvedValue(
                new Response(
                    JSON.stringify({
                        id: "chatcmpl-4634FGYH345435grf$",
                        object: "chat.completion",
                        created: 1741569952,
                        model: "llama-4",
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: "assistant",
                                    content: JSON.stringify({
                                        name: "Anna",
                                        age: 41
                                    }),
                                    refusal: null
                                },
                                finish_reason: "stop"
                            }
                        ]
                    })
                )
            )

            const model = yield* pipe(
                OpenAiLanguageModel.model("llama-4"),
                FX.provide(OpenAiClient.layer({})),
                FX.provide(TestLayer)
            )

            const {name, age} = yield* pipe(prompt(anna), model.use)

            expect(name).toBe("Anna")
            expect(age).toBe(41)

            const [, body] = mockFetch.mock.calls[0] as [URL, RequestInit]

            const request = pipe(
                new TextDecoder().decode(body.body as ArrayBuffer),
                JSON.parse
            )

            const messages = request["messages"]

            expect(messages).toBeDefined()
            expect(messages).toHaveLength(2)

            const system = messages[0]

            expect(system["role"]).toBe("system")
            expect(system["content"]).toBe(
                "Reply using this schema: " +
                    '{"$schema":"http://json-schema.org/draft-07/schema#",' +
                    '"type":"object",' +
                    '"required":["name","age"],' +
                    '"properties":{' +
                    '"name":{"type":"string","description":"The name of the user"},' +
                    '"age":{"type":"number","description":"The age of the user"}' +
                    "}," +
                    '"additionalProperties":false,' +
                    '"description":"User"}'
            )

            const user = messages[1]

            expect(user["role"]).toBe("user")
            expect(user["content"]).toBe("Who is Anna?")
        })
    )

    it.effect(
        "should create a prompt that returns an AIError when the service provider returns an error",
        () =>
            FX.gen(function* () {
                const prompt = createPrompt(
                    {
                        system: ctx =>
                            FX.succeed(
                                `Reply using this schema: ${ctx.schema}`
                            ),
                        user: [ctx => FX.succeed(`Who is ${ctx.name}?`)]
                    },
                    schema
                )

                mockFetch.mockResolvedValue(
                    new Response(
                        JSON.stringify({
                            error: {
                                message:
                                    "Invalid 'messages[1].content': string too long.",
                                type: "invalid_request_error",
                                param: "messages[1].content",
                                code: "string_above_max_length"
                            }
                        })
                    )
                )

                const model = yield* pipe(
                    OpenAiLanguageModel.model("llama-4"),
                    FX.provide(OpenAiClient.layer({})),
                    FX.provide(TestLayer)
                )

                const error = yield* pipe(
                    prompt(anna),
                    model.use,
                    FX.catchTag("AiError", (e: AiError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).toBe(
                    "OpenAiLanguageModel.generateText: An error occurred"
                )
            })
    )

    it.effect(
        "should create a prompt that retries up to the given number of times if it fails with InvalidDataError",
        () =>
            FX.gen(function* () {
                const prompt = createPrompt(
                    {
                        system: ctx =>
                            FX.succeed(
                                `Reply using this schema: ${ctx.schema}`
                            ),
                        user: [ctx => FX.succeed(`Who is ${ctx.name}?`)]
                    },
                    schema,
                    {
                        retryTimes: 2
                    }
                )

                mockFetch
                    .mockResolvedValueOnce(
                        new Response(
                            JSON.stringify({
                                id: "chatcmpl-4634FGYH345435grf$",
                                object: "chat.completion",
                                created: 1741569952,
                                model: "llama-4",
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: "assistant",
                                            content: JSON.stringify({
                                                name: "Anna"
                                            }),
                                            refusal: null
                                        },
                                        finish_reason: "stop"
                                    }
                                ]
                            })
                        )
                    )
                    .mockResolvedValueOnce(
                        new Response(
                            JSON.stringify({
                                id: "chatcmpl-4634FGYH345435grf$",
                                object: "chat.completion",
                                created: 1741569952,
                                model: "llama-4",
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: "assistant",
                                            content: JSON.stringify({
                                                name: "Anna"
                                            }),
                                            refusal: null
                                        },
                                        finish_reason: "stop"
                                    }
                                ]
                            })
                        )
                    )
                    .mockResolvedValueOnce(
                        new Response(
                            JSON.stringify({
                                id: "chatcmpl-4634FGYH345435grf$",
                                object: "chat.completion",
                                created: 1741569952,
                                model: "llama-4",
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: "assistant",
                                            content: JSON.stringify({
                                                name: "Anna",
                                                age: 41
                                            }),
                                            refusal: null
                                        },
                                        finish_reason: "stop"
                                    }
                                ]
                            })
                        )
                    )

                const model = yield* pipe(
                    OpenAiLanguageModel.model("llama-4"),
                    FX.provide(OpenAiClient.layer({})),
                    FX.provide(TestLayer)
                )

                const {name, age} = yield* pipe(prompt(anna), model.use)

                expect(name).toBe("Anna")
                expect(age).toBe(41)
            })
    )

    it.effect(
        "should create a prompt that returns an InvalidDataError when it exceeds the maximum number of retries",
        () =>
            FX.gen(function* () {
                const prompt = createPrompt(
                    {
                        system: ctx =>
                            FX.succeed(
                                `Reply using this schema: ${ctx.schema}`
                            ),
                        user: [ctx => FX.succeed(`Who is ${ctx.name}?`)]
                    },
                    schema,
                    {
                        retryTimes: 1
                    }
                )

                mockFetch
                    .mockResolvedValueOnce(
                        new Response(
                            JSON.stringify({
                                id: "chatcmpl-4634FGYH345435grf$",
                                object: "chat.completion",
                                created: 1741569952,
                                model: "llama-4",
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: "assistant",
                                            content: JSON.stringify({
                                                name: "Anna"
                                            }),
                                            refusal: null
                                        },
                                        finish_reason: "stop"
                                    }
                                ]
                            })
                        )
                    )
                    .mockResolvedValueOnce(
                        new Response(
                            JSON.stringify({
                                id: "chatcmpl-4634FGYH345435grf$",
                                object: "chat.completion",
                                created: 1741569952,
                                model: "llama-4",
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: "assistant",
                                            content: JSON.stringify({
                                                name: "Anna"
                                            }),
                                            refusal: null
                                        },
                                        finish_reason: "stop"
                                    }
                                ]
                            })
                        )
                    )
                    .mockResolvedValueOnce(
                        new Response(
                            JSON.stringify({
                                id: "chatcmpl-4634FGYH345435grf$",
                                object: "chat.completion",
                                created: 1741569952,
                                model: "llama-4",
                                choices: [
                                    {
                                        index: 0,
                                        message: {
                                            role: "assistant",
                                            content: JSON.stringify({
                                                name: "Anna",
                                                age: 41
                                            }),
                                            refusal: null
                                        },
                                        finish_reason: "stop"
                                    }
                                ]
                            })
                        )
                    )

                const model = yield* pipe(
                    OpenAiLanguageModel.model("llama-4"),
                    FX.provide(OpenAiClient.layer({})),
                    FX.provide(TestLayer)
                )

                const error = yield* pipe(
                    prompt(anna),
                    model.use,
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
