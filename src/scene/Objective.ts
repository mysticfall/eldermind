import {pipe} from "effect"
import {DataIdentifier} from "../common/Data"
import * as SC from "effect/Schema"

export const ObjectiveId = pipe(DataIdentifier, SC.brand("ObjectiveId"))

export type ObjectiveId = typeof ObjectiveId.Type

export const ObjectiveInstruction = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("ObjectiveInstruction")
)

export type ObjectiveInstruction = typeof ObjectiveInstruction.Type

export const ObjectiveChecklist = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("ObjectiveChecklist")
)

export type ObjectiveChecklist = typeof ObjectiveChecklist.Type

export const ObjectiveExample = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("ObjectiveExample")
)

export type ObjectiveExample = typeof ObjectiveExample.Type

export const ObjectiveStatus = SC.Union(
    SC.Literal("incomplete"),
    SC.Literal("complete"),
    SC.Literal("reverted")
)

export type ObjectiveStatus = typeof ObjectiveStatus.Type

export const Objective = SC.Struct({
    id: ObjectiveId,
    instruction: ObjectiveInstruction,
    checklist: ObjectiveChecklist,
    examples: SC.Array(ObjectiveExample),
    status: SC.optionalWith(ObjectiveStatus, {
        default: () => "incomplete"
    })
})

export type Objective = typeof Objective.Type
