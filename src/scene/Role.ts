import * as SC from "effect/Schema"
import {pipe} from "effect"

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

export const RoleName = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("RoleName"),
    SC.annotations({
        title: "Role Name",
        description: "Name of the role"
    })
)

export type RoleName = typeof RoleName.Type

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
        name: RoleName,
        description: RoleDescription
    }),
    SC.annotations({
        title: "Role",
        description: "A role for an actor in the scene"
    })
)

export type Role = typeof Role.Type
