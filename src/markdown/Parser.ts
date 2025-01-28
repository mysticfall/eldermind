/**
 * Definitions of common types related to parsing of Markdown texts.
 * @module
 */
import * as O from "effect/Option"
import {Option} from "effect/Option"
import * as A from "effect/Array"
import {marked, Token} from "marked"
import {pipe} from "effect"
import matter from "gray-matter"

export interface MarkdownDocument {
    readonly metadata: Record<string, string>
    readonly content: readonly MarkdownContent[]
}

/**
 * Represents a Markdown content with a title, contents, and children.
 */
export interface MarkdownContent {
    /**
     * The title of the Markdown text. It can be an empty string or null if not specified.
     *
     * @readonly
     */
    readonly title: Option<string>

    /**
     * The array of tokens representing the contents of the Markdown text.
     *
     * @readonly
     */
    readonly tokens: readonly Token[]

    /**
     * The array of child {@link MarkdownContent} elements.
     *
     * @readonly
     */
    readonly children: readonly MarkdownContent[]
}

/**
 * Parses Markdown text and returns the structured content.
 *
 * @param {string} text The Markdown text to parse.
 * @return {MarkdownContent} The structured Markdown content.
 */
export function parseMarkdown(text: string): MarkdownDocument {
    const {content, data} = matter(text.trim())

    interface ParseData {
        readonly children: readonly MarkdownContent[]
        readonly tokens: readonly Token[]
        readonly remaining: readonly Token[]
    }

    const collect = (
        remaining: readonly Token[] = marked.lexer(content.trim()),
        children: readonly MarkdownContent[] = A.empty(),
        tokens: readonly Token[] = A.empty(),
        depth = 0
    ): ParseData =>
        pipe(
            O.some(remaining),
            O.filter(A.isNonEmptyReadonlyArray),
            O.map(A.unprepend),
            O.map(([head, tail]) => {
                if (head.type == "heading") {
                    if (head.depth > depth) {
                        const result = collect(
                            tail,
                            A.empty(),
                            A.empty(),
                            depth + 1
                        )

                        const child = {
                            title: O.some(head.text),
                            children: result.children,
                            tokens: result.tokens
                        }

                        return collect(
                            result.remaining,
                            pipe(children, A.append(child)),
                            tokens,
                            depth
                        )
                    } else {
                        return {
                            remaining: remaining,
                            children,
                            tokens
                        }
                    }
                }

                return collect(
                    tail,
                    children,
                    pipe(tokens, A.append(head)),
                    depth
                )
            }),
            O.getOrElse<ParseData>(() => ({
                remaining: A.empty(),
                children,
                tokens
            }))
        )

    const {children, tokens} = collect()

    return {
        content: pipe(
            children,
            A.appendAll(
                pipe(
                    A.of(tokens),
                    A.filter(A.isNonEmptyReadonlyArray),
                    A.map(tokens => ({
                        title: O.none(),
                        tokens,
                        children: A.empty()
                    }))
                )
            )
        ),
        metadata: data
    }
}

const CodeBlock = /```[a-zA-Z0-9]*\n([\s\S]*?)\n```/

export function extractCodeContent(text: string): string {
    const match = text.match(CodeBlock)
    return match ? match[1] : text
}
