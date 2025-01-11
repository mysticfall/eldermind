import {pipe} from "effect"
import * as DU from "effect/Duration"
import {Duration} from "effect/Duration"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import {ChatOpenAI, ChatOpenAIFields} from "@langchain/openai"
import {
    BaseChatModel,
    BaseChatModelCallOptions
} from "@langchain/core/language_models/chat_models"
import {
    BaseMessage,
    MessageContent,
    UsageMetadata
} from "@langchain/core/messages"
import {BaseError} from "../common/Error"
import {ReadonlyRecord} from "effect/Record"

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
        description: "Parameters for the LLM model"
    })
)

export type LlmParameters = typeof LlmParameters.Type

export const LlmConfig = SC.Struct({
    model: LlmModelId,
    endpoint: SC.optional(LlmEndpoint),
    apiKey: SC.optional(LlmApiKey),
    timeout: SC.optionalWith(SC.Duration, {
        default: () => DU.seconds(60)
    }),
    parameters: SC.optionalWith(LlmParameters, {
        default: () => LlmParameters.make({})
    })
})

export type LlmConfig = typeof LlmConfig.Type

export type LlmModelFactory<
    in TConfig extends LlmConfig = LlmConfig,
    out TModel extends BaseChatModel = BaseChatModel
> = (config: TConfig) => TModel

export const createOpenAICompatibleModel: LlmModelFactory<
    LlmConfig,
    ChatOpenAI
> = (config: LlmConfig) => {
    const {model, endpoint, apiKey, timeout, parameters} = config
    const {
        temperature,
        maxTokens,
        topP,
        minP,
        presencePenalty,
        frequencyPenalty,
        repetitionPenalty,
        seed
    } = parameters

    const fields: ChatOpenAIFields = {
        model,
        apiKey,
        timeout: DU.toSeconds(timeout),
        temperature,
        maxTokens,
        topP,
        presencePenalty,
        frequencyPenalty,
        modelKwargs: {
            min_p: minP,
            repetition_penalty: repetitionPenalty,
            seed
        },
        configuration: {
            baseURL: endpoint
        },
        cache: true
    }

    return new ChatOpenAI(fields)
}

export class LlmExecutionError extends BaseError<LlmExecutionError>(
    "LlmExecutionError",
    {
        message: "Data validation failed."
    }
) {}

export interface LlmResponse<T> {
    readonly output: T
    readonly duration: Duration
    readonly metadata: ReadonlyRecord<any, any>
    readonly usage?: UsageMetadata
}

export type LlmRunner = (
    prompt: readonly BaseMessage[]
) => Effect<LlmResponse<MessageContent>, LlmExecutionError>

export function createLlmRunner(
    model: BaseChatModel,
    options?: BaseChatModelCallOptions
): LlmRunner {
    return messages =>
        pipe(
            FX.tryPromise({
                try: () => model.invoke([...messages], options),
                catch: e => {
                    return new LlmExecutionError({
                        message: e instanceof Error ? e.message : e?.toString(),
                        cause: e
                    })
                }
            }),
            FX.timed,
            FX.map(([duration, response]) => ({
                output: response.content,
                duration,
                metadata: response.response_metadata,
                usage: response.usage_metadata
            }))
        )
}
