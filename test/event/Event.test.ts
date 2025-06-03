import {describe, expect, it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as PS from "effect/PubSub"
import * as SC from "effect/Schema"
import * as Q from "effect/Queue"
import {createInMemoryEventStore, GameEvent} from "../../src/event/Event"
import {GameTime} from "skyrim-effect/game/Time"
import {pipe, TestClock} from "effect"

const ModEvent = SC.Union(
    SC.extend(
        GameEvent,
        SC.Struct({
            type: SC.tag("speak")
        })
    ),
    SC.extend(
        GameEvent,
        SC.Struct({
            type: SC.tag("wait")
        })
    )
)

type ModEvent = typeof ModEvent.Type

describe("EventStore", () => {
    const testEvents: readonly ModEvent[] = [
        {
            type: "speak",
            time: GameTime.make(120)
        },
        {
            type: "wait",
            time: GameTime.make(121)
        },
        {
            type: "speak",
            time: GameTime.make(125)
        }
    ]

    describe("createInMemoryEventStore", () => {
        it.scoped(
            "should allow retrieving published events in chronological order",
            () =>
                FX.gen(function* () {
                    const {pubsub, findLatest} =
                        yield* createInMemoryEventStore<ModEvent>()

                    const events = pipe(
                        TestClock.adjust("1 millis"),
                        FX.flatMap(() => findLatest())
                    )

                    expect(yield* events).toHaveLength(0)

                    yield* pubsub.publish(testEvents[0])

                    expect(yield* events).toHaveLength(1)
                    expect(yield* events).toEqual(testEvents.slice(0, 1))

                    yield* pubsub.publish(testEvents[1])
                    yield* pubsub.publish(testEvents[2])

                    expect(yield* events).toHaveLength(3)
                    expect(yield* events).toEqual(testEvents)
                })
        )

        it.scoped("should broadcast events through PubSub subscription", () =>
            FX.gen(function* () {
                const {pubsub} = yield* createInMemoryEventStore<ModEvent>()

                const events: ModEvent[] = []
                const queue = yield* pipe(pubsub, PS.subscribe)

                const takeOne = pipe(
                    TestClock.adjust("1 millis"),
                    FX.flatMap(() => Q.take(queue)),
                    FX.tap(e => events.push(e))
                )

                expect(events).toHaveLength(0)

                yield* pubsub.publish(testEvents[0])
                yield* takeOne

                expect(events).toHaveLength(1)
                expect(events).toEqual(testEvents.slice(0, 1))

                yield* pubsub.publish(testEvents[1])
                yield* pubsub.publish(testEvents[2])

                yield* takeOne
                yield* takeOne

                expect(events).toHaveLength(3)
                expect(events).toEqual(testEvents)
            })
        )
    })
})
