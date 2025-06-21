import {afterEach, beforeEach, describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {
    compileHandlebarsTemplate,
    createHandlebarsTemplateCompiler,
    multilineIndent,
    registerPartial,
    sinceTime
} from "../../src/template/Handlebars"
import {DataPath, InvalidDataError, TextDataLoader} from "../../src/common/Data"
import {pipe} from "effect"
import Handlebars from "handlebars"
import * as DU from "effect/Duration"

describe("compileHandlebarsTemplate", () => {
    it.effect("should compile the given text as a Handlebars template", () =>
        FX.gen(function* () {
            const compile = compileHandlebarsTemplate()

            const template = yield* compile(
                "I'm sworn to carry your {{object}}."
            )

            const result = template({object: "cats"})

            expect(result).toBe("I'm sworn to carry your cats.")
        })
    )

    it.effect(
        "should return an InvalidDataError when given an invalid Handlebars template",
        () =>
            FX.gen(function* () {
                const compile = compileHandlebarsTemplate()

                const error = yield* pipe(
                    compile("I'm sworn to carry your {{object}."),
                    FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).toBe(
                    "Failed to compile template: I'm sworn to carry your " +
                        "{{object}.\nParse error on line 1:\n... carry your " +
                        "{{object}.\n-----------------------^\nExpecting " +
                        "'CLOSE_RAW_BLOCK', 'CLOSE', 'CLOSE_UNESCAPED', 'OPEN_SEXPR', " +
                        "'CLOSE_SEXPR', 'ID', 'OPEN_BLOCK_PARAMS', 'STRING', 'NUMBER', " +
                        "'BOOLEAN', 'UNDEFINED', 'NULL', 'DATA', 'SEP', got 'INVALID'"
                )
            })
    )
})

describe("createHandlebarsTemplateCompiler", () => {
    it.effect(
        "should create a TemplateCompiler based on Handlebars syntax",
        () =>
            FX.gen(function* () {
                const compile = createHandlebarsTemplateCompiler()

                const template = yield* compile(
                    "I'm sworn to carry your {{object}}."
                )

                const result = yield* template({object: "cats"})

                expect(result).toBe("I'm sworn to carry your cats.")
            })
    )

    it.effect(
        "should return an InvalidDataError when given an invalid Handlebars template",
        () =>
            FX.gen(function* () {
                const compile = createHandlebarsTemplateCompiler()

                const error = yield* pipe(
                    compile("I'm sworn to carry your {{object}."),
                    FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).toBe(
                    "Failed to compile template: I'm sworn to carry your " +
                        "{{object}.\nParse error on line 1:\n... carry your " +
                        "{{object}.\n-----------------------^\nExpecting " +
                        "'CLOSE_RAW_BLOCK', 'CLOSE', 'CLOSE_UNESCAPED', 'OPEN_SEXPR', " +
                        "'CLOSE_SEXPR', 'ID', 'OPEN_BLOCK_PARAMS', 'STRING', 'NUMBER', " +
                        "'BOOLEAN', 'UNDEFINED', 'NULL', 'DATA', 'SEP', got 'INVALID'"
                )
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

                expect(error).toBe(
                    "Failed to compile template: {{>game}\n" +
                        "Parse error on line 1:\n{{>game}\n-------^\n" +
                        "Expecting 'CLOSE_RAW_BLOCK', 'CLOSE', 'CLOSE_UNESCAPED', " +
                        "'OPEN_SEXPR', 'CLOSE_SEXPR', 'ID', 'OPEN_BLOCK_PARAMS', " +
                        "'STRING', 'NUMBER', 'BOOLEAN', 'UNDEFINED', 'NULL', 'DATA', " +
                        "'SEP', got 'INVALID'"
                )
            })
    )
})

describe("multilineIndent", () => {
    it("should add the specified indent to every line in the given text", () => {
        const text = `  This is line 1
This is line 2
This is line 3`

        expect(multilineIndent(text, 4)).toBe(`    This is line 1
    This is line 2
    This is line 3`)

        expect(multilineIndent(text, 2)).toBe(
            `  This is line 1
  This is line 2
  This is line 3`
        )
    })
})

describe("sinceTime", () => {
    beforeEach(() => {
        vi.mock(import("skyrim-effect/game/Time"), async importOriginal => {
            const mod = await importOriginal()

            return {
                ...mod,
                getGameTime: () => DU.days(1)
            }
        })
    })

    afterEach(() => vi.restoreAllMocks())

    it("should return the elapsed time since the start of the game in a human-readable format", () => {
        const elapsed = (v: number) => pipe(DU.days(1 - v), sinceTime())

        expect(elapsed(2.2 / 24)).toBe("2h 12m ago")
        expect(elapsed(1.5 / 24 / 60)).toBe("1m 30s ago")
        expect(elapsed(5 / 24 / 60 / 60)).toBe("5s ago")
    })

    it(`should return "now" if the elapsed time is less than a second`, () => {
        const elapsed = pipe(DU.days(1 - 0.9 / 24 / 60 / 60), sinceTime())

        expect(elapsed).toBe("just now")
    })
})
