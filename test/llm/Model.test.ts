import {afterEach, describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import {Layer, pipe} from "effect"
import * as FX from "effect/Effect"
import {
    createOpenAICompatibleLayer,
    LlmConfig,
    LlmEndpoint
} from "../../src/llm/Model"
import {FetchHttpClient} from "@effect/platform"
import * as LLM from "@effect/ai/AiLanguageModel"

const mockFetch = vi.fn<typeof fetch>()

describe("createOpenAICompatibleLayer", () => {
    afterEach(() => mockFetch.mockRestore())

    it.effect.prop(
        "should create an OpenAI compatible LLM provider with the given configuration",
        [LlmConfig],
        fixtures =>
            FX.gen(function* () {
                const normalised = JSON.parse(JSON.stringify(fixtures[0]))

                const config = {
                    ...normalised,
                    endpoint: LlmEndpoint.make("http://localhost:8000/api/v1")
                }

                const FetchTest = Layer.succeed(
                    FetchHttpClient.Fetch,
                    mockFetch
                )

                const TestLayer = pipe(
                    FetchHttpClient.layer,
                    Layer.provide(FetchTest)
                )

                const layer = yield* pipe(
                    config,
                    createOpenAICompatibleLayer,
                    FX.provide(TestLayer)
                )

                mockFetch.mockRestore()
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
                                        content:
                                            "Hello! How can I assist you today?",
                                        refusal: null,
                                        annotations: []
                                    },
                                    logprobs: null,
                                    finish_reason: "stop"
                                }
                            ],
                            usage: {
                                prompt_tokens: 19,
                                completion_tokens: 10,
                                total_tokens: 29,
                                prompt_tokens_details: {
                                    cached_tokens: 0,
                                    audio_tokens: 0
                                },
                                completion_tokens_details: {
                                    reasoning_tokens: 0,
                                    audio_tokens: 0,
                                    accepted_prediction_tokens: 0,
                                    rejected_prediction_tokens: 0
                                }
                            },
                            service_tier: "default"
                        })
                    )
                )

                const text = yield* pipe(
                    LLM.generateText({prompt: "Hello?"}),
                    FX.map(r => r.text),
                    FX.provide(layer)
                )

                expect(text).toBe("Hello! How can I assist you today?")

                expect(mockFetch).toHaveBeenCalledOnce()

                const [url, body] = mockFetch.mock.calls[0] as [
                    URL,
                    RequestInit
                ]

                expect(url?.toString()).toBe(
                    "http://localhost:8000/api/v1/chat/completions"
                )

                expect(body.method).toBe("POST")

                const data = pipe(
                    new TextDecoder().decode(body.body as ArrayBuffer),
                    JSON.parse
                )

                expect(data["model"]).toBe(config.model)
                expect(data["temperature"]).toBe(config.parameters.temperature)
                expect(data["max_tokens"]).toBe(config.parameters.maxTokens)
                expect(data["top_p"]).toBe(config.parameters.topP)

                //FIXME: Not currently supported by @effect/ai-openai,
                // expect(data["min_p"]).toBe(config.parameters.minP)

                expect(data["presence_penalty"]).toBe(
                    config.parameters.presencePenalty
                )
                expect(data["frequency_penalty"]).toBe(
                    config.parameters.frequencyPenalty
                )

                //FIXME: Not currently supported by @effect/ai-openai,
                // expect(data["repetition_penalty"]).toBe(
                //     config.parameters.repetitionPenalty
                // )

                const messages = data["messages"]

                expect(messages).toBeDefined()
                expect(messages).toHaveLength(1)

                const message = messages[0]

                expect(message["role"]).toBe("user")
                expect(message["content"]).toBe("Hello?")
            })
    )
})
