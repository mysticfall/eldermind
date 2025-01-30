import {pipe} from "effect"
import {DataIdentifier} from "../common/Data"
import * as SC from "effect/Schema"

export const SceneObjectiveId = pipe(
    DataIdentifier,
    SC.brand("SceneObjectiveId")
)

export type SceneObjectiveId = typeof SceneObjectiveId.Type

export const SceneObjectiveInstruction = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("SceneObjectiveInstruction")
)

export type SceneObjectiveInstruction = typeof SceneObjectiveInstruction.Type

export const SceneObjectiveChecklist = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("SceneObjectiveChecklist")
)

export type SceneObjectiveChecklist = typeof SceneObjectiveChecklist.Type

export const SceneObjectiveExample = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("SceneObjectiveExample")
)

export type SceneObjectiveExample = typeof SceneObjectiveExample.Type

export const SceneObjectiveStatus = SC.Union(
    SC.Literal("incomplete"),
    SC.Literal("complete"),
    SC.Literal("reverted")
)

export type SceneObjectiveStatus = typeof SceneObjectiveStatus.Type

export const SceneObjective = SC.Struct({
    id: SceneObjectiveId,
    instruction: SceneObjectiveInstruction,
    checklist: SceneObjectiveChecklist,
    examples: SC.Array(SceneObjectiveExample),
    status: SC.optionalWith(SceneObjectiveStatus, {
        default: () => "incomplete"
    })
})

export type SceneObjective = typeof SceneObjective.Type
