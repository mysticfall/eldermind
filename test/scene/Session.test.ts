import {afterEach, beforeEach, describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {createHandlebarsTemplateCompiler} from "../../src/llm/Handlebars"
import {
    createSessionContextBuilder,
    Session,
    SessionId
} from "../../src/scene/Session"
import {Scene, SceneDescription, SceneId} from "../../src/scene/Scene"
import {
    createRoleMappingsContextBuilder,
    Role,
    RoleDescription,
    RoleId,
    RoleMapping
} from "../../src/scene/Role"
import {
    Objective,
    ObjectiveChecklist,
    ObjectiveExample,
    ObjectiveId,
    ObjectiveInstruction
} from "../../src/scene/Objective"
import {ActorId} from "skyrim-effect/game/Form"
import {Actor} from "@skyrim-platform/skyrim-platform"
import {pipe} from "effect"
import {InvalidDataError} from "../../src/common/Data"
import {DialogueLine, DialogueText} from "../../src/scene/Dialogue"
import {actorContextBuilder} from "../../src/actor/Actor"
import {GameTime} from "skyrim-effect/game/Time"

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
        Objective.make({
            id: ObjectiveId.make("objective1"),
            instruction: ObjectiveInstruction.make(
                "Ask {{housecarl.name}} how she is."
            ),
            checklist: ObjectiveChecklist.make(
                "Did {{housecarl.name}} reply to {{player.name}}?"
            ),
            examples: [
                ObjectiveExample.make(
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
            text: DialogueText.make("I'm sworn to carry your burdens."),
            time: GameTime.make(0)
        })
    ]
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

                const roleMappingsContextBuilder =
                    yield* createRoleMappingsContextBuilder(
                        scene.roles,
                        actorContextBuilder,
                        compiler
                    )

                const buildSessionContext = yield* createSessionContextBuilder(
                    scene,
                    roleMappingsContextBuilder,
                    compiler
                )

                const context = yield* buildSessionContext(session)

                expect(context["description"]).toBe(
                    "Anna and Lydia are vising the Sky District."
                )

                const roles = context["roles"]

                expect(roles).toBeDefined()

                const player = roles[RoleId.make("player")]

                expect(player?.id).toBe(0x00000014)
                expect(player?.name).toBe("Anna")
                expect(player?.role?.id).toBe("player")
                expect(player?.role?.description).toBe(
                    "Anna is the main character of the scene."
                )

                const housecarl = roles[RoleId.make("housecarl")]

                expect(housecarl?.id).toBe(0x000a2c94)
                expect(housecarl?.name).toBe("Lydia")
                expect(housecarl?.role?.id).toBe("housecarl")
                expect(housecarl?.role?.description).toBe(
                    "Lydia is the housecarl of Anna."
                )

                const objectives = context["objectives"]

                expect(objectives).toSatisfy(Array.isArray)
                expect(objectives).toHaveLength(1)

                const objective1 = objectives[0]

                expect(objective1).toBeDefined()
                expect(objective1.instruction).toBe("Ask Lydia how she is.")
                expect(objective1.checklist).toBe("Did Lydia reply to Anna?")

                const examples = objective1.examples

                expect(examples).toSatisfy(Array.isArray)
                expect(examples).toHaveLength(1)

                const example1 = examples[0]

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

                const roleMappingsContextBuilder =
                    yield* createRoleMappingsContextBuilder(
                        scene.roles,
                        actorContextBuilder,
                        compiler
                    )

                const error = yield* pipe(
                    createSessionContextBuilder(
                        invalidScene,
                        roleMappingsContextBuilder,
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

                const roleMappingsContextBuilder =
                    yield* createRoleMappingsContextBuilder(
                        scene.roles,
                        actorContextBuilder,
                        compiler
                    )

                const buildSessionContext = yield* createSessionContextBuilder(
                    scene,
                    roleMappingsContextBuilder,
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
