import * as A from "effect/Array"
import * as O from "effect/Option"
import {none} from "effect/Option"
import * as R from "effect/Record"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import * as SCH from "effect/Schedule"
import {Schedule} from "effect/Schedule"
import {getKnownVoiceName, VoiceName} from "skyrim-effect/game/VoiceType"
import {
    ActorHexId,
    ActorId,
    getActor,
    getActorHexId,
    getSex,
    Sex
} from "skyrim-effect/game/Actor"
import {flow, pipe} from "effect"
import * as ORD from "effect/Order"
import {Order} from "effect/Order"
import * as SR from "effect/SynchronizedRef"
import {SynchronizedRef} from "effect/SynchronizedRef"
import {ErrorArgs, ErrorLike} from "../common/Error"
import {
    Emotion,
    EmotionIntensity,
    EmotionRangeMap,
    EmotionRangeValue,
    EmotionRangeValues,
    EmotionType
} from "../actor/Emotion"
import {traverseArray} from "../common/Type"
import {defaultScheduler, Scheduler} from "effect/Scheduler"
import {FormError} from "skyrim-effect/game/Form"
import {ActorBase} from "@skyrim-platform/skyrim-platform"
import {TaggedError} from "effect/Data"
import {GamePaths} from "../data/Service"
import {ModName} from "../game/Game"
import {FilePath} from "../data/File"
import {Path} from "@effect/platform/Path"

export const VoiceFolderConfig = pipe(
    SC.Struct({
        modName: SC.optionalWith(ModName, {
            default: () => ModName.make("Eldermind.esp")
        }),
        overrides: pipe(
            SC.Record({key: ActorHexId, value: VoiceName}),
            SC.optional
        ),
        fallback: SC.optionalWith(SC.Record({key: Sex, value: VoiceName}), {
            default: () => ({
                male: VoiceName.make("MaleEvenToned"),
                female: VoiceName.make("FemaleEvenToned"),
                none: VoiceName.make("MaleEvenToned")
            })
        })
    }),
    SC.annotations({
        title: "Voice Folder Configuration",
        description: "Configuration for mapping actors to voice folders"
    })
)

export type VoiceFolderConfig = typeof VoiceFolderConfig.Type

export const VoiceFile = pipe(
    SC.NonEmptyString,
    SC.brand("VoiceFile"),
    SC.annotations({
        title: "Voice File",
        description: "Name of a voice file without the extension"
    })
)

export type VoiceFile = typeof VoiceFile.Type

export type VoiceFilePool = SynchronizedRef<Set<VoiceFile>>

export type VoicePathResolver = (
    speaker: ActorId,
    file: VoiceFile
) => Effect<
    {readonly wav: FilePath; readonly lip: FilePath},
    FormError,
    GamePaths | Path
>

export function createVoicePathResolver(
    config: VoiceFolderConfig,
    scheduler: Scheduler = defaultScheduler
): VoicePathResolver {
    const {modName, overrides, fallback} = config

    return (speaker, file) =>
        FX.gen(function* () {
            const path = yield* Path
            const {data} = yield* GamePaths

            const {voice} = yield* pipe(
                FX.Do,
                FX.bind("actor", () => getActor(speaker)),
                FX.bind("voice", ({actor}) =>
                    pipe(
                        overrides,
                        O.fromNullable,
                        O.flatMap(flow(R.get(getActorHexId(actor)))),
                        O.orElse(() => getKnownVoiceName(actor)),
                        O.getOrElse(
                            () =>
                                fallback[
                                    //FIXME Handle the case when `null` is returned (e.g. throwing a FormError).
                                    getSex(
                                        actor.getLeveledActorBase() as ActorBase
                                    )
                                ]
                        ),
                        FX.succeed
                    )
                ),
                FX.withScheduler(scheduler)
            )

            const getPath = (extension: "wav" | "lip") =>
                pipe(
                    path.join(
                        data.path,
                        "Sound",
                        "Voice",
                        modName,
                        voice,
                        `${file}.${extension}`
                    ),
                    FilePath.make
                )

            return {
                wav: getPath("wav"),
                lip: getPath("lip")
            }
        })
}

export class NoAvailableVoiceFileError extends TaggedError(
    "NoAvailableVoiceFileError"
)<ErrorLike> {
    constructor(args: ErrorArgs = {}) {
        super({
            ...args,
            message: args.message ?? "No available voice file."
        })
    }
}

export const VoiceFilesForEmotionRange = pipe(
    EmotionRangeValue(SC.Set(VoiceFile)),
    SC.annotations({
        title: "Voice Files For Emotion Range",
        description:
            "A set of voice files for the range of emotional intensity."
    })
)

export type VoiceFilesForEmotionRange = typeof VoiceFilesForEmotionRange.Type

export const VoiceFilesForEmotionRanges = pipe(
    EmotionRangeValues(SC.Set(VoiceFile)),
    SC.annotations({
        title: "Voice Files For Emotion Ranges",
        description:
            "A set of voice files for the range of emotional intensity."
    })
)

export type VoiceFilesForEmotionRanges = typeof VoiceFilesForEmotionRanges.Type

export const VoiceFilesEmotionRangeMap = pipe(
    EmotionRangeMap(SC.Set(VoiceFile)),
    SC.annotations({
        title: "Voice Files Emotion Range Map",
        description: "Mapping between emotion types and voice files"
    })
)

export type VoiceFilesEmotionRangeMap = EmotionRangeMap<Set<VoiceFile>>

export function getVoicePoolForEmotion(
    emotions: VoiceFilesEmotionRangeMap
): Effect<(emotion: Emotion) => VoiceFilePool> {
    const {Neutral, ...others} = emotions

    const byMin = <T extends {min: EmotionIntensity}>(): Order<T> =>
        ORD.mapInput(ORD.number, (v: T) => v.min)

    return FX.gen(function* () {
        const fallback = yield* SR.make(Neutral)

        type PoolFinder = (intensity: EmotionIntensity) => VoiceFilePool

        const createPoolFinder = (
            entries: readonly VoiceFilesForEmotionRange[]
        ): Effect<(intensity: EmotionIntensity) => VoiceFilePool> =>
            FX.gen(function* () {
                const pools = yield* pipe(
                    entries.values(),
                    A.sort(byMin()),
                    traverseArray(({value, ...rest}) =>
                        pipe(
                            SR.make(value),
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

        const isMap = SC.is(VoiceFilesForEmotionRanges)

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
                                          : VoiceFilesForEmotionRanges.make([
                                                {
                                                    min: EmotionIntensity.make(
                                                        0
                                                    ),
                                                    max: EmotionIntensity.make(
                                                        100
                                                    ),
                                                    value
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
