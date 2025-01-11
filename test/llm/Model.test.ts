import {describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import {Duration, pipe} from "effect"
import * as FX from "effect/Effect"
import {
    createLlmRunner,
    createOpenAICompatibleModel,
    LlmApiKey,
    LlmEndpoint,
    LlmExecutionError,
    LlmFrequencyPenalty,
    LlmMaxTokens,
    LlmMinP,
    LlmModelId,
    LlmParameters,
    LlmPresencePenalty,
    LlmTemperature,
    LlmTopP
} from "../../src/llm/Model"
import {ClientOptions} from "@langchain/openai"
import {AIMessageChunk, HumanMessage} from "@langchain/core/messages"
import {FakeChatModel} from "@langchain/core/utils/testing"

describe("createOpenAICompatibleModel", () => {
    it("should create a ChatOpenAI instance with the given configuration", () => {
        const config = {
            model: LlmModelId.make("llama-3"),
            endpoint: LlmEndpoint.make("https://example.com"),
            apiKey: LlmApiKey.make("test-api-key"),
            timeout: Duration.seconds(30),
            parameters: LlmParameters.make({
                maxTokens: LlmMaxTokens.make(2048),
                temperature: LlmTemperature.make(0.7),
                topP: LlmTopP.make(0.9),
                minP: LlmMinP.make(0.1),
                presencePenalty: LlmPresencePenalty.make(0.5),
                frequencyPenalty: LlmFrequencyPenalty.make(-0.3)
            })
        }

        const model = createOpenAICompatibleModel(config)

        expect(model).toBeDefined()

        const {clientConfig} = model as unknown as {clientConfig: ClientOptions}

        expect(clientConfig).toBeDefined()

        expect(model.apiKey).toBe("test-api-key")
        expect(model.model).toBe("llama-3")
        expect(model.timeout).toBe(30)
        expect(model.temperature).toBe(0.7)
        expect(model.maxTokens).toBe(2048)
        expect(model.topP).toBe(0.9)
        expect(model.presencePenalty).toBe(0.5)
        expect(model.frequencyPenalty).toBe(-0.3)

        expect(clientConfig.baseURL).toBe("https://example.com")

        expect(model.modelKwargs?.["min_p"]).toBe(0.1)
    })
})

describe("createLlmRunner", () => {
    it.live("should return a successful response from the model", () =>
        FX.gen(function* () {
            const model = new FakeChatModel({})

            const spy = vi.spyOn(model, "invoke")

            spy.mockReturnValue(
                pipe(
                    FX.succeed(
                        new AIMessageChunk({
                            content:
                                "I used to be an adventurer like you. Then I took an arrow in the knee.",
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

            const {output, duration, metadata, usage} = yield* pipe(
                [new HumanMessage("Hello?")],
                createLlmRunner(model)
            )

            expect(spy).toHaveBeenCalledWith(
                [new HumanMessage("Hello?")],
                undefined
            )

            expect(output).toBe(
                "I used to be an adventurer like you. Then I took an arrow in the knee."
            )

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
        "should return an LlmModelExecutionError on model failure",
        () => {
            return FX.gen(function* () {
                const model = new FakeChatModel({})

                const spy = vi.spyOn(model, "invoke")

                spy.mockRejectedValue(
                    "The guard is expected to be shot in his knee but it was on his head."
                )

                const error = yield* pipe(
                    [new HumanMessage("Hello?")],
                    createLlmRunner(model),
                    FX.catchTag("LlmExecutionError", (e: LlmExecutionError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).toBe(
                    "The guard is expected to be shot in his knee but it was on his head."
                )
            })
        }
    )
})
