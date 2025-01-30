import {flow, pipe} from "effect"
import {ContextBuilder, DataIdentifier} from "../common/Data"
import * as A from "effect/Array"
import * as O from "effect/Option"
import * as FX from "effect/Effect"
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

export const ObjectiveCompletion = SC.Union(
    SC.Literal("incomplete"),
    SC.Literal("complete"),
    SC.Literal("reverted")
)

export type ObjectiveCompletion = typeof ObjectiveCompletion.Type

export const Objective = SC.Struct({
    id: ObjectiveId,
    instruction: ObjectiveInstruction,
    checklist: ObjectiveChecklist,
    examples: SC.Array(ObjectiveExample)
})

export type Objective = typeof Objective.Type

export const ObjectiveState = SC.Struct({
    id: ObjectiveId,
    completion: SC.optionalWith(ObjectiveCompletion, {
        default: () => "incomplete"
    })
})

export type ObjectiveState = typeof ObjectiveState.Type

export const ObjectiveContext = SC.Struct({
    ...Objective.fields,
    ...ObjectiveState.fields
})

export type ObjectiveContext = typeof ObjectiveContext.Type

export interface ObjectiveListContainer {
    readonly objectives: readonly ObjectiveContext[]
}

export interface WithActiveObjective {
    readonly activeObjective?: ObjectiveContext
}

export function withActiveObjective<
    TData,
    TContext extends ObjectiveListContainer
>(
    builder: ContextBuilder<TData, TContext>
): ContextBuilder<TData, TContext & WithActiveObjective> {
    return flow(
        builder,
        FX.map(ctx => ({
            ...ctx,
            activeObjective: pipe(
                ctx.objectives,
                A.findFirst(o => o.completion == "reverted"),
                O.orElse(() =>
                    pipe(
                        ctx.objectives,
                        A.findFirst(o => o.completion == "incomplete")
                    )
                ),
                O.getOrUndefined
            )
        }))
    )
}
