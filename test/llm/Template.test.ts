import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {DataPath, TextDataLoader} from "../../src/common/Data"
import {
    ContextBuilder,
    createTemplateLoader,
    TemplateCompiler,
    TemplateContext
} from "../../src/llm/Template"
import {pipe} from "effect"

describe("ContextBuilder", () => {
    type User = {
        name: string
    }

    const user = {
        name: "Anna"
    }

    describe("merge", () => {
        it.effect(
            "should merge the given context builders into a single builder",
            () =>
                FX.gen(function* () {
                    const name: ContextBuilder<User> = c => FX.succeed(c)
                    const age: ContextBuilder<User> = _c =>
                        FX.succeed({age: 42})

                    const builder = ContextBuilder.merge(name, age)

                    const context = yield* builder(user)

                    expect(context).toHaveProperty("name", "Anna")
                    expect(context).toHaveProperty("age", 42)
                })
        )
    })

    describe("union", () => {
        it.effect(
            "should return a context builder that creates a nested context from the given context builders",
            () =>
                FX.gen(function* () {
                    const name: ContextBuilder<User> = c => FX.succeed(c)

                    const lower: ContextBuilder<User> = c =>
                        FX.succeed({
                            name: c.name.toLowerCase()
                        })

                    const upper: ContextBuilder<User> = c =>
                        FX.succeed({
                            name: c.name.toUpperCase()
                        })

                    const builder = pipe(
                        name,
                        ContextBuilder.append({lower, upper})
                    )

                    const context = yield* builder(user)

                    expect(context).toHaveProperty("name", "Anna")
                    expect(context).toHaveProperty("lower", {name: "anna"})
                    expect(context).toHaveProperty("upper", {name: "ANNA"})
                })
        )
    })

    describe("append", () => {
        it.effect(
            "should add given context builders to the parent as nested contexts",
            () =>
                FX.gen(function* () {
                    const lower: ContextBuilder<User> = c =>
                        FX.succeed({
                            name: c.name.toLowerCase()
                        })

                    const upper: ContextBuilder<User> = c =>
                        FX.succeed({
                            name: c.name.toUpperCase()
                        })

                    const builder = pipe(
                        ContextBuilder.union({
                            lower,
                            upper
                        })
                    )

                    const context = yield* builder(user)

                    expect(context).toHaveProperty("lower", {name: "anna"})
                    expect(context).toHaveProperty("upper", {name: "ANNA"})
                })
        )
    })
})

describe("createTemplateDataLoader", () => {
    const loader: TextDataLoader = (path: DataPath) =>
        FX.succeed(`Path: ${path}, Title: @title`)

    const compiler: TemplateCompiler = text =>
        pipe(
            (context: TemplateContext) =>
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
