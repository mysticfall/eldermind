import {pipe} from "effect"
import * as SC from "effect/Schema"

export const EmotionType = pipe(
    SC.Union(
        SC.Literal("Neutral"),
        SC.Literal("Anger"),
        SC.Literal("Disgust"),
        SC.Literal("Fear"),
        SC.Literal("Sad"),
        SC.Literal("Happy"),
        SC.Literal("Surprise"),
        SC.Literal("Puzzled")
    ),
    SC.annotations({
        title: "Emotion Type",
        description:
            "Emotion type of an actor, taken from the Creation Kit's Response entry."
    })
)

export type EmotionType = typeof EmotionType.Type

export const EmotionIntensity = pipe(
    SC.Number,
    SC.int(),
    SC.between(0, 100),
    SC.brand("EmotionIntensity"),
    SC.annotations({
        title: "Emotion Intensity",
        description:
            "Emotion intensity of an actor, taken from the Creation Kit's Response entry."
    })
)

export type EmotionIntensity = typeof EmotionIntensity.Type

export const Emotion = pipe(
    SC.Struct({
        type: SC.optionalWith(EmotionType, {
            default: () => "Neutral"
        }),
        intensity: SC.optionalWith(EmotionIntensity, {
            default: () => EmotionIntensity.make(100)
        })
    }),
    SC.annotations({
        title: "Emotion",
        description: "Emotion of an actor."
    })
)

export type Emotion = typeof Emotion.Type
