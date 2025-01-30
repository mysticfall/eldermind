import {pipe} from "effect"
import {ContextBuilder, DataIdentifier, InvalidDataError} from "../common/Data"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import * as A from "effect/Array"
import {RoleMappedContext, RoleMapping, RoleMappingsContext} from "./Role"
import {Scene, SceneDescription} from "./Scene"
import {TemplateCompiler} from "../llm/Template"
import {traverseArray} from "../common/Type"
import {DialogueLine} from "./Dialogue"
import {ActorContext} from "../actor/Actor"
import {
    Objective,
    ObjectiveChecklist,
    ObjectiveExample,
    ObjectiveInstruction
} from "./Objective"

export const SessionId = pipe(
    DataIdentifier,
    SC.brand("SessionId"),
    SC.annotations({
        title: "Session ID",
        description: "The unique identifier of the Session."
    })
)

export type SessionId = typeof SessionId.Type

export const Session = pipe(
    SC.Struct({
        id: SessionId,
        scene: Scene,
        roles: SC.Array(RoleMapping),
        history: SC.Array(DialogueLine)
    }),
    SC.annotations({
        title: "Session",
        description: "An active instance of a scene."
    })
)

export type Session = typeof Session.Type

export interface SessionContext<TActor extends ActorContext>
    extends RoleMappedContext<TActor> {
    readonly description: SceneDescription
    readonly objectives: readonly Objective[]
    readonly history: readonly DialogueLine[]
}

export function createSessionContextBuilder<TActor extends ActorContext>(
    scene: Scene,
    roleMappingsContextBuilder: ContextBuilder<
        readonly RoleMapping[],
        RoleMappingsContext<TActor>
    >,
    compiler: TemplateCompiler
): Effect<ContextBuilder<Session, SessionContext<TActor>>, InvalidDataError> {
    return FX.gen(function* () {
        const {roles, description, objectives} = scene

        yield* FX.logDebug(
            `Creating a session context builder for scene: [${scene.id}] ${scene.description}`
        )

        yield* FX.logTrace(`- Roles: \n${JSON.stringify(roles, undefined, 2)}`)

        yield* FX.logTrace(
            `- Objectives: \n${JSON.stringify(objectives, undefined, 2)}`
        )

        const templates = {
            objectives: yield* pipe(
                objectives,
                traverseArray(o =>
                    pipe(
                        FX.Do,
                        FX.bind("id", () => FX.succeed(o.id)),
                        FX.bind("instruction", () => compiler(o.instruction)),
                        FX.bind("checklist", () => compiler(o.checklist)),
                        FX.bind("examples", () =>
                            pipe(o.examples, traverseArray(compiler))
                        ),
                        FX.bind("status", () => FX.succeed(o.status))
                    )
                )
            ),
            description: yield* compiler(description)
        }

        return (session: Session) =>
            pipe(
                FX.Do,
                FX.tap(() =>
                    FX.logDebug(
                        `Building template context for scene: ${scene.id} (session: ${session.id})`
                    )
                ),
                FX.bind("roles", () =>
                    roleMappingsContextBuilder(session.roles)
                ),
                FX.bind("objectives", ({roles}) =>
                    pipe(
                        templates.objectives,
                        traverseArray(o =>
                            pipe(
                                FX.Do,
                                FX.bind("id", () => FX.succeed(o.id)),
                                FX.bind("instruction", () =>
                                    pipe(
                                        o.instruction(roles),
                                        FX.map(ObjectiveInstruction.make)
                                    )
                                ),
                                FX.bind("checklist", () =>
                                    pipe(
                                        o.checklist(roles),
                                        FX.map(ObjectiveChecklist.make)
                                    )
                                ),
                                FX.bind("examples", () =>
                                    pipe(
                                        o.examples,
                                        traverseArray(e => e(roles)),
                                        FX.map(
                                            A.map(e => ObjectiveExample.make(e))
                                        )
                                    )
                                ),
                                FX.bind("status", () => FX.succeed(o.status))
                            )
                        )
                    )
                ),
                FX.bind("description", ({roles}) =>
                    templates.description(roles)
                ),
                FX.map(({description, roles, objectives}) => ({
                    ...roles,
                    description: SceneDescription.make(description),
                    roles,
                    objectives,
                    history: session.history
                })),
                FX.tap(context =>
                    FX.logDebug(
                        `Populated template context for the scene ${scene.id}: \n${JSON.stringify(context, undefined, 2)}`
                    )
                )
            )
    })
}
