import {pipe} from "effect"
import {DataIdentifier, InvalidDataError} from "../common/Data"
import * as A from "effect/Array"
import * as R from "effect/Record"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import {Role, RoleId, RoleMapping} from "./Role"
import {Scene} from "./Scene"
import {Actor} from "@skyrim-platform/skyrim-platform"
import {
    ContextBuilder,
    MissingContextDataError,
    TemplateCompiler
} from "../llm/Template"
import {traverseArray, traverseRecord} from "../common/Type"
import {getActor} from "skyrim-effect/game/Form"

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
        roles: SC.Array(RoleMapping)
    }),
    SC.annotations({
        title: "Session",
        description: "An active instance of a scene."
    })
)

export type Session = typeof Session.Type

export function createSessionContextBuilder(
    compiler: TemplateCompiler,
    childBuilders: {actor: ContextBuilder<Actor>}
): (scene: Scene) => Effect<ContextBuilder<Session>, InvalidDataError> {
    return scene =>
        FX.gen(function* () {
            const {roles, description, objectives} = scene

            yield* FX.logDebug(
                `Creating a session context builder for scene: [${scene.id}] ${scene.description}`
            )

            yield* FX.logTrace(
                `- Roles: \n${JSON.stringify(roles, undefined, 2)}`
            )

            yield* FX.logTrace(
                `- Objectives: \n${JSON.stringify(objectives, undefined, 2)}`
            )

            const templates = {
                roles: yield* pipe(
                    roles,
                    A.map<readonly Role[], [RoleId, Role]>(r => [r.id, r]),
                    R.fromEntries,
                    traverseRecord(r => compiler(r.description))
                ),
                objectives: yield* pipe(
                    objectives,
                    traverseArray(o =>
                        pipe(
                            FX.Do,
                            FX.bind("instruction", () =>
                                compiler(o.instruction)
                            ),
                            FX.bind("outcome", () => compiler(o.outcome)),
                            FX.bind("examples", () =>
                                pipe(o.examples, traverseArray(compiler))
                            )
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
                    FX.bind("roleMap", () =>
                        FX.succeed(
                            pipe(
                                session.roles,
                                A.map<
                                    readonly RoleMapping[],
                                    [RoleId, RoleMapping]
                                >(m => [m.role, m]),
                                R.fromEntries
                            )
                        )
                    ),
                    FX.tap(({roleMap}) =>
                        FX.logDebug(
                            `Mapped roles: \n${JSON.stringify(roleMap, undefined, 2)}`
                        )
                    ),
                    FX.bind("initialContext", ({roleMap}) =>
                        pipe(
                            roleMap,
                            traverseRecord(m =>
                                pipe(
                                    m.actor,
                                    getActor,
                                    FX.catchTag(
                                        "FormError",
                                        e =>
                                            new MissingContextDataError({
                                                message: `Cannot find the mapped actor "${m.actor}" in scene "${scene.id}".`,
                                                cause: e
                                            })
                                    ),
                                    FX.flatMap(childBuilders.actor)
                                )
                            )
                        )
                    ),
                    FX.tap(({initialContext}) =>
                        FX.logDebug(
                            `Initial context for roles: \n${JSON.stringify(initialContext, undefined, 2)}`
                        )
                    ),
                    FX.bind("roles", ({roleMap, initialContext}) =>
                        pipe(
                            roleMap,
                            traverseRecord(m =>
                                pipe(
                                    templates.roles,
                                    R.get(m.role),
                                    FX.catchTag(
                                        "NoSuchElementException",
                                        () =>
                                            new MissingContextDataError({
                                                message: `Cannot find the mapped role "${m.role}" in scene "${scene.id}".`
                                            })
                                    ),
                                    FX.flatMap(t => t({roles: initialContext})),
                                    FX.map(description =>
                                        pipe(
                                            initialContext[m.role],
                                            R.set("description", description)
                                        )
                                    )
                                )
                            )
                        )
                    ),
                    FX.bind("objectives", ({roles}) =>
                        pipe(
                            templates.objectives,
                            traverseArray(o =>
                                pipe(
                                    FX.Do,
                                    FX.bind("instruction", () =>
                                        o.instruction({roles})
                                    ),
                                    FX.bind("outcome", () =>
                                        o.outcome({roles})
                                    ),
                                    FX.bind("examples", () =>
                                        pipe(
                                            o.examples,
                                            traverseArray(e => e({roles}))
                                        )
                                    )
                                )
                            )
                        )
                    ),
                    FX.bind("description", ({roles}) =>
                        templates.description({roles})
                    ),
                    FX.map(({description, roles, objectives}) => ({
                        description,
                        roles,
                        objectives
                    })),
                    FX.tap(context =>
                        FX.logDebug(
                            `Populated template context for the scene ${scene.id}: \n${JSON.stringify(context, undefined, 2)}`
                        )
                    )
                )
        })
}
