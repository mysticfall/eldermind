import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as O from "effect/Option"
import {
    createTextFileLoader,
    FilePath,
    FilePathResolver
} from "../../src/data/File"
import {pipe} from "effect"
import {NodeContext} from "@effect/platform-node"
import {createMarkdownLoader} from "../../src/markdown/Data"
import {DataPath} from "../../src/data/Data"

describe("createMarkdownLoader", () => {
    const resolver: FilePathResolver = (path: DataPath) =>
        FX.succeed(FilePath.make(`test/markdown/fixtures/${path}`))

    it.scoped(
        "should create a MarkdownLoader using the given text file loader",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(
                        resolver,
                        createTextFileLoader,
                        FX.map(createMarkdownLoader)
                    )

                    const {content} = yield* pipe(
                        "markdown.md",
                        DataPath.make,
                        load
                    )

                    expect(content).length(1)

                    const title = pipe(content[0].title, O.getOrNull)

                    expect(title).toBe("Markdown Test")
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should create a MarkdownDataLoader that returns a SystemError for a non-existent file",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(
                        resolver,
                        createTextFileLoader,
                        FX.map(createMarkdownLoader)
                    )

                    const error = yield* pipe(
                        "deleted.md",
                        DataPath.make,
                        load,
                        FX.catchTag("SystemError", e => FX.succeed(e.reason))
                    )

                    expect(error).toBe("NotFound")
                }),
                FX.provide(NodeContext.layer)
            )
    )
})
