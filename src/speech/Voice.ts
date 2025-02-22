import * as A from "effect/Array"
import * as O from "effect/Option"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import * as SCH from "effect/Schedule"
import {Schedule} from "effect/Schedule"
import {StockVoiceType} from "skyrim-effect/game/VoiceType"
import {ActorHexId, Sex} from "skyrim-effect/game/Actor"
import {pipe} from "effect"
import * as SR from "effect/SynchronizedRef"
import {SynchronizedRef} from "effect/SynchronizedRef"
import {BaseError} from "../common/Error"
import {Scope} from "effect/Scope"

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

export function reserveVoiceFile(
    pool: VoiceFilePool,
    retrySchedule: Schedule<number> = SCH.addDelay(
        SCH.recurs(5),
        () => "1 second"
    )
): Effect<CheckedOutVoiceFile, NoAvailableVoiceFileError> {
    const checkout = pool.modifyEffect(p =>
        pipe(
            p.values().toArray(),
            O.liftPredicate(A.isNonEmptyArray),
            O.map(A.unprepend),
            O.map(([head, tail]) => [head, new Set(tail)])
        )
    )

    return pipe(
        checkout,
        FX.map(file => ({
            file,
            release: pipe(
                pool,
                SR.update(p => p.add(file))
            )
        })),
        FX.tap(f => FX.logDebug(`Checked out voice file: ${f}`)),
        FX.retry(retrySchedule),
        FX.catchTag(
            "NoSuchElementException",
            () => new NoAvailableVoiceFileError()
        )
    )
}

export function executeWithVoice(
    voiceFile: Effect<CheckedOutVoiceFile, NoAvailableVoiceFileError>
): <T, E, R = never>(
    task: (voice: VoiceFile) => Effect<T, E, R>
) => Effect<T, E | NoAvailableVoiceFileError, R | Scope> {
    return task =>
        FX.gen(function* () {
            const {file, release} = yield* voiceFile

            yield* FX.addFinalizer(() =>
                FX.gen(function* () {
                    yield* FX.logDebug(`Releasing voice file: ${file}`)
                    yield* release
                })
            )

            return yield* task(file)
        }).pipe(FX.scoped)
}
