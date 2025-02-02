import {basename, extname} from "path"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as A from "effect/Array"
import * as DU from "effect/Duration"
import * as O from "effect/Option"
import * as STR from "effect/String"
import Handlebars, {HelperDelegate} from "handlebars"
import {DataPath, InvalidDataError, TextDataLoader} from "../common/Data"
import {flow, pipe} from "effect"
import {PlatformError} from "@effect/platform/Error"
import {TemplateCompiler} from "./Template"
import {asDuration, GameTime, getGameTime} from "skyrim-effect/game/Time"

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
                O.map(STR.trim),
                O.filter(STR.isNonEmpty),
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
    indent = 4
): string =>
    pipe(
        text,
        STR.trim,
        STR.split("\n"),
        A.map(line => " ".repeat(indent) + line.trim())
    ).join("\n")

export function sinceTime(clock: () => GameTime = getGameTime): HelperDelegate {
    return (time: GameTime): string =>
        pipe(
            clock(),
            asDuration,
            DU.subtract(pipe(time, asDuration)),
            DU.format,
            STR.split(" "),
            A.filter(s => !s.endsWith("ms") && !s.endsWith("ns")),
            O.some,
            O.filter(A.isNonEmptyArray),
            O.map(A.append("ago")),
            O.getOrElse(() => A.of("just now"))
        ).join(" ")
}
