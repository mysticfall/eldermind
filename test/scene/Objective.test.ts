import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import {
    ObjectiveChecklist,
    ObjectiveCompletion,
    ObjectiveContext,
    ObjectiveId,
    ObjectiveInstruction,
    ObjectiveListContainer,
    withActiveObjective
} from "../../src/scene/Objective"
import * as A from "effect/Array"
import * as FX from "effect/Effect"
import {flow, pipe} from "effect"
import {ContextBuilder} from "../../src/common/Data"

describe("withActiveObjective", () => {
    const createList = (
        ...statusList: readonly ObjectiveCompletion[]
    ): ObjectiveListContainer => ({
        objectives: pipe(
            statusList,
            A.map((completion, i) =>
                ObjectiveContext.make({
                    id: ObjectiveId.make(`objective${i + 1}`),
                    instruction: ObjectiveInstruction.make("Some instruction."),
                    checklist: ObjectiveChecklist.make("A checklist."),
                    examples: A.empty(),
                    completion
                })
            )
        )
    })

    const builder: ContextBuilder<
        ObjectiveListContainer,
        ObjectiveListContainer
    > = FX.succeed

    const findActiveObjective = flow(
        pipe(builder, withActiveObjective),
        FX.map(c => c.activeObjective)
    )

    it.effect(
        "should find the first objective in the 'reverted' or 'incomplete' state",
        () =>
            FX.gen(function* () {
                const objective2 = yield* pipe(
                    createList("complete", "incomplete", "complete"),
                    findActiveObjective
                )

                expect(objective2?.id).toBe("objective2")

                const objective1 = yield* pipe(
                    createList("incomplete", "incomplete", "complete"),
                    findActiveObjective
                )

                expect(objective1?.id).toBe("objective1")

                const objective3 = yield* pipe(
                    createList("complete", "complete", "reverted"),
                    findActiveObjective
                )

                expect(objective3?.id).toBe("objective3")
            })
    )

    it.effect(
        "should prioritise the reverted objective if coexist with an incomplete ones",
        () =>
            FX.gen(function* () {
                const objective3 = yield* pipe(
                    createList(
                        "complete",
                        "incomplete",
                        "reverted",
                        "incomplete"
                    ),
                    findActiveObjective
                )

                expect(objective3?.id).toBe("objective3")
            })
    )

    it.effect(
        "should return `undefined` when there's no incomplete or reverted objective",
        () =>
            FX.gen(function* () {
                const objective = yield* pipe(
                    createList("complete", "complete"),
                    findActiveObjective
                )

                expect(objective).toBeUndefined()
            })
    )
})
