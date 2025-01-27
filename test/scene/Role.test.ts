import {afterEach, beforeEach, describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {createHandlebarsTemplateCompiler} from "../../src/llm/Handlebars"
import {
    createRoleMappingsContextBuilder,
    Role,
    RoleDescription,
    RoleId,
    RoleMapping
} from "../../src/scene/Role"
import {ActorId} from "skyrim-effect/game/Form"
import {Actor} from "@skyrim-platform/skyrim-platform"
import {ContextBuilder, TemplateContext} from "../../src/llm/Template"
import {pipe} from "effect"
import {InvalidDataError} from "../../src/common/Data"

describe("createRoleMappingsContextBuilder", () => {
    const roles = [
        Role.make({
            id: RoleId.make("player"),
            description: RoleDescription.make(
                "{{player.name}} is the main character of the scene."
            )
        }),
        Role.make({
            id: RoleId.make("housecarl"),
            description: RoleDescription.make(
                "{{housecarl.name}} is the housecarl of {{player.name}}."
            )
        })
    ]

    const mappings = [
        RoleMapping.make({
            role: RoleId.make("player"),
            actor: ActorId.make(0x00000014)
        }),
        RoleMapping.make({
            role: RoleId.make("housecarl"),
            actor: ActorId.make(0x000a2c94)
        })
    ]

    const findActor: ContextBuilder<Actor> = actor =>
        FX.succeed({
            id: actor.getFormID(),
            name: actor.getName()
        })

    beforeEach(() => {
        vi.mock(import("skyrim-effect/game/Form"), async importOriginal => {
            const mod = await importOriginal()

            return {
                ...mod,
                getActor: (id: ActorId) =>
                    FX.succeed({
                        getFormID: () => id,
                        getName: () => (id == 0x00000014 ? "Anna" : "Lydia")
                    } as unknown as Actor)
            }
        })
    })

    afterEach(() => vi.restoreAllMocks())

    it.effect(
        "should return a ContextBuilder that creates a template context for the role mappings",
        () =>
            FX.gen(function* () {
                const compiler = createHandlebarsTemplateCompiler()

                const buildRoleMappingsContext =
                    yield* createRoleMappingsContextBuilder(
                        roles,
                        findActor,
                        compiler
                    )

                const context = yield* buildRoleMappingsContext(mappings)

                const player = context["player"] as unknown as TemplateContext

                expect(player).toBeDefined()
                expect(player["id"]).toBe(0x00000014)
                expect(player["name"]).toBe("Anna")
                expect(player["role"]).toBe("player")
                expect(player["description"]).toBe(
                    "Anna is the main character of the scene."
                )

                const housecarl = context[
                    "housecarl"
                ] as unknown as TemplateContext

                expect(housecarl).toBeDefined()
                expect(housecarl["id"]).toBe(0x000a2c94)
                expect(housecarl["name"]).toBe("Lydia")
                expect(housecarl["role"]).toBe("housecarl")
                expect(housecarl["description"]).toBe(
                    "Lydia is the housecarl of Anna."
                )
            })
    )

    it.effect(
        "should return an InvalidDataError when the role description includes invalid template text",
        () =>
            FX.gen(function* () {
                const compiler = createHandlebarsTemplateCompiler()

                const invalidRole = Role.make({
                    id: RoleId.make("player"),
                    description: RoleDescription.make(
                        "{{player.name} is the main character of the scene."
                    )
                })

                const error = yield* pipe(
                    createRoleMappingsContextBuilder(
                        [invalidRole, roles[1]],
                        findActor,
                        compiler
                    ),
                    FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).toBe(
                    "Failed to compile template: {{player.name} is the main character of the scene.\n" +
                        "Parse error on line 1:\n" +
                        "{{player.name} is the main charac\n" +
                        "-------------^\n" +
                        "Expecting 'CLOSE_RAW_BLOCK', 'CLOSE', 'CLOSE_UNESCAPED', 'OPEN_SEXPR', 'CLOSE_SEXPR', " +
                        "'ID', 'OPEN_BLOCK_PARAMS', 'STRING', 'NUMBER', 'BOOLEAN', 'UNDEFINED', 'NULL', " +
                        "'DATA', 'SEP', got 'INVALID'"
                )
            })
    )

    it.effect(
        "should return a MissingContextDataError when the role mapping references a non-existent role",
        () =>
            FX.gen(function* () {
                const compiler = createHandlebarsTemplateCompiler()

                const buildRoleMappingsContext =
                    yield* createRoleMappingsContextBuilder(
                        roles,
                        findActor,
                        compiler
                    )

                const invalidMappings = [
                    RoleMapping.make({
                        role: RoleId.make("jarl"),
                        actor: ActorId.make(0x00000014)
                    })
                ]

                const error = yield* pipe(
                    invalidMappings,
                    buildRoleMappingsContext,
                    FX.catchTag(
                        "MissingContextDataError",
                        (e: InvalidDataError) => FX.succeed(e.message)
                    )
                )

                expect(error).toBe(
                    `Cannot find the mapped role "jarl" for actor "14".`
                )
            })
    )
})
