import * as FX from "effect/Effect"
import {flow} from "effect"
import {MarkdownDocument, parseMarkdown} from "./Parser"
import {DataLoader, TextDataLoader} from "../common/Data"

export type MarkdownLoader = DataLoader<MarkdownDocument>

export function createMarkdownLoader(
    loader: TextDataLoader
): MarkdownLoader {
    return flow(loader, FX.map(parseMarkdown))
}
