import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as E from "effect/Either"
import * as SC from "effect/Schema"
import {pipe} from "effect/Function"
import {EmotionRangeValue, EmotionRangeValues} from "../../src/actor/Emotion"

describe("EmotionRangeValue", () => {
    const EmotionRangeLabel = pipe(
        EmotionRangeValue(SC.String),
        SC.annotations({title: "Emotional Intensity Label"})
    )

    it("should validate a valid emotional intensity range", () => {
        const validRange = {
            min: 0,
            max: 50,
            value: "Mildly happy"
        }

        const result = pipe(
            validRange,
            SC.decodeUnknownEither(EmotionRangeLabel)
        )

        expect(result).toSatisfy(E.isRight)
    })

    it("should fail validation if min > max", () => {
        const invalidRange = {
            min: 60,
            max: 50,
            value: "Angry"
        }

        const message = pipe(
            invalidRange,
            SC.decodeUnknownEither(EmotionRangeLabel),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toBe(
            "Emotional Intensity Label\n" +
                "└─ Predicate refinement failure\n" +
                '   └─ The "min" value (60) must be less than the "max" value (50).'
        )
    })

    it("should fail validation for out-of-range min value", () => {
        const invalidRange = {
            min: -10,
            max: 80,
            value: "Sad"
        }

        const message = pipe(
            invalidRange,
            SC.decodeUnknownEither(EmotionRangeLabel),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toMatch(/Expected Emotion intensity .+, actual -10/)
    })

    it("should fail validation for out-of-range max value", () => {
        const invalidRange = {
            min: 10,
            max: 120,
            value: "Puzzled"
        }

        const message = pipe(
            invalidRange,
            SC.decodeUnknownEither(EmotionRangeLabel),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toMatch(/Expected Emotion intensity .+, actual 120/)
    })
})

describe("EmotionRangeValues", () => {
    const EmotionRangeLabels = pipe(
        EmotionRangeValues(SC.String),
        SC.annotations({title: "Emotional Intensity Labels"})
    )

    it("should validate a valid voice intensity map covering 0-100", () => {
        const validMap = [
            {min: 0, max: 50, value: "Happy"},
            {min: 51, max: 100, value: "HAPPY!!"}
        ]

        const result = pipe(
            validMap,
            SC.decodeUnknownEither(EmotionRangeLabels)
        )

        expect(result).toSatisfy(E.isRight)
    })

    it("should fail validation if ranges are not contiguous", () => {
        const invalidMap = [
            {min: 0, max: 40, value: "Sad"},
            {min: 42, max: 100, value: "Sad :("}
        ]

        const message = pipe(
            invalidMap,
            SC.decodeUnknownEither(EmotionRangeLabels),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toBe(
            "Emotional Intensity Labels\n└─ " +
                "Predicate refinement failure\n" +
                "   └─ Emotional intensity values must be contiguous."
        )
    })

    it("should fail validation if the full range 0-100 is not covered", () => {
        const invalidMap = [
            {min: 0, max: 30, value: "Angry"},
            {min: 31, max: 90, value: "FURIOUS!"}
        ]

        const message = pipe(
            invalidMap,
            SC.decodeUnknownEither(EmotionRangeLabels),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toBe(
            "Emotional Intensity Labels\n" +
                "└─ Predicate refinement failure\n" +
                "   └─ The values must cover the full range of emotional intensity (0-100)."
        )
    })

    it("should fail validation for overlapping ranges", () => {
        const invalidMap = [
            {min: 0, max: 60, value: "Neutral"},
            {
                min: 50,
                max: 100,
                value: "What does it even mean to be emotionally 'more neutral'?"
            }
        ]

        const message = pipe(
            invalidMap,
            SC.decodeUnknownEither(EmotionRangeLabels),
            E.flip,
            E.map(e => e.message),
            E.getOrNull
        )

        expect(message).toBe(
            "Emotional Intensity Labels\n" +
                "└─ Predicate refinement failure\n" +
                "   └─ Emotional intensity values must be contiguous."
        )
    })

    it("should allow a minimal valid configuration", () => {
        const validMinimalMap = [{min: 0, max: 100, value: "Whatever"}]

        const result = pipe(
            validMinimalMap,
            SC.decodeUnknownEither(EmotionRangeLabels)
        )

        expect(result).toSatisfy(E.isRight)
    })
})
