import {flow, pipe} from "effect"
import {
    ContextBuilder,
    DataIdentifier,
    InvalidDataError,
    MissingContextDataError
} from "../common/Data"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import * as A from "effect/Array"
import * as R from "effect/Record"
import {RoleId, RoleMapping, RoleMappingsContext, WithRole} from "./Role"
import {Scene, SceneDescription} from "./Scene"
import {TemplateCompiler} from "../llm/Template"
import {traverseArray} from "../common/Type"
import {DialogueLine} from "./Dialogue"
import {ActorContext} from "../actor/Actor"
import {
    SceneObjective,
    SceneObjectiveExample,
    SceneObjectiveInstruction,
    SceneObjectiveOutcome
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

export type SessionContext<TActor extends ActorContext> = {
    readonly description: SceneDescription
    readonly roles: RoleMappingsContext<TActor>
    readonly objectives: readonly SceneObjective[]
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
                        FX.bind("outcome", () => compiler(o.outcome)),
                        FX.bind("examples", () =>
                            pipe(o.examples, traverseArray(compiler))
                        ),
                        FX.bind("completed", () => FX.succeed(o.completed))
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
                                        FX.map(SceneObjectiveInstruction.make)
                                    )
                                ),
                                FX.bind("outcome", () =>
                                    pipe(
                                        o.outcome(roles),
                                        FX.map(SceneObjectiveOutcome.make)
                                    )
                                ),
                                FX.bind("examples", () =>
                                    pipe(
                                        o.examples,
                                        traverseArray(e => e(roles)),
                                        FX.map(
                                            A.map(e =>
                                                SceneObjectiveExample.make(e)
                                            )
                                        )
                                    )
                                ),
                                FX.bind("completed", () =>
                                    FX.succeed(o.completed)
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

export namespace SessionContext {
    export function withSpeaker(speaker: RoleId): <
        TContext extends SessionContext<TActor>,
        TActor extends ActorContext
    >(
        builder: ContextBuilder<Session, TContext>
    ) => ContextBuilder<
        Session,
        TContext & {
            readonly speaker: ActorContext & WithRole
        }
    > {
        return builder =>
            flow(
                builder,
                FX.flatMap(context =>
                    pipe(
                        context.roles,
                        R.get(speaker),
                        FX.catchTag(
                            "NoSuchElementException",
                            () =>
                                new MissingContextDataError({
                                    message: `No such role found in the context: "${speaker}".`
                                })
                        ),
                        FX.map(role => ({
                            ...context,
                            speaker: role
                        }))
                    )
                )
            )
    }
}
