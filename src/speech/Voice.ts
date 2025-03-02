import * as A from "effect/Array"
import * as E from "effect/Either"
import {Either} from "effect/Either"
import * as O from "effect/Option"
import {none} from "effect/Option"
import * as R from "effect/Record"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import * as SCH from "effect/Schedule"
import {Schedule} from "effect/Schedule"
import {StockVoiceType} from "skyrim-effect/game/VoiceType"
import {ActorHexId, Sex} from "skyrim-effect/game/Actor"
import {flow, pipe} from "effect"
import * as ORD from "effect/Order"
import {Order} from "effect/Order"
import * as SR from "effect/SynchronizedRef"
import {SynchronizedRef} from "effect/SynchronizedRef"
import {BaseError} from "../common/Error"
import {Emotion, EmotionIntensity, EmotionType} from "../actor/Emotion"
import {traverseArray} from "../common/Type"

export const VoicePathConfig = pipe(
    SC.Struct({
        root: SC.NonEmptyString,
        overrides: pipe(
            SC.Record({key: ActorHexId, value: SC.NonEmptyString}),
            SC.optional
        ),
        fallback: SC.optionalWith(
            SC.Record({key: Sex, value: StockVoiceType}),
            {
                default: () => ({
                    male: "MaleEvenToned",
                    female: "FemaleEvenToned",
                    none: "MaleEvenToned"
                })
            }
        )
    }),
    SC.annotations({
        title: "Voice Path Configuration",
        description: "Configuration for mapping actors to voice paths."
    })
)

export type VoicePathConfig = typeof VoicePathConfig.Type

export const VoiceFile = pipe(
    SC.NonEmptyString,
    SC.brand("VoiceFile"),
    SC.annotations({
        title: "Voice File",
        description: "Name of a voice file without the extension."
    })
)

export type VoiceFile = typeof VoiceFile.Type

export type VoiceFilePool = SynchronizedRef<Set<VoiceFile>>

export class NoAvailableVoiceFileError extends BaseError<NoAvailableVoiceFileError>(
    "NoAvailableVoiceFileError",
    {
        message: "No available voice files."
    }
) {}

export interface CheckedOutVoiceFile {
    readonly file: VoiceFile
    readonly release: Effect<void>
}

export const VoiceIntensityRange = pipe(
    SC.Struct({
        min: EmotionIntensity,
        max: EmotionIntensity,
        voices: SC.Set(VoiceFile)
    }),
    SC.filter(
        v =>
            v.min <= v.max ||
            `The "min" value (${v.min}) must be less than the "max" value (${v.max}).`
    ),
    SC.annotations({
        title: "Voice Intensity Range",
        description:
            "A set of voice files for the range of emotional intensity."
    })
)

export type VoiceIntensityRange = typeof VoiceIntensityRange.Type

export const VoiceIntensityMap = pipe(
    SC.Array(VoiceIntensityRange),
    SC.filter(entries =>
        pipe(
            entries,
            A.reduce(E.right(-1) as Either<number, string>, (acc, {min, max}) =>
                pipe(
                    acc,
                    E.flatMap(last =>
                        min == last + 1
                            ? E.right(max)
                            : E.left(
                                  last == 0
                                      ? "Voice intensity map must cover the full range of intensity (0-100)."
                                      : "Voice intensity map must be contiguous."
                              )
                    )
                )
            ),
            E.flatMap(last =>
                last == 100
                    ? E.right(true)
                    : E.left(
                          "Voice intensity map must cover the full range of intensity (0-100)."
                      )
            ),
            E.merge
        )
    ),
    SC.annotations({
        title: "Voice Intensity Map",
        description:
            "A set of voice files for the range of emotional intensity."
    })
)

export type VoiceIntensityMap = typeof VoiceIntensityMap.Type

export const VoiceFileEmotionMap = pipe(
    SC.extend(
        SC.Struct({
            Neutral: SC.Set(VoiceFile)
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
                value: SC.Union(VoiceIntensityMap, SC.Set(VoiceFile))
            })
        )
    ),
    SC.annotations({
        title: "Voice File Emotion Map",
        description: "Mapping between emotion types and voice files."
    })
)

export type VoiceFileEmotionMap = {
    Neutral: Set<VoiceFile>
} & Partial<
    Record<Exclude<EmotionType, "Neutral">, VoiceIntensityMap | Set<VoiceFile>>
>

export function getVoicePoolForEmotion(
    emotions: VoiceFileEmotionMap
): Effect<(emotion: Emotion) => VoiceFilePool> {
    const {Neutral, ...others} = emotions

    const byMin = <T extends {min: EmotionIntensity}>(): Order<T> =>
        ORD.mapInput(ORD.number, (v: T) => v.min)

    return FX.gen(function* () {
        const fallback = yield* SR.make(Neutral)

        type PoolFinder = (intensity: EmotionIntensity) => VoiceFilePool

        const createPoolFinder = (
            entries: readonly VoiceIntensityRange[]
        ): Effect<(intensity: EmotionIntensity) => VoiceFilePool> =>
            FX.gen(function* () {
                const pools = yield* pipe(
                    entries.values(),
                    A.sort(byMin()),
                    traverseArray(({voices, ...rest}) =>
                        pipe(
                            SR.make(voices),
                            FX.map(pool => ({
                                pool,
                                ...rest
                            }))
                        )
                    )
                )

                return intensity =>
                    pipe(
                        pools,
                        A.findFirst(
                            ({min, max}) => min <= intensity && intensity <= max
                        ),
                        O.map(v => v.pool),
                        O.getOrElse(() => fallback)
                    )
            })

        const isMap = SC.is(VoiceIntensityMap)

        const poolsForTypes = yield* pipe(
            others,
            O.fromNullable,
            A.fromOption,
            A.flatMap(entries =>
                pipe(
                    Object.keys(entries),
                    A.filter(SC.is(EmotionType)),
                    A.filterMap(type =>
                        type == "Neutral"
                            ? none()
                            : pipe(
                                  entries[type],
                                  O.fromNullable,
                                  O.map(value => ({
                                      type,
                                      ranges: isMap(value)
                                          ? value
                                          : VoiceIntensityMap.make([
                                                {
                                                    min: EmotionIntensity.make(
                                                        0
                                                    ),
                                                    max: EmotionIntensity.make(
                                                        100
                                                    ),
                                                    voices: value
                                                }
                                            ])
                                  }))
                              )
                    )
                )
            ),
            traverseArray(({type, ranges}) =>
                pipe(
                    createPoolFinder(ranges),
                    FX.map(pool => ({type, pool}))
                )
            ),
            FX.map(
                flow(
                    A.map<
                        readonly {type: EmotionType; pool: PoolFinder}[],
                        [EmotionType, PoolFinder]
                    >(({type, pool}) => [type, pool]),
                    R.fromEntries
                )
            )
        )

        return ({type, intensity}: Emotion) =>
            pipe(
                poolsForTypes,
                R.get(type),
                O.getOrElse(() => () => fallback)
            )(intensity)
    })
}

export function executeWithVoice(
    pool: VoiceFilePool,
    retrySchedule: Schedule<number> = SCH.addDelay(
        SCH.recurs(5),
        () => "1 second"
    )
): <T, E, R = never>(
    task: (voice: VoiceFile) => Effect<T, E, R>
) => Effect<T, E | NoAvailableVoiceFileError, R> {
    const checkout = pool.modifyEffect(p =>
        pipe(
            p.values().toArray(),
            O.liftPredicate(A.isNonEmptyArray),
            O.map(A.unprepend),
            O.map(([head, tail]) => [head, new Set(tail)])
        )
    )

    const acquire = pipe(
        checkout,
        FX.tap(f => FX.logDebug(`Checked out voice file: ${f}`)),
        FX.retry(retrySchedule),
        FX.catchTag(
            "NoSuchElementException",
            () => new NoAvailableVoiceFileError()
        )
    )

    const release = (file: VoiceFile) =>
        pipe(
            pool.modify(p => {
                p.add(file)
                return [file, p]
            }),
            FX.tap(f => FX.logDebug(`Released voice file: ${f}`))
        )

    return task => FX.acquireUseRelease(acquire, task, release)
}
