import {afterEach, beforeEach, describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {createHandlebarsTemplateCompiler} from "../../src/llm/Handlebars"
import {
    createSessionContextBuilder,
    Session,
    SessionId,
    withSpeaker
} from "../../src/scene/Session"
import {Scene, SceneDescription, SceneId} from "../../src/scene/Scene"
import {Role, RoleDescription, RoleId, RoleMapping} from "../../src/scene/Role"
import {
    SceneObjective,
    SceneObjectiveExample,
    SceneObjectiveId,
    SceneObjectiveInstruction,
    SceneObjectiveOutcome
} from "../../src/scene/Objective"
import {ActorId} from "skyrim-effect/game/Form"
import {Actor} from "@skyrim-platform/skyrim-platform"
import {ContextBuilder, TemplateContext} from "../../src/llm/Template"
import {pipe} from "effect"
import {InvalidDataError} from "../../src/common/Data"
import {DialogueLine, DialogueText} from "../../src/scene/Dialogue"

const scene = Scene.make({
    id: SceneId.make("visiting_sky_district"),
    description: SceneDescription.make(
        "{{player.name}} and {{housecarl.name}} are vising the Sky District."
    ),
    roles: [
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
    ],
    objectives: [
        SceneObjective.make({
            id: SceneObjectiveId.make("objective1"),
            instruction: SceneObjectiveInstruction.make(
                "Ask {{housecarl.name}} how she is."
            ),
            outcome: SceneObjectiveOutcome.make(
                "{{housecarl.name}} replied to {{player.name}}."
            ),
            examples: [
                SceneObjectiveExample.make(
                    "{{housecarl.name}}: I'm sworn to carry your burdens."
                )
            ]
        })
    ]
})

const session = Session.make({
    id: SessionId.make("test_session"),
    scene,
    roles: [
        RoleMapping.make({
            role: RoleId.make("player"),
            actor: ActorId.make(0x00000014)
        }),
        RoleMapping.make({
            role: RoleId.make("housecarl"),
            actor: ActorId.make(0x000a2c94)
        })
    ],
    history: [
        DialogueLine.make({
            speaker: RoleId.make("housecarl"),
            text: DialogueText.make("I'm sworn to carry your burdens.")
        })
    ]
})

const findActor: ContextBuilder<Actor> = actor =>
    FX.succeed({
        id: actor.getFormID(),
        name: actor.getName()
    })

function installMocks() {
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
}

describe("createSessionContextBuilder", () => {
    beforeEach(installMocks)
    afterEach(() => vi.restoreAllMocks())

    it.effect(
        "should return a ContextBuilder that creates a template context for the given scene",
        () =>
            FX.gen(function* () {
                const compiler = createHandlebarsTemplateCompiler()

                const buildSessionContext = yield* createSessionContextBuilder(
                    scene,
                    findActor,
                    compiler
                )

                const context = yield* buildSessionContext(session)

                expect(context["description"]).toBe(
                    "Anna and Lydia are vising the Sky District."
                )

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

                const objectives = context["objectives"]

                expect(objectives).toSatisfy(Array.isArray)
                expect(objectives).toHaveLength(1)

                const objective1 = (objectives as TemplateContext[])[0]

                expect(objective1).toBeDefined()
                expect(objective1["instruction"]).toBe("Ask Lydia how she is.")
                expect(objective1["outcome"]).toBe("Lydia replied to Anna.")

                const examples = objective1["examples"]

                expect(examples).toSatisfy(Array.isArray)
                expect(examples).toHaveLength(1)

                const example1 = (examples as TemplateContext[])[0]

                expect(example1).toBeDefined()
                expect(example1).toBe("Lydia: I'm sworn to carry your burdens.")

                const history = context["history"]

                expect(history).toSatisfy(Array.isArray)
                expect(history).toHaveLength(1)

                const line1 = (history as DialogueLine[])[0]

                expect(line1).toBeDefined()
                expect(line1.speaker).toBe("housecarl")
                expect(line1.text).toBe("I'm sworn to carry your burdens.")
            })
    )

    it.effect(
        "should return an InvalidDataError when the scene data includes invalid template text",
        () =>
            FX.gen(function* () {
                const compiler = createHandlebarsTemplateCompiler()

                const invalidScene = {
                    ...scene,
                    description: SceneDescription.make(
                        "{{player.name} is visiting the Sky District."
                    )
                }

                const error = yield* pipe(
                    createSessionContextBuilder(
                        invalidScene,
                        findActor,
                        compiler
                    ),
                    FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).toBe(
                    "Failed to compile template: {{player.name} is visiting the Sky District.\n" +
                        "Parse error on line 1:\n" +
                        "{{player.name} is visiting the Sk\n" +
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

                const buildSessionContext = yield* createSessionContextBuilder(
                    scene,
                    findActor,
                    compiler
                )

                const invalidSession = {
                    ...session,
                    roles: [
                        RoleMapping.make({
                            role: RoleId.make("jarl"),
                            actor: ActorId.make(0x00000014)
                        })
                    ]
                }

                const error = yield* pipe(
                    buildSessionContext(invalidSession),
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

describe("withSpeaker", () => {
    beforeEach(installMocks)
    afterEach(() => vi.restoreAllMocks())

    it.effect(
        "should decorate the given session context builder to add a speaker information",
        () =>
            FX.gen(function* () {
                const compiler = createHandlebarsTemplateCompiler()

                const buildSessionContext = yield* createSessionContextBuilder(
                    scene,
                    findActor,
                    compiler
                )

                const buildContextWithSpeaker = pipe(
                    buildSessionContext,
                    withSpeaker(RoleId.make("housecarl"))
                )

                const context = yield* pipe(session, buildContextWithSpeaker)

                const speaker = context["speaker"] as unknown as TemplateContext

                expect(speaker).toBeDefined()
                expect(speaker["name"]).toBe("Lydia")
            })
    )
})
