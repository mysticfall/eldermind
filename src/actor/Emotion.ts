import {pipe} from "effect"
import * as A from "effect/Array"
import * as E from "effect/Either"
import {Either} from "effect/Either"
import * as SC from "effect/Schema"
import {Schema} from "effect/Schema"

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
        description: "Emotion of an actor"
    })
)

export type Emotion = typeof Emotion.Type

export const EmotionRangeValue = <A, I = A, R = never>(
    schema: Schema<A, I, R>
) =>
    pipe(
        SC.Struct({
            min: EmotionIntensity,
            max: EmotionIntensity,
            value: schema
        }),
        SC.filter(
            v =>
                v.min <= v.max ||
                `The "min" value (${v.min}) must be less than the "max" value (${v.max}).`
        )
    )

export interface EmotionRangeValue<T> {
    readonly min: EmotionIntensity
    readonly max: EmotionIntensity
    readonly value: T
}

export const EmotionRangeValues = <A, I = A, R = never>(
    schema: Schema<A, I, R>
) =>
    pipe(
        SC.Array(EmotionRangeValue(schema)),
        SC.filter(entries =>
            pipe(
                entries,
                A.reduce(
                    E.right(-1) as Either<number, string>,
                    (acc, {min, max}) =>
                        pipe(
                            acc,
                            E.flatMap(last =>
                                min == last + 1
                                    ? E.right(max)
                                    : E.left(
                                          last == 0
                                              ? "The values must cover the full range of emotional intensity (0-100)."
                                              : "Emotional intensity values must be contiguous."
                                      )
                            )
                        )
                ),
                E.flatMap(last =>
                    last == 100
                        ? E.right(true)
                        : E.left(
                              "The values must cover the full range of emotional intensity (0-100)."
                          )
                ),
                E.merge
            )
        )
    )

export type EmotionRangeValues<T> = readonly EmotionRangeValue<T>[]

export const EmotionRangeMap = <A, I = A, R = never>(schema: Schema<A, I, R>) =>
    pipe(
        SC.extend(
            SC.Struct({
                Neutral: schema
            }),
            SC.partial(
                SC.Record({
                    // Couldn't find a way to define Exclude<EmotionType, "Neutral"> that
                    // can be used as an index key:
                    key: SC.Union(
                        SC.Literal("Anger"),
                        SC.Literal("Disgust"),
                        SC.Literal("Fear"),
                        SC.Literal("Sad"),
                        SC.Literal("Happy"),
                        SC.Literal("Surprise"),
                        SC.Literal("Puzzled")
                    ),
                    value: SC.Union(EmotionRangeValues(schema), schema)
                })
            )
        )
    )

export type EmotionRangeMap<T> = {
    Neutral: T
} & Partial<Record<Exclude<EmotionType, "Neutral">, EmotionRangeValues<T> | T>>
