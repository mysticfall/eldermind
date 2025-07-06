import {describe, expect, vi} from "vitest"
import {installActorMocks, mockActors} from "actor/mock"
import {it} from "@effect/vitest"
import * as E from "effect/Either"
import * as O from "effect/Option"
import * as FX from "effect/Effect"
import {
    AbstractScene,
    Role,
    runScene,
    SceneArguments,
    SceneContext,
    SceneId,
    SceneRequirementError,
    SceneTransition
} from "../../src/scene/Scene"
import {
    ActorId,
    ActorName,
    getActorId,
    PlayerId
} from "skyrim-effect/game/Actor"
import {
    createInMemoryEventStore,
    EventStore,
    GameEvent
} from "../../src/event/Event"
import {pipe} from "effect"
import {defaultScheduler} from "effect/Scheduler"
import {ReadonlyRecord} from "effect/Record"
import {ActorContext, actorContextBuilder} from "../../src/actor/Actor"
import {Actor} from "@skyrim-platform/skyrim-platform"
import {InvalidDataError} from "../../src/data/Data"

installActorMocks()

const TestRoles = {
    Thane: Role.make("thane"),
    Housecarl: Role.make("housecarl")
} as const

type TestContext = SceneContext & {
    count: number
}

class TestScene extends AbstractScene<
    SceneArguments,
    GameEvent,
    ActorContext,
    TestContext
> {
    constructor(
        eventStore: EventStore<GameEvent>,
        private maxRepeat = 2
    ) {
        super(
            "test" as SceneId,
            [TestRoles.Thane, TestRoles.Housecarl],
            actorContextBuilder,
            eventStore,
            defaultScheduler
        )

        this.doRun = this.doRun.bind(this)
    }

    override parseArgs = FX.succeed

    override doRun(_args: SceneArguments, context: TestContext) {
        const {count} = context

        return FX.succeed({
            context: {
                ...context,
                count: count + 1
            },
            transition: (count >= this.maxRepeat - 1
                ? "end"
                : "repeat") as SceneTransition
        })
    }

    public resolveRoles = super.resolveRoles

    override buildContext(
        actors: ReadonlyRecord<Role, ActorContext>,
        previous?: TestContext
    ) {
        return FX.succeed({actors, count: previous?.count ?? 0})
    }

    public beforeStart = super.beforeStart

    public afterEnd = super.afterEnd
}

describe("AbstractScene", () => {
    describe("run", () => {
        it.scoped("should fail when not all required roles are mapped", () =>
            FX.gen(function* () {
                const eventStore = yield* createInMemoryEventStore()

                const scene = new TestScene(eventStore)

                const result = yield* pipe(
                    scene.run({
                        actors: {
                            [TestRoles.Thane]: PlayerId
                        }
                    }),
                    FX.either
                )

                const {_tag, message} = yield* pipe(result, E.getLeft)

                expect(_tag).toBe("SceneRequirementError")
                expect(message).toBe(
                    'The scene "test" is missing required role mappings for: housecarl.'
                )
            })
        )

        it.scoped("should fail when unknown role mapping is present", () =>
            FX.gen(function* () {
                const eventStore = yield* createInMemoryEventStore()

                const scene = new TestScene(eventStore)

                const result = yield* pipe(
                    scene.run({
                        actors: {
                            [TestRoles.Thane]: PlayerId,
                            [TestRoles.Housecarl]: pipe(
                                mockActors.Lydia,
                                getActorId
                            ),
                            [Role.make("jarl")]: pipe(
                                mockActors.Ulfric,
                                getActorId
                            )
                        }
                    }),
                    FX.either
                )

                const {_tag, message} = yield* pipe(result, E.getLeft)

                expect(_tag).toBe("SceneRequirementError")
                expect(message).toBe(
                    'The scene "test" was provided with unknown roles: jarl.'
                )
            })
        )
    })

    describe("doRun", () => {
        it.scoped(
            "should be invoked repeatedly until the transition is set to end",
            () =>
                FX.gen(function* () {
                    const eventStore = yield* createInMemoryEventStore()

                    const scene = new TestScene(eventStore, 3)

                    const doRun = vi.spyOn(scene, "doRun")

                    const result = yield* pipe(
                        scene.run({
                            actors: {
                                [TestRoles.Thane]: PlayerId,
                                [TestRoles.Housecarl]: pipe(
                                    mockActors.Lydia,
                                    getActorId
                                )
                            }
                        })
                    )

                    expect(result).toSatisfy(O.isNone)
                    expect(doRun).toHaveBeenCalledTimes(3)
                })
        )

        it.scoped(
            "should be invoked with the current turn number as an argument",
            () =>
                FX.gen(function* () {
                    const eventStore = yield* createInMemoryEventStore()

                    const scene = new TestScene(eventStore, 3)

                    const doRun = vi.spyOn(scene, "doRun")

                    yield* pipe(
                        scene.run({
                            actors: {
                                [TestRoles.Thane]: PlayerId,
                                [TestRoles.Housecarl]: pipe(
                                    mockActors.Lydia,
                                    getActorId
                                )
                            }
                        })
                    )

                    expect(doRun).toHaveBeenNthCalledWith(
                        1,
                        expect.anything(),
                        expect.anything(),
                        1
                    )

                    expect(doRun).toHaveBeenNthCalledWith(
                        2,
                        expect.anything(),
                        expect.anything(),
                        2
                    )

                    expect(doRun).toHaveBeenNthCalledWith(
                        3,
                        expect.anything(),
                        expect.anything(),
                        3
                    )
                })
        )
    })

    describe("resolveRoles", () => {
        it.scoped(
            "should return a map of resolved roles using the scene's ActorContextBuilder",
            () =>
                FX.gen(function* () {
                    const eventStore = yield* createInMemoryEventStore()

                    class MockScene extends TestScene {
                        override resolveActor = (actor: Actor) =>
                            FX.succeed<ActorContext>({
                                id: ActorId.make(actor.getFormID()),
                                name: ActorName.make(
                                    actor.getDisplayName().toUpperCase()
                                )
                            })
                    }

                    const scene = new MockScene(eventStore)

                    const roles = yield* scene.resolveRoles({
                        [TestRoles.Thane]: PlayerId,
                        [TestRoles.Housecarl]: pipe(
                            mockActors.Lydia,
                            getActorId
                        )
                    })

                    expect(roles[TestRoles.Thane].name).toBe("PLAYER")
                    expect(roles[TestRoles.Housecarl].name).toBe("LYDIA")
                })
        )
    })

    describe("buildContext", () => {
        it.scoped("should be called to provide the initial context", () =>
            FX.gen(function* () {
                const eventStore = yield* createInMemoryEventStore()

                class MockScene extends TestScene {
                    override buildContext(
                        actors: ReadonlyRecord<Role, ActorContext>,
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        _previous?: TestContext
                    ) {
                        return FX.succeed({
                            actors,
                            count: 10
                        })
                    }
                }

                const scene = new MockScene(eventStore)

                const buildContext = vi.spyOn(scene, "buildContext")
                const doRun = vi.spyOn(scene, "doRun")

                yield* pipe(
                    scene.run({
                        actors: {
                            [TestRoles.Thane]: PlayerId,
                            [TestRoles.Housecarl]: pipe(
                                mockActors.Lydia,
                                getActorId
                            )
                        }
                    })
                )

                expect(buildContext).toHaveBeenCalledWith(
                    expect.anything(),
                    undefined
                )

                expect(doRun).toHaveBeenCalledWith(
                    expect.anything(),
                    expect.objectContaining({count: 10}),
                    1
                )
            })
        )

        it.scoped(
            "should be called before each turn with the previous context",
            () =>
                FX.gen(function* () {
                    const eventStore = yield* createInMemoryEventStore()

                    const scene = new TestScene(eventStore, 3)

                    const buildContext = vi.spyOn(scene, "buildContext")

                    yield* pipe(
                        scene.run({
                            actors: {
                                [TestRoles.Thane]: PlayerId,
                                [TestRoles.Housecarl]: pipe(
                                    mockActors.Lydia,
                                    getActorId
                                )
                            }
                        })
                    )

                    expect(buildContext).toHaveBeenNthCalledWith(
                        2,
                        expect.anything(),
                        expect.objectContaining({count: 1})
                    )

                    expect(buildContext).toHaveBeenNthCalledWith(
                        3,
                        expect.anything(),
                        expect.objectContaining({count: 2})
                    )
                })
        )
    })

    describe("beforeStart", () => {
        it.scoped("should be called once before invoking doRun", () =>
            FX.gen(function* () {
                const eventStore = yield* createInMemoryEventStore()

                const scene = new TestScene(eventStore)

                const beforeStart = vi.spyOn(scene, "beforeStart")
                const doRun = vi.spyOn(scene, "doRun")

                yield* pipe(
                    scene.run({
                        actors: {
                            [TestRoles.Thane]: PlayerId,
                            [TestRoles.Housecarl]: pipe(
                                mockActors.Lydia,
                                getActorId
                            )
                        }
                    }),
                    FX.either
                )

                expect(beforeStart).toHaveBeenCalledOnce()
                expect(beforeStart).toHaveBeenCalledBefore(doRun)
            })
        )
    })

    describe("beforeStart", () => {
        it.scoped("should be called once before invoking doRun", () =>
            FX.gen(function* () {
                const eventStore = yield* createInMemoryEventStore()

                const scene = new TestScene(eventStore)

                const beforeStart = vi.spyOn(scene, "beforeStart")
                const doRun = vi.spyOn(scene, "doRun")

                yield* pipe(
                    scene.run({
                        actors: {
                            [TestRoles.Thane]: PlayerId,
                            [TestRoles.Housecarl]: pipe(
                                mockActors.Lydia,
                                getActorId
                            )
                        }
                    }),
                    FX.either
                )

                expect(beforeStart).toHaveBeenCalledOnce()
                expect(beforeStart).toHaveBeenCalledBefore(doRun)
            })
        )
    })

    describe("afterEnd", () => {
        it.scoped("should be called once after invoking doRun", () =>
            FX.gen(function* () {
                const eventStore = yield* createInMemoryEventStore()

                const scene = new TestScene(eventStore)

                const afterEnd = vi.spyOn(scene, "afterEnd")
                const doRun = vi.spyOn(scene, "doRun")

                yield* pipe(
                    scene.run({
                        actors: {
                            [TestRoles.Thane]: PlayerId,
                            [TestRoles.Housecarl]: pipe(
                                mockActors.Lydia,
                                getActorId
                            )
                        }
                    }),
                    FX.either
                )

                expect(afterEnd).toHaveBeenCalledOnce()
                expect(afterEnd).toHaveBeenCalledAfter(doRun)
            })
        )
    })
})

describe("runScene", () => {
    it.scoped("should parse arguments and run the scene with them", () =>
        FX.gen(function* () {
            const eventStore = yield* createInMemoryEventStore()

            // Create a scene with spies on parseArgs and run methods
            class SpyScene extends AbstractScene<
                SceneArguments,
                GameEvent,
                ActorContext,
                SceneContext
            > {
                constructor() {
                    super(
                        "test" as SceneId,
                        [Role.make("role1"), Role.make("role2")],
                        actorContextBuilder,
                        eventStore,
                        defaultScheduler
                    )
                }

                override parseArgs = vi.fn().mockImplementation(FX.succeed)

                override run = vi
                    .fn()
                    .mockImplementation(() => FX.succeed(O.none()))

                override doRun(_args: SceneArguments, context: SceneContext) {
                    return FX.succeed({
                        context,
                        transition: "end" as SceneTransition
                    })
                }

                override buildContext(
                    actors: ReadonlyRecord<Role, ActorContext>
                ) {
                    return FX.succeed({actors})
                }
            }

            const scene = new SpyScene()

            const args = {
                actors: {
                    [Role.make("role1")]: PlayerId,
                    [Role.make("role2")]: pipe(mockActors.Lydia, getActorId)
                }
            }

            yield* runScene(scene, args)

            expect(scene.parseArgs).toHaveBeenCalledWith(args)
            expect(scene.run).toHaveBeenCalledOnce()
        })
    )

    it.scoped("should propagate parsing errors", () =>
        FX.gen(function* () {
            const eventStore = yield* createInMemoryEventStore()

            class ErrorScene extends AbstractScene<
                SceneArguments,
                GameEvent,
                ActorContext,
                SceneContext
            > {
                constructor() {
                    super(
                        "test" as SceneId,
                        [Role.make("role1")],
                        actorContextBuilder,
                        eventStore,
                        defaultScheduler
                    )
                }

                override parseArgs = () =>
                    FX.fail(
                        new InvalidDataError({
                            message: "Invalid scene arguments"
                        })
                    )

                override run = vi.fn()

                override doRun(_args: SceneArguments, context: SceneContext) {
                    return FX.succeed({
                        context,
                        transition: "end" as SceneTransition
                    })
                }

                override buildContext(
                    actors: ReadonlyRecord<Role, ActorContext>
                ) {
                    return FX.succeed({actors})
                }
            }

            const scene = new ErrorScene()
            const args = {actors: {}}

            const result = yield* pipe(runScene(scene, args), FX.either)

            expect(result).toSatisfy(E.isLeft)

            const error = yield* pipe(result, E.getLeft)

            expect(error._tag).toBe("InvalidDataError")
            expect(error.message).toBe("Invalid scene arguments")
            expect(scene.run).not.toHaveBeenCalled()
        })
    )

    it.scoped("should propagate scene requirement errors", () =>
        FX.gen(function* () {
            const eventStore = yield* createInMemoryEventStore()

            class RequirementErrorScene extends AbstractScene<
                SceneArguments,
                GameEvent,
                ActorContext,
                SceneContext
            > {
                constructor() {
                    super(
                        "test" as SceneId,
                        [Role.make("role1")],
                        actorContextBuilder,
                        eventStore,
                        defaultScheduler
                    )
                }

                override parseArgs = FX.succeed

                override run = () =>
                    FX.fail(
                        new SceneRequirementError({
                            message: "Scene requirement not met"
                        })
                    )

                override doRun(_args: SceneArguments, context: SceneContext) {
                    return FX.succeed({
                        context,
                        transition: "end" as SceneTransition
                    })
                }

                override buildContext(
                    actors: ReadonlyRecord<Role, ActorContext>
                ) {
                    return FX.succeed({actors})
                }
            }

            const scene = new RequirementErrorScene()
            const args = {actors: {}}

            const result = yield* pipe(runScene(scene, args), FX.either)

            expect(result).toSatisfy(E.isLeft)

            const error = yield* pipe(result, E.getLeft)

            expect(error._tag).toBe("SceneRequirementError")
            expect(error.message).toBe("Scene requirement not met")
        })
    )

    it.scoped(
        "should return the scene request when scene transitions to another scene",
        () =>
            FX.gen(function* () {
                const eventStore = yield* createInMemoryEventStore()

                class TransitionScene extends AbstractScene<
                    SceneArguments,
                    GameEvent,
                    ActorContext,
                    SceneContext
                > {
                    constructor() {
                        super(
                            "test" as SceneId,
                            [Role.make("role1")],
                            actorContextBuilder,
                            eventStore,
                            defaultScheduler
                        )
                    }

                    override parseArgs = FX.succeed

                    override run = () =>
                        FX.succeed(
                            O.some({
                                id: "nextScene" as SceneId,
                                args: {
                                    actors: {
                                        [Role.make("nextRole")]: PlayerId
                                    }
                                }
                            })
                        )

                    override doRun(
                        _args: SceneArguments,
                        context: SceneContext
                    ) {
                        return FX.succeed({
                            context,
                            transition: "end" as SceneTransition
                        })
                    }

                    override buildContext(
                        actors: ReadonlyRecord<Role, ActorContext>
                    ) {
                        return FX.succeed({actors})
                    }
                }

                const scene = new TransitionScene()
                const args = {actors: {}}

                const result = yield* runScene(scene, args)

                expect(result).toSatisfy(O.isSome)

                const request = O.getOrThrow(result)

                expect(request.id).toBe("nextScene")
                expect(request.args.actors).toHaveProperty(
                    Role.make("nextRole")
                )
            })
    )
})
