import {pipe} from "effect"
import {ContextBuilder, DataIdentifier, InvalidDataError} from "../common/Data"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import {Schema} from "effect/Schema"
import * as A from "effect/Array"
import * as O from "effect/Option"
import {RoleMapping, RoleMappingsContainer, RoleMappingsContext} from "./Role"
import {Scene, SceneDescription} from "./Scene"
import {TemplateCompiler} from "../llm/Template"
import {traverseArray} from "../common/Type"
import {ActorContext} from "../actor/Actor"
import {
    ObjectiveChecklist,
    ObjectiveCompletion,
    ObjectiveExample,
    ObjectiveInstruction,
    ObjectiveListContainer,
    ObjectiveState
} from "./Objective"
import {GameEvent, History, Event} from "../game/Event"

export const SessionId = pipe(
    DataIdentifier,
    SC.brand("SessionId"),
    SC.annotations({
        title: "Session ID",
        description: "Unique identifier of the session"
    })
)

export type SessionId = typeof SessionId.Type

export interface Session<TEvent extends GameEvent> {
    readonly id: SessionId
    readonly scene: Scene
    readonly roles: readonly RoleMapping[]
    readonly objectives: readonly ObjectiveState[]
    readonly history: Event<TEvent>
}

export const Session = <A extends GameEvent, I = A, R = never>(
    schema: Schema<A, I, R>
) =>
    pipe(
        SC.Struct({
            id: SessionId,
            scene: Scene,
            roles: SC.Array(RoleMapping),
            objectives: SC.optionalWith(SC.Array(ObjectiveState), {
                default: () => A.empty()
            }),
            history: SC.optionalWith(History(schema), {
                default: () => A.empty()
            })
        }),
        SC.annotations({
            title: "Session",
            description: "Active instance of a scene"
        })
    )

export interface SessionContext<
    TActor extends ActorContext,
    TEvent extends GameEvent
> extends RoleMappingsContainer<TActor>,
        ObjectiveListContainer {
    readonly description: SceneDescription
    readonly history: Event<TEvent>
}

export function createSessionContextBuilder<
    TActor extends ActorContext,
    TEvent extends GameEvent
>(
    scene: Scene,
    roleMappingsContextBuilder: ContextBuilder<
        readonly RoleMapping[],
        RoleMappingsContext<TActor>
    >,
    compiler: TemplateCompiler
): Effect<
    ContextBuilder<Session<TEvent>, SessionContext<TActor, TEvent>>,
    InvalidDataError
> {
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
                        )
                    )
                )
            ),
            description: yield* compiler(description)
        }

        return (session: Session<TEvent>) =>
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
                                FX.bind("completion", () =>
                                    pipe(
                                        session.objectives,
                                        A.findFirst(s => s.id == o.id),
                                        O.map(s => s.completion),
                                        O.getOrElse(
                                            () =>
                                                "incomplete" as ObjectiveCompletion
                                        ),
                                        FX.succeed
                                    )
                                )
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
