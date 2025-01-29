import {basename, extname} from "path"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as A from "effect/Array"
import * as O from "effect/Option"
import * as ST from "effect/String"
import Handlebars, {HelperDelegate} from "handlebars"
import {DataPath, InvalidDataError, TextDataLoader} from "../common/Data"
import {flow, pipe} from "effect"
import {PlatformError} from "@effect/platform/Error"
import {TemplateCompiler} from "./Template"

export function compileHandlebarsTemplate(
    options?: CompileOptions
): (source: string) => Effect<HandlebarsTemplateDelegate, InvalidDataError> {
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
                                e => `Failed to compile template: ${text}\n${e}`
                            ),
                            O.getOrElse(
                                () => `Failed to compile template: ${text}`
                            )
                        ),
                        cause: e
                    })
                )
            )
        )
}

export function createHandlebarsTemplateCompiler(
    options?: CompileOptions
): TemplateCompiler {
    return flow(
        compileHandlebarsTemplate(options),
        FX.map(t => ctx => FX.succeed(t(ctx)))
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
            const source = yield* pipe(path, loader)

            const template = yield* pipe(
                source,
                compileHandlebarsTemplate(options)
            )

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

export const multilineIndent: HelperDelegate = (
    text: string,
    indent: number = 4
): string =>
    pipe(
        text,
        ST.trim,
        ST.split("\n"),
        A.map(line => " ".repeat(indent) + line.trim())
    ).join("\n")
