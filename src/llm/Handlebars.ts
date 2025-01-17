import {basename, extname} from "path"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as O from "effect/Option"
import * as ST from "effect/String"
import Handlebars from "handlebars"
import {
    DataPath,
    InvalidDataError,
    TextDataLoader,
    TypedDataLoader
} from "../common/Data"
import {MessageTemplate} from "./Prompt"
import {flow, pipe} from "effect"
import {AIMessage, HumanMessage, SystemMessage} from "@langchain/core/messages"
import {PlatformError} from "@effect/platform/Error"

type HandlebarsMessageTemplateLoader = TypedDataLoader<MessageTemplate>

function compile(
    path: DataPath,
    options?: CompileOptions
): (text: string) => Effect<HandlebarsTemplateDelegate, InvalidDataError> {
    return text =>
        pipe(
            FX.try(function () {
                const template = Handlebars.compile(text, options)

                //Eagerly validate the syntax of the template:
                template({})

                return template
            }),
            FX.catchTag("UnknownException", e =>
                FX.fail(
                    new InvalidDataError({
                        message: pipe(
                            e.error instanceof Error
                                ? e.error.message
                                : undefined,
                            O.fromNullable,
                            O.map(
                                e => `Failed to compile template: ${path}\n${e}`
                            ),
                            O.getOrElse(
                                () => `Failed to compile template: ${path}`
                            )
                        ),
                        cause: e
                    })
                )
            )
        )
}

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
            FX.flatMap(compile(path, options?.compile)),
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

export function registerPartial(
    loader: TextDataLoader
): (
    path: DataPath,
    name?: string,
    options?: CompileOptions
) => Effect<void, InvalidDataError | PlatformError> {
    return (path, name, options) =>
        FX.gen(function* () {
            const read = yield* pipe(path, loader)
            const template = yield* pipe(read, compile(path, options))

            const partialName = pipe(
                name,
                O.fromNullable,
                O.map(ST.trim),
                O.filter(ST.isNonEmpty),
                O.getOrElse(() => basename(path, extname(path)))
            )

            yield* FX.logDebug(
                `Registering Handlebars partial "${partialName}" from path: ${path}`
            )

            Handlebars.registerPartial(partialName, template)
        })
}
