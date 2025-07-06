import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import {
    ContextDataError,
    InvalidDataError,
    TextDataLoader,
    TypedDataLoader
} from "../data/Data"
import {flow} from "effect"
import {ReadonlyRecord} from "effect/Record"

export type Template = (
    context: ReadonlyRecord<string, unknown>
) => Effect<string, ContextDataError>

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
