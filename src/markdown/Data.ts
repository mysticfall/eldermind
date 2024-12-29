import * as FX from "effect/Effect"
import {flow} from "effect"
import {MarkdownDocument, parseMarkdown} from "./Parser"
import {DataLoader, TextDataLoader} from "../common/Data"

export type MarkdownDataLoader = DataLoader<MarkdownDocument>

export function createMarkdownLoader(
    loader: TextDataLoader
): MarkdownDataLoader {
    return flow(loader, FX.map(parseMarkdown))
}
