import {flow, pipe} from "effect"
import {DataIdentifier, InvalidDataError} from "../common/Data"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import * as R from "effect/Record"
import {createRoleMappingsContextBuilder, RoleId, RoleMapping} from "./Role"
import {Scene} from "./Scene"
import {
    ContextBuilder,
    MissingContextDataError,
    TemplateCompiler
} from "../llm/Template"
import {traverseArray} from "../common/Type"
import {DialogueLine} from "./Dialogue"
import {Actor} from "@skyrim-platform/skyrim-platform"

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

export function createSessionContextBuilder(
    scene: Scene,
    findActor: ContextBuilder<Actor>,
    compiler: TemplateCompiler
): Effect<ContextBuilder<Session>, InvalidDataError> {
    return FX.gen(function* () {
        const {roles, description, objectives} = scene

        yield* FX.logDebug(
            `Creating a session context builder for scene: [${scene.id}] ${scene.description}`
        )

        yield* FX.logTrace(`- Roles: \n${JSON.stringify(roles, undefined, 2)}`)

        yield* FX.logTrace(
            `- Objectives: \n${JSON.stringify(objectives, undefined, 2)}`
        )

        const findRoles = yield* createRoleMappingsContextBuilder(
            roles,
            findActor,
            compiler
        )

        const templates = {
            objectives: yield* pipe(
                objectives,
                traverseArray(o =>
                    pipe(
                        FX.Do,
                        FX.bind("instruction", () => compiler(o.instruction)),
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
                FX.bind("roles", () => findRoles(session.roles)),
                FX.bind("objectives", ({roles}) =>
                    pipe(
                        templates.objectives,
                        traverseArray(o =>
                            pipe(
                                FX.Do,
                                FX.bind("instruction", () =>
                                    o.instruction(roles)
                                ),
                                FX.bind("outcome", () => o.outcome(roles)),
                                FX.bind("examples", () =>
                                    pipe(
                                        o.examples,
                                        traverseArray(e => e(roles))
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
                    description,
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

export function withSpeaker(
    speaker: RoleId
): (builder: ContextBuilder<Session>) => ContextBuilder<Session> {
    return builder =>
        flow(
            builder,
            FX.flatMap(context =>
                pipe(
                    context,
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
