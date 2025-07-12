import * as A from "effect/Array"
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as SC from "effect/Schema"
import * as SP from "effect/Scope"
import {Scope} from "effect/Scope"
import * as PS from "effect/PubSub"
import {PubSub} from "effect/PubSub"
import * as RF from "effect/Ref"
import * as Q from "effect/Queue"
import {TaggedError} from "effect/Data"
import {pipe} from "effect"
import {ErrorArgs, ErrorLike} from "../common/Error"

export const GameEvent = SC.Struct({
    time: SC.Duration
})

export type GameEvent = typeof GameEvent.Type

export class EventRetrievalError extends TaggedError(
    "EventRetrievalError"
)<ErrorLike> {
    constructor(args: ErrorArgs = {}) {
        super({
            ...args,
            message:
                args.message ??
                "Failed to retrieve events from the event store."
        })
    }
}

export interface EventStore<T extends GameEvent> {
    readonly pubsub: PubSub<T>

    findLatest(): Effect<readonly T[], EventRetrievalError>
}

export function createInMemoryEventStore<T extends GameEvent>(): Effect<
    EventStore<T>,
    never,
    Scope
> {
    return FX.gen(function* () {
        const ref = yield* RF.make<readonly T[]>(A.empty())

        const scope = yield* Scope
        const pubsub = yield* PS.unbounded<T>()
        const queue = yield* PS.subscribe(pubsub)

        yield* SP.addFinalizer(
            scope,
            pipe(
                FX.logInfo("Shutting down the event store."),
                FX.flatMap(() => PS.shutdown(pubsub))
            )
        )

        pipe(
            queue,
            Q.take,
            FX.flatMap(e => RF.update(ref, A.append(e))),
            FX.repeat({until: () => PS.isShutdown(pubsub)}),
            FX.runFork
        )

        return {
            pubsub,
            findLatest: () => ref.get
        }
    })
}
