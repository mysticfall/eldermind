import * as DU from "effect/Duration"
import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import {
    DialogueEvent,
    DialogueText,
    isDialogueBetween
} from "../../src/speech/Dialogue"
import {ActorId} from "skyrim-effect/game/Actor"

describe("isDialogueBetween", () => {
    const actorA = ActorId.make(1)
    const actorB = ActorId.make(2)

    const sampleEvent = (speaker: ActorId, target: ActorId): DialogueEvent => ({
        type: "dialogue",
        speaker,
        target,
        dialogue: DialogueText.make("Hello!"),
        time: DU.seconds(100)
    })

    it("should return true if the event is a dialogue between two actors (A->B)", () => {
        const pred = isDialogueBetween(actorA, actorB)
        const event = sampleEvent(actorA, actorB)

        expect(pred(event)).toBe(true)
    })

    it("should return true if the event is a dialogue between two actors (B->A)", () => {
        const pred = isDialogueBetween(actorA, actorB)
        const event = sampleEvent(actorB, actorA)

        expect(pred(event)).toBe(true)
    })

    it("should return false if one of the actors does not match", () => {
        const pred = isDialogueBetween(actorA, actorB)
        const event = sampleEvent(actorA, ActorId.make(3))

        expect(pred(event)).toBe(false)
    })
})
