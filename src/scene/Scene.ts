import * as SC from "effect/Schema"
import {DataIdentifier, TypedDataLoader} from "../common/Data"
import * as A from "effect/Array"
import {pipe} from "effect"
import {Objective} from "./Objective"
import {Role} from "./Role"

export const SceneId = pipe(
    DataIdentifier,
    SC.brand("SceneId"),
    SC.annotations({
        title: "Scene ID",
        description: "The unique identifier of the scene."
    })
)

export type SceneId = typeof SceneId.Type

export const SceneDescription = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("SceneDescription"),
    SC.annotations({
        title: "Scene Description",
        description: "A short description of the scene."
    })
)

export type SceneDescription = typeof SceneDescription.Type

export const Scene = SC.Struct({
    id: SceneId,
    description: SceneDescription,
    roles: SC.Array(Role),
    objectives: SC.optionalWith(SC.Array(Objective), {
        default: () => A.empty()
    })
})

export type Scene = typeof Scene.Type

export type SceneDataLoader = TypedDataLoader<Scene>
