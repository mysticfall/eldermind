import {pipe, Redacted} from "effect"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import {OpenAiClient, OpenAiLanguageModel} from "@effect/ai-openai"
import {AiLanguageModel} from "@effect/ai/AiLanguageModel"
import {HttpClient} from "@effect/platform/HttpClient"
import {ConfigError} from "effect/ConfigError"
import {Tokenizer} from "@effect/ai/Tokenizer"

export const LlmModelId = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("LlmModelId"),
    SC.annotations({
        title: "LLM Model ID",
        description: "Identifier for the LLM model"
    })
)

export type LlmModelId = typeof LlmModelId.Type

export const LlmApiKey = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("LlmApiKey"),
    SC.annotations({
        title: "LLM API Key",
        description: "API key for the LLM service provider"
    })
)

export type LlmApiKey = typeof LlmApiKey.Type

export const LlmEndpoint = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("LlmEndpoint"),
    SC.annotations({
        title: "LLM Endpoint",
        description: "URL for the LLM service endpoint"
    })
)

export type LlmEndpoint = typeof LlmEndpoint.Type

export const LlmMaxTokens = pipe(
    SC.Number,
    SC.int(),
    SC.between(-1, 4096),
    SC.brand("LlmMaxTokens")
)

export type LlmMaxTokens = typeof LlmMaxTokens.Type

export const LlmTemperature = pipe(
    SC.Number,
    SC.nonNegative(),
    SC.between(0, 2),
    SC.brand("LlmTemperature")
)

export type LlmTemperature = typeof LlmTemperature.Type

export const LlmTopP = pipe(SC.Number, SC.between(0, 1), SC.brand("LlmTopP"))

export type LlmTopP = typeof LlmTopP.Type

export const LlmMinP = pipe(SC.Number, SC.between(0, 1), SC.brand("LlmMinP"))

export type LlmMinP = typeof LlmMinP.Type

export const LlmPresencePenalty = pipe(
    SC.Number,
    SC.between(-2, 2),
    SC.brand("LlmPresencePenalty")
)

export type LlmPresencePenalty = typeof LlmPresencePenalty.Type

export const LlmFrequencyPenalty = pipe(
    SC.Number,
    SC.between(-2, 2),
    SC.brand("LlmFrequencyPenalty")
)

export type LlmFrequencyPenalty = typeof LlmFrequencyPenalty.Type

export const LlmRepetitionPenalty = pipe(
    SC.Number,
    SC.between(0, 2),
    SC.brand("LlmRepetitionPenalty")
)

export type LlmRepetitionPenalty = typeof LlmRepetitionPenalty.Type

export const LlmSeed = pipe(SC.Number, SC.int(), SC.brand("LlmSeed"))

export type LlmSeed = typeof LlmSeed.Type

export const LlmParameters = pipe(
    SC.Struct({
        maxTokens: SC.optional(LlmMaxTokens),
        temperature: SC.optional(LlmTemperature),
        topP: SC.optional(LlmTopP),
        minP: SC.optional(LlmMinP),
        presencePenalty: SC.optional(LlmPresencePenalty),
        frequencyPenalty: SC.optional(LlmFrequencyPenalty),
        repetitionPenalty: SC.optional(LlmRepetitionPenalty),
        seed: SC.optional(LlmSeed)
    }),
    SC.annotations({
        title: "LLM Parameters",
        description: "Parameters for the LLM model."
    })
)

export type LlmParameters = typeof LlmParameters.Type

export const LlmConfig = SC.Struct({
    model: LlmModelId,
    endpoint: SC.optional(LlmEndpoint),
    apiKey: SC.optional(LlmApiKey),
    parameters: SC.optionalWith(LlmParameters, {
        default: () => LlmParameters.make({})
    })
})

export type LlmConfig = typeof LlmConfig.Type

export function withOpenAI<A, E, R extends AiLanguageModel>(
    config: LlmConfig
): (
    task: Effect<A, E, R>
) => Effect<
    A,
    E | ConfigError,
    Exclude<R, AiLanguageModel | Tokenizer> | HttpClient
> {
    const {model, endpoint, apiKey, parameters} = config
    const {
        temperature,
        maxTokens,
        topP,
        //FIXME: minP - Not currently supported by @effect/ai-openai,
        presencePenalty,
        frequencyPenalty,
        //FIXME: repetitionPenalty - Not currently supported by @effect/ai-openai,
        seed
    } = parameters

    const client = OpenAiClient.layer({
        apiKey: apiKey ? Redacted.make(apiKey) : undefined,
        apiUrl: endpoint
    })

    return task =>
        pipe(
            FX.gen(function* () {
                const provider = yield* OpenAiLanguageModel.model(model, {
                    temperature,
                    max_tokens: maxTokens,
                    top_p: topP,
                    presence_penalty: presencePenalty,
                    frequency_penalty: frequencyPenalty,
                    seed
                })

                return yield* provider.use(task)
            }),
            FX.provide(client)
        )
}
