import * as A from "effect/Array"
import * as R from "effect/Record"
import {ReadonlyRecord} from "effect/Record"
import * as O from "effect/Option"
import {Option} from "effect/Option"
import * as HS from "effect/HashSet"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SR from "effect/SynchronizedRef"
import {SynchronizedRef} from "effect/SynchronizedRef"
import * as SC from "effect/Schema"
import {
    ContextDataError,
    DataIdentifier,
    InvalidDataError
} from "../common/Data"
import {pipe} from "effect"
import {ActorContext, ActorContextBuilder} from "../actor/Actor"
import {ActorHexId, ActorId, getActor} from "skyrim-effect/game/Actor"
import {EventRetrievalError, EventStore, GameEvent} from "../event/Event"
import {BaseError} from "../common/Error"
import {traverseArray} from "../common/Type"
import {toHexId} from "skyrim-effect/game/Form"
import {Scheduler} from "effect/Scheduler"

export const SceneId = pipe(
    DataIdentifier,
    SC.brand("SceneId"),
    SC.annotations({
        title: "Scene ID",
        description: "Unique identifier of the scene"
    })
)

export type SceneId = typeof SceneId.Type

export const Role = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("Role"),
    SC.annotations({
        title: "Role",
        description: "A role that an actor can play in a scene"
    })
)

export type Role = typeof Role.Type

export class SceneRequirementError extends BaseError<SceneRequirementError>(
    "SceneRequirementError",
    {
        message: "Requirement of the scene is not met."
    }
) {}

export class SceneProcessError extends BaseError<SceneProcessError>(
    "SceneProcessError",
    {
        message: "Failed to process the scene."
    }
) {}

export class SceneCreationError extends BaseError<SceneCreationError>(
    "SceneCreationError",
    {
        message: "Failed to create a scene."
    }
) {}

export interface SceneContext<TActor extends ActorContext = ActorContext> {
    readonly actors: ReadonlyRecord<Role, TActor>
}

export interface SceneArguments {
    readonly actors: ReadonlyRecord<Role, ActorId>
}

export interface SceneRequest {
    readonly id: SceneId
    readonly args: SceneArguments
}

export type SceneTransition = "end" | "repeat" | SceneRequest

export interface SceneResult<
    TActor extends ActorContext = unknown & ActorContext,
    TContext extends SceneContext<TActor> = unknown & SceneContext<TActor>
> {
    readonly context: TContext
    readonly transition: SceneTransition
}

export interface Scene<
    TArgs extends SceneArguments = unknown & SceneArguments
> {
    readonly id: SceneId
    readonly roles: readonly Role[]

    parseArgs(args: unknown & SceneArguments): Effect<TArgs, InvalidDataError>

    run(
        args: TArgs
    ): Effect<Option<SceneRequest>, SceneRequirementError | SceneProcessError>
}

export abstract class AbstractScene<
    TArgs extends SceneArguments = unknown & SceneArguments,
    TEvent extends GameEvent = unknown & GameEvent,
    TActor extends ActorContext = unknown & ActorContext,
    TContext extends SceneContext<TActor> = unknown & SceneContext<TActor>
> implements Scene
{
    protected readonly latestEvents: Effect<
        readonly TEvent[],
        SceneProcessError
    >

    constructor(
        readonly id: SceneId,
        readonly roles: readonly Role[],
        protected readonly resolveActor: ActorContextBuilder<TActor>,
        protected readonly eventStore: EventStore<TEvent>,
        protected readonly gameScheduler: Scheduler
    ) {
        this.run = this.run.bind(this)
        this.beforeStart = this.beforeStart.bind(this)
        this.afterEnd = this.afterEnd.bind(this)
        this.resolveRoles = this.resolveRoles.bind(this)

        this.latestEvents = pipe(
            this.eventStore.findLatest(),
            FX.catchTag(
                "EventRetrievalError",
                (e: EventRetrievalError) =>
                    new SceneProcessError({
                        message: `Failed to retrieve events for scene "${id}".`,
                        cause: e
                    })
            )
        )
    }

    abstract parseArgs(
        args: unknown & SceneArguments
    ): Effect<TArgs, InvalidDataError>

    run(
        args: TArgs
    ): Effect<Option<SceneRequest>, SceneRequirementError | SceneProcessError> {
        const r1 = pipe(this.roles, HS.fromIterable)
        const r2 = pipe(args.actors, R.keys, HS.fromIterable)

        const d1 = HS.difference(r1, r2)
        const d2 = HS.difference(r2, r1)

        if (pipe(d1, HS.size) != 0) {
            const missing = pipe(d1, HS.toValues, A.join(", "))

            return FX.fail(
                new SceneRequirementError({
                    message: `The scene "${this.id}" is missing required role mappings for: ${missing}.`
                })
            )
        } else if (pipe(d2, HS.size) != 0) {
            const unknown = pipe(d2, HS.toValues, A.join(", "))

            return FX.fail(
                new SceneRequirementError({
                    message: `The scene "${this.id}" was provided with unknown roles: ${unknown}.`
                })
            )
        }

        const {id, beforeStart, doRun, afterEnd} = this

        const getContext = (previous?: TContext) =>
            pipe(
                this.resolveRoles(args.actors),
                FX.flatMap(actors => this.buildContext(actors, previous)),
                FX.withScheduler(this.gameScheduler)
            )

        const createTurn = (
            ref: SynchronizedRef<{context: TContext; turn: number}>
        ) =>
            FX.gen(function* () {
                const {context, turn} = yield* pipe(
                    ref,
                    SR.updateAndGetEffect(s =>
                        pipe(
                            s.context,
                            s.turn == 0 ? FX.succeed : getContext,
                            FX.map(context => ({
                                context,
                                turn: s.turn + 1
                            }))
                        )
                    )
                )

                yield* FX.logDebug(
                    `Invoking the turn #${turn} on scene "${id}".`
                )

                const result = yield* doRun(args, context, turn)

                yield* pipe(
                    ref,
                    SR.update(s => ({
                        ...s,
                        context: result.context
                    }))
                )

                return {transition: result.transition, context: result.context}
            })

        return FX.gen(function* () {
            FX.logInfo(`Starting scene: ${id}`)

            const ref = yield* pipe(
                getContext(),
                FX.map(context => ({context, turn: 0})),
                FX.flatMap(SR.make)
            )

            const {context: initialContext} = yield* pipe(ref, SR.get)

            yield* beforeStart(args, initialContext)

            return yield* pipe(
                createTurn(ref),
                FX.repeat({
                    while: r => r.transition == "repeat"
                }),
                FX.tap(({context}) => afterEnd(args, context)),
                FX.map(r => r.transition),
                FX.map(O.liftPredicate(t => t != "end" && t != "repeat"))
            )
        })
    }

    protected beforeStart(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _args: TArgs,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: TContext
    ): Effect<void, SceneProcessError> {
        return FX.void
    }

    protected abstract doRun(
        args: TArgs,
        context: TContext,
        turn: number
    ): Effect<SceneResult<TActor, TContext>, SceneProcessError>

    protected afterEnd(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _args: TArgs,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _context: TContext
    ): Effect<void, SceneProcessError> {
        return FX.void
    }

    protected abstract buildContext(
        actors: ReadonlyRecord<Role, TActor>,
        previous?: TContext
    ): Effect<TContext>

    protected resolveRoles(
        actors: ReadonlyRecord<Role, ActorId>
    ): Effect<ReadonlyRecord<Role, TActor>, SceneProcessError> {
        return pipe(
            actors,
            R.toEntries,
            traverseArray(([role, id]) =>
                pipe(
                    getActor(id),
                    FX.flatMap(this.resolveActor),
                    FX.map<TActor, [Role, TActor]>(a => [role, a]),
                    FX.catchTag(
                        "ContextDataError",
                        (e: ContextDataError) =>
                            new SceneProcessError({
                                message: `Failed to get data of actor "${toHexId(ActorHexId)}" for "${role}" in "${this.id}".`,
                                cause: e
                            })
                    ),
                    FX.catchTag(
                        "FormError",
                        e =>
                            new SceneProcessError({
                                message: `Failed to resolve actor "${toHexId(ActorHexId)}" for "${role}" in "${this.id}".`,
                                cause: e
                            })
                    )
                )
            ),
            FX.map(R.fromEntries)
        )
    }
}

export function runScene<TArgs extends SceneArguments>(
    scene: Scene<TArgs>,
    args: SceneArguments
): Effect<Option<SceneRequest>, SceneRequirementError | SceneProcessError> {
    return pipe(args, scene.parseArgs, FX.flatMap(scene.run))
}
