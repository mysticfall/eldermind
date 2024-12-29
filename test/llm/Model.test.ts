import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import {Duration, pipe} from "effect"
import * as FX from "effect/Effect"
import {
    createOpenAICompatibleModel,
    LlmApiKey,
    LlmEndpoint,
    LlmFrequencyPenalty,
    LlmMaxTokens,
    LlmMinP,
    LlmExecutionError,
    LlmModelId,
    LlmParameters,
    LlmPresencePenalty,
    LlmTemperature,
    LlmTopP,
    runLlm
} from "../../src/llm/Model"
import {ClientOptions} from "@langchain/openai"
import {BaseMessage, HumanMessage} from "@langchain/core/messages"
import {FakeChatModel, FakeListChatModel} from "@langchain/core/utils/testing"
import {CallbackManagerForLLMRun} from "@langchain/core/callbacks/manager"
import {ChatResult} from "@langchain/core/outputs"

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

describe("runLlm", () => {
    it.effect("should return a successful response from the model", () =>
        FX.gen(function* () {
            const model = new FakeListChatModel({
                responses: [
                    "I used to be an adventurer like you. Then I took an arrow in the knee."
                ]
            })

            const response = yield* pipe(
                [new HumanMessage("Hello?")],
                runLlm(model)
            )

            expect(response).toBeDefined()
            expect(response.content).toBe(
                "I used to be an adventurer like you. Then I took an arrow in the knee."
            )
        })
    )

    it.effect("should return an LlmModelExecutionError on model failure", () => {
        class ChatModelFixture extends FakeChatModel {
            _generate(
                _messages: BaseMessage[],
                _options?: this["ParsedCallOptions"],
                _runManager?: CallbackManagerForLLMRun
            ): Promise<ChatResult> {
                return Promise.reject(
                    new Error(
                        "The guard is expected to be shot in his knee but it was on his head."
                    )
                )
            }
        }

        return FX.gen(function* () {
            const model = new ChatModelFixture({})

            const error = yield* pipe(
                [new HumanMessage("Hello?")],
                runLlm(model),
                FX.catchTag(
                    "LlmExecutionError",
                    (e: LlmExecutionError) => FX.succeed(e.message)
                )
            )

            expect(error).toBe(
                "The guard is expected to be shot in his knee but it was on his head."
            )
        })
    })
})
