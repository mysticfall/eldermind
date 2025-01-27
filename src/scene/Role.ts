import * as SC from "effect/Schema"
import {pipe} from "effect"
import {ActorId, getActor} from "skyrim-effect/game/Form"
import {
    ContextBuilder,
    MissingContextDataError,
    TemplateCompiler
} from "../llm/Template"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import {InvalidDataError} from "../common/Data"
import * as A from "effect/Array"
import * as R from "effect/Record"
import {traverseRecord} from "../common/Type"
import {Actor} from "@skyrim-platform/skyrim-platform"

export const RoleId = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("RoleId"),
    SC.annotations({
        title: "Role ID",
        description: "Identifier of the role"
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
        description: "A role for an actor in the scene"
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
        description: "A role for an actor in the scene"
    })
)

export type RoleMapping = typeof RoleMapping.Type

export function createRoleMappingsContextBuilder(
    roles: readonly Role[],
    findActor: ContextBuilder<Actor>,
    compiler: TemplateCompiler
): Effect<ContextBuilder<readonly RoleMapping[]>, InvalidDataError> {
    return FX.gen(function* () {
        const templates = yield* pipe(
            roles,
            A.map<readonly Role[], [RoleId, Role]>(m => [m.id, m]),
            R.fromEntries,
            traverseRecord(r => compiler(r.description))
        )

        return mappings =>
            FX.gen(function* () {
                const map = pipe(
                    mappings,
                    A.map<readonly RoleMapping[], [RoleId, RoleMapping]>(m => [
                        m.role,
                        m
                    ]),
                    R.fromEntries
                )

                const initialContext = yield* pipe(
                    map,
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
                            FX.flatMap(actor => findActor(actor)),
                            FX.map(R.set("role", m.role))
                        )
                    )
                )

                return yield* pipe(
                    map,
                    traverseRecord(({role, actor}) =>
                        pipe(
                            templates,
                            R.get(role),
                            FX.catchTag(
                                "NoSuchElementException",
                                () =>
                                    new MissingContextDataError({
                                        message: `Cannot find the mapped role "${role}" for actor "${actor.toString(16)}".`
                                    })
                            ),
                            FX.flatMap(template => template(initialContext)),
                            FX.map(description => ({
                                ...initialContext[role],
                                description
                            }))
                        )
                    )
                )
            })
    })
}
