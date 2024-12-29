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

export const SceneObjectiveOutcome = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("SceneObjectiveOutcome")
)

export type SceneObjectiveOutcome = typeof SceneObjectiveOutcome.Type

export const SceneObjectiveExample = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("SceneObjectiveExample")
)

export type SceneObjectiveExample = typeof SceneObjectiveExample.Type

export const SceneObjective = SC.Struct({
    id: SceneObjectiveId,
    instruction: SceneObjectiveInstruction,
    outcome: SceneObjectiveOutcome,
    examples: SC.Array(SceneObjectiveExample),
    completed: SC.optionalWith(SC.Boolean, {
        default: () => false
    })
})

export type SceneObjective = typeof SceneObjective.Type
