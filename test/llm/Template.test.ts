import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {DataPath, TextDataLoader} from "../../src/common/Data"
import {createTemplateLoader, TemplateCompiler} from "../../src/llm/Template"
import {pipe} from "effect"
import {ReadonlyRecord} from "effect/Record"

describe("createTemplateDataLoader", () => {
    const loader: TextDataLoader = (path: DataPath) =>
        FX.succeed(`Path: ${path}, Title: @title`)

    const compiler: TemplateCompiler = text =>
        pipe(
            (context: ReadonlyRecord<string, unknown>) =>
                FX.succeed(
                    text.replaceAll("@title", context["title"] as string)
                ),
            FX.succeed
        )

    it.effect(
        "should create a TemplateDataLoader from the given compiler and text data loader",
        () =>
            FX.gen(function* () {
                const loadTemplate = createTemplateLoader(loader, compiler)

                const template = yield* pipe(
                    "data/template.txt",
                    DataPath.make,
                    loadTemplate
                )

                const text = yield* template({title: "Skyrim", edition: "VR"})

                expect(text).toBe("Path: data/template.txt, Title: Skyrim")
            })
    )
})
