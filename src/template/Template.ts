import {TemplateContext} from "./Context"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import {BaseError} from "../common/Error"
import {InvalidDataError, TextDataLoader, TypedDataLoader} from "../common/Data"
import {flow} from "effect"

export class MissingContextDataError extends BaseError<MissingContextDataError>(
    "MissingContextDataError",
    {
        message: "Missing template context data."
    }
) {}

export type Template = (
    context: TemplateContext
) => Effect<string, MissingContextDataError>

export type TemplateCompiler = (
    source: string
) => Effect<Template, InvalidDataError>

export type TemplateLoader = TypedDataLoader<Template>

export function createTemplateLoader(
    loader: TextDataLoader,
    compiler: TemplateCompiler
): TemplateLoader {
    return flow(loader, FX.flatMap(compiler))
}
