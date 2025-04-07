import * as SC from "effect/Schema"
import {flow, pipe} from "effect"
import {ActorId, getActor} from "skyrim-effect/game/Actor"
import {TemplateCompiler} from "../llm/Template"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import {
    ContextBuilder,
    InvalidDataError,
    MissingContextDataError
} from "../common/Data"
import * as A from "effect/Array"
import * as R from "effect/Record"
import {ReadonlyRecord} from "effect/Record"
import {traverseRecord} from "../common/Type"
import {ActorContext} from "../actor/Actor"
import {Actor} from "skyrimPlatform"

export const RoleId = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("RoleId"),
    SC.annotations({
        title: "Role ID",
        description: "Unique identifier of the role"
    })
)

export type RoleId = typeof RoleId.Type

export const RoleDescription = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("RoleDescription"),
    SC.annotations({
        title: "Role Description",
        description: "Description of the role"
    })
)

export type RoleDescription = typeof RoleDescription.Type

export const Role = pipe(
    SC.Struct({
        id: RoleId,
        description: RoleDescription
    }),
    SC.annotations({
        title: "Role",
        description: "Role for an actor in the scene"
    })
)

export type Role = typeof Role.Type

export const RoleMapping = pipe(
    SC.Struct({
        role: RoleId,
        actor: ActorId
    }),
    SC.annotations({
        title: "Role Mapping",
        description: "Role for an actor in the scene"
    })
)

export type RoleMapping = typeof RoleMapping.Type

export type RoleActor<TActor extends ActorContext> = TActor & {
    readonly role: Role
}

export type RoleMappingsContext<out TActor extends ActorContext> =
    ReadonlyRecord<RoleId, RoleActor<TActor>>

export function createRoleMappingsContextBuilder<TActor extends ActorContext>(
    roles: readonly Role[],
    actorContextBuilder: ContextBuilder<Actor, TActor>,
    compiler: TemplateCompiler
): Effect<
    ContextBuilder<readonly RoleMapping[], RoleMappingsContext<TActor>>,
    InvalidDataError
> {
    return FX.gen(function* () {
        const templates = yield* pipe(
            roles,
            A.map<readonly Role[], [RoleId, Role]>(m => [m.id, m]),
            R.fromEntries,
            traverseRecord(r => compiler(r.description))
        )

        return mappings =>
            FX.gen(function* () {
                const roleMap = pipe(
                    mappings,
                    A.map<readonly RoleMapping[], [RoleId, RoleMapping]>(m => [
                        m.role,
                        m
                    ]),
                    R.fromEntries
                )

                const actorMap = yield* pipe(
                    roleMap,
                    traverseRecord(m =>
                        pipe(
                            m.actor,
                            getActor,
                            FX.catchTag(
                                "FormError",
                                e =>
                                    new MissingContextDataError({
                                        message: `Cannot find actor "${m.actor.toString(16)}" for role "${m.role}".`,
                                        cause: e
                                    })
                            ),
                            FX.flatMap(actorContextBuilder),
                            FX.map(actor => ({
                                actor,
                                role: m.role
                            }))
                        )
                    )
                )

                const initialContext = pipe(
                    actorMap,
                    R.map(({actor, role}) => ({
                        ...actor,
                        role
                    }))
                )

                return yield* pipe(
                    actorMap,
                    traverseRecord(({actor, role}) =>
                        pipe(
                            templates,
                            R.get(role),
                            FX.catchTag(
                                "NoSuchElementException",
                                () =>
                                    new MissingContextDataError({
                                        message: `Cannot find the mapped role "${role}" for actor "${actor.id.toString(16)}".`
                                    })
                            ),
                            FX.flatMap(template => template(initialContext)),
                            FX.map(description => ({
                                ...actor,
                                role: {
                                    id: role,
                                    description:
                                        RoleDescription.make(description)
                                }
                            }))
                        )
                    ),
                    FX.map(R.mapKeys(k => RoleId.make(k)))
                )
            })
    })
}

export interface RoleMappingsContainer<TActor extends ActorContext> {
    readonly roles: RoleMappingsContext<TActor>
}

export interface WithSpeaker<TActor extends ActorContext> {
    readonly speaker: RoleActor<TActor>
}

export function withSpeaker(
    speaker: RoleId
): <
    TData,
    TContext extends RoleMappingsContainer<TActor>,
    TActor extends ActorContext
>(
    builder: ContextBuilder<TData, TContext>
) => ContextBuilder<TData, TContext & WithSpeaker<TActor>> {
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
