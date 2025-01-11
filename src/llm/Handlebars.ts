import * as FX from "effect/Effect"
import Handlebars from "handlebars"
import {InvalidDataError, TextDataLoader, TypedDataLoader} from "../common/Data"
import {MessageTemplate} from "./Prompt"
import {flow, pipe} from "effect"
import {AIMessage, HumanMessage, SystemMessage} from "@langchain/core/messages"

type HandlebarsMessageTemplateLoader = TypedDataLoader<MessageTemplate>

export function createHandlebarsMessageTemplateLoader(
    loader: TextDataLoader,
    options?: {
        messageType?: "system" | "human" | "ai"
        compile?: CompileOptions
    }
): HandlebarsMessageTemplateLoader {
    return path =>
        pipe(
            path,
            loader,
            FX.flatMap(text =>
                FX.try(() => Handlebars.compile(text, options?.compile))
            ),
            FX.catchTag("UnknownException", e =>
                FX.fail(
                    new InvalidDataError({
                        message:
                            e.error instanceof Error
                                ? e.error.message
                                : `Failed to compile Handlebars template: ${path}`,
                        cause: e
                    })
                )
            ),
            FX.map(template =>
                flow(
                    template,
                    function (text) {
                        switch (options?.messageType) {
                            case "system":
                                return new SystemMessage(text)
                            case "human":
                                return new HumanMessage(text)
                            case "ai":
                                return new AIMessage(text)
                            case undefined:
                            default:
                                return path.includes("system")
                                    ? new SystemMessage(text)
                                    : new HumanMessage(text)
                        }
                    },
                    FX.succeed
                )
            )
        )
}
