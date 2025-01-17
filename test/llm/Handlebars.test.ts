import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {
    createHandlebarsMessageTemplateLoader,
    registerPartial
} from "../../src/llm/Handlebars"
import {DataPath, InvalidDataError, TextDataLoader} from "../../src/common/Data"
import {pipe} from "effect"
import Handlebars from "handlebars"

describe("createHandlebarsMessageTemplateLoader", () => {
    it.effect.each<{
        messageType: "system" | "human" | "ai"
        title: string
        path: string
        content: string
    }>([
        {
            messageType: "system",
            title: "Skyrim",
            path: "es5.md",
            content: "Game: Skyrim, Path: es5.md"
        },
        {
            messageType: "human",
            title: "Oblivion",
            path: "es4.md",
            content: "Game: Oblivion, Path: es4.md"
        },
        {
            messageType: "ai",
            title: "Morrowind",
            path: "es3.md",
            content: "Game: Morrowind, Path: es3.md"
        }
    ])(
        "should create a DataLoader that returns MessageTemplate from a Handlebars template",
        ({messageType, title, path, content}) =>
            FX.gen(function* () {
                const textLoader: TextDataLoader = path =>
                    FX.succeed(`Game: {{title}}, Path: ${path}`)

                const loader = createHandlebarsMessageTemplateLoader(
                    textLoader,
                    {messageType}
                )

                const template = yield* pipe(path, DataPath.make, loader)
                const message = yield* template({
                    title
                })

                expect(message.getType()).toBe(messageType)
                expect(message.content).toBe(content)
            })
    )

    it.effect.each([
        {path: "skyrim.md", type: "human"},
        {path: "system/skyrim.md", type: "system"},
        {path: "data/system/skyrim.md", type: "system"},
        {path: "data/skyrim.md", type: "human"}
    ])(
        "should determine the message type from the path, if messageType option is omitted",
        ({path, type}) =>
            FX.gen(function* () {
                const textLoader: TextDataLoader = () => FX.succeed("Skyrim")

                const loader = pipe(
                    textLoader,
                    createHandlebarsMessageTemplateLoader
                )

                const template = yield* pipe(path, DataPath.make, loader)
                const message = yield* template({})

                expect(message.getType()).toBe(type)
            })
    )

    it.effect(
        "should return an InvalidDataError when given an invalid Handlebars template",
        () =>
            FX.gen(function* () {
                const textLoader: TextDataLoader = () => FX.succeed("{{>game}")

                const loader = pipe(
                    textLoader,
                    createHandlebarsMessageTemplateLoader
                )

                const error = yield* pipe(
                    "invalid.md",
                    DataPath.make,
                    loader,
                    FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).toBe(`Failed to compile template: invalid.md
Parse error on line 1:
{{>game}
-------^
Expecting 'CLOSE_RAW_BLOCK', 'CLOSE', 'CLOSE_UNESCAPED', 'OPEN_SEXPR', 'CLOSE_SEXPR', 'ID', 'OPEN_BLOCK_PARAMS', 'STRING', 'NUMBER', 'BOOLEAN', 'UNDEFINED', 'NULL', 'DATA', 'SEP', got 'INVALID'`)
            })
    )
})

describe("registerPartial", () => {
    it.effect(
        "should read and register a Handlebars partial at the given path",
        () =>
            FX.gen(function* () {
                const loader: TextDataLoader = path => FX.succeed(path)

                const register = pipe(loader, registerPartial)
                const path = pipe("data/Skyrim.md", DataPath.make)

                yield* register(path, "game")

                const text = Handlebars.compile("Skyrim: {{>game}}")({})

                expect(text).toBe("Skyrim: data/Skyrim.md")
            })
    )

    it.effect(
        "should use the base name of the given file as the partial name when no name is provided",
        () =>
            FX.gen(function* () {
                const loader: TextDataLoader = path => FX.succeed(path)

                const register = pipe(loader, registerPartial)
                const path = pipe("data/game.md", DataPath.make)

                yield* register(path)

                const text = Handlebars.compile("Skyrim: {{>game}}")({})

                expect(text).toBe("Skyrim: data/game.md")
            })
    )

    it.effect(
        "should return an InvalidDataError when given an invalid Handlebars template",
        () =>
            FX.gen(function* () {
                const loader: TextDataLoader = () => FX.succeed("{{>game}")

                const register = pipe(loader, registerPartial)
                const path = pipe("invalid.md", DataPath.make)

                const error = yield* pipe(
                    path,
                    register,
                    FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).toBe(`Failed to compile template: invalid.md
Parse error on line 1:
{{>game}
-------^
Expecting 'CLOSE_RAW_BLOCK', 'CLOSE', 'CLOSE_UNESCAPED', 'OPEN_SEXPR', 'CLOSE_SEXPR', 'ID', 'OPEN_BLOCK_PARAMS', 'STRING', 'NUMBER', 'BOOLEAN', 'UNDEFINED', 'NULL', 'DATA', 'SEP', got 'INVALID'`)
            })
    )
})
