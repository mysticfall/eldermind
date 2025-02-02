import {marked, MarkedOptions, Parser, Renderer, Token, Tokens} from "marked"
import {pipe} from "effect"
import * as A from "effect/Array"
import * as STR from "effect/String"

/**
 * Options for rendering plain text using the {@link PlainTextRenderer}.
 * This interface extends {@link MarkedOptions} interface.
 */
export interface PlainTextRendererOptions {
    readonly concatenateList?: boolean
    readonly headerChar?: string
    readonly parserOptions?: MarkedOptions
}

const DefaultOptions: MarkedOptions = {
    gfm: true,
    breaks: true
}

/**
 * An implementation of {@link Renderer} which renders a Markdown input mostly verbatim, while normalising
 * and compacting it.
 * @implements {@link Renderer}
 */
export class PlainTextRenderer implements Renderer {
    private readonly headerChar: string

    private readonly concatenateList: boolean

    readonly parser: Parser

    readonly options: MarkedOptions

    constructor(options?: PlainTextRendererOptions) {
        this.options = {...DefaultOptions, ...options?.parserOptions}
        this.parser = new Parser(this.options)

        this.headerChar = options?.headerChar ?? "#"
        this.concatenateList = options?.concatenateList ?? false
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    space(_token: Tokens.Space): string {
        return "\n"
    }

    code({text, lang, codeBlockStyle}: Tokens.Code): string {
        if (codeBlockStyle === "indented") {
            return pipe(
                text.split("\n"),
                A.map(STR.trim),
                A.filter(STR.isNonEmpty),
                A.map(line => "    " + line),
                A.join("\n")
            )
        }

        return ["```", lang ?? "", "\n", text, "\n```\n"].join("")
    }

    blockquote({text}: Tokens.Blockquote): string {
        return ["> ", text, "\n"].join("")
    }

    html({text}: Tokens.HTML | Tokens.Tag): string {
        return text
    }

    heading({depth, tokens}: Tokens.Heading): string {
        const text = this.parser.parseInline(tokens)

        return pipe(
            A.range(1, depth),
            A.map(() => this.headerChar),
            A.append(" "),
            A.append(text),
            A.append("\n")
        ).join("")
    }

    hr(): string {
        return "---\n"
    }

    list({items, ordered}: Tokens.List): string {
        const removePeriod = (s: string) =>
            s.endsWith(".") ? s.substring(0, s.length - 1) : s

        const itemSeparator = this.concatenateList ? "; " : "\n"

        return (
            pipe(
                items,
                A.map(i => this.listitem(i)),
                A.map((text, i) => {
                    if (!this.concatenateList) {
                        return ordered
                            ? [i + 1, ". ", text].join("")
                            : ["*", text].join(" ")
                    }

                    return i < items.length - 1 ? removePeriod(text) : text
                })
            )
                .join(itemSeparator)
                .trim() + "\n"
        )
    }

    listitem({text, task, checked}: Tokens.ListItem): string {
        if (task) {
            return [checked ? "[x] " : "[ ] ", text].join("")
        }

        return text
    }

    checkbox({checked}: Tokens.Checkbox): string {
        return checked ? "[x]" : "[ ]"
    }

    paragraph({text, pre}: Tokens.Paragraph): string {
        return [pre ? text : text.replace(/\s*\n\s*/g, " "), "\n"].join("")
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    table(_tokens: Tokens.Table): string {
        return ""
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tablerow(_tokens: Tokens.TableRow): string {
        return ""
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tablecell(_tokens: Tokens.TableCell): string {
        return ""
    }

    strong({text}: Tokens.Strong): string {
        return ["**", text, "**"].join("")
    }

    em({text}: Tokens.Em): string {
        return ["*", text, "*"].join("")
    }

    codespan({text}: Tokens.Codespan): string {
        return ["```", text, "```"].join("")
    }

    br(): string {
        return "\n"
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    del(_tokens: Tokens.Del): string {
        return ""
    }

    link({text}: Tokens.Link): string {
        return text
    }

    image({text}: Tokens.Image): string {
        return text
    }

    text({text}: Tokens.Text | Tokens.Escape | Tokens.Tag): string {
        return text
    }
}

export function renderMarkdown(
    tokens: Token[],
    options?: PlainTextRendererOptions
): string {
    return pipe(
        marked.parser(tokens, {renderer: new PlainTextRenderer(options)}),
        STR.trim
    )
}
