import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {createHandlebarsMessageTemplateLoader} from "../../src/llm/Handlebars"
import {DataPath, TextDataLoader} from "../../src/common/Data"
import {pipe} from "effect"

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
})
