import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {pipe} from "effect"
import {ContextBuilder} from "../../src/llm/Context"

type User = {
    name: string
}

const user = {
    name: "Anna"
}

describe("ContextBuilder", () => {
    describe("merge", () => {
        it.effect(
            "should merge the given context builders into a single builder",
            () =>
                FX.gen(function* () {
                    const name: ContextBuilder<User> = c => FX.succeed(c)
                    const age: ContextBuilder<User> = _c =>
                        FX.succeed({age: 42})

                    const builder = ContextBuilder.merge(name, age)

                    const context = yield* builder(user)

                    expect(context).toHaveProperty("name", "Anna")
                    expect(context).toHaveProperty("age", 42)
                })
        )
    })

    describe("union", () => {
        it.effect(
            "should return a context builder that creates a nested context from the given context builders",
            () =>
                FX.gen(function* () {
                    const name: ContextBuilder<User> = c => FX.succeed(c)

                    const lower: ContextBuilder<User> = c =>
                        FX.succeed({
                            name: c.name.toLowerCase()
                        })

                    const upper: ContextBuilder<User> = c =>
                        FX.succeed({
                            name: c.name.toUpperCase()
                        })

                    const builder = pipe(
                        name,
                        ContextBuilder.append({lower, upper})
                    )

                    const context = yield* builder(user)

                    expect(context).toHaveProperty("name", "Anna")
                    expect(context).toHaveProperty("lower", {name: "anna"})
                    expect(context).toHaveProperty("upper", {name: "ANNA"})
                })
        )
    })

    describe("append", () => {
        it.effect(
            "should add given context builders to the parent as nested contexts",
            () =>
                FX.gen(function* () {
                    const lower: ContextBuilder<User> = c =>
                        FX.succeed({
                            name: c.name.toLowerCase()
                        })

                    const upper: ContextBuilder<User> = c =>
                        FX.succeed({
                            name: c.name.toUpperCase()
                        })

                    const builder = pipe(
                        ContextBuilder.union({
                            lower,
                            upper
                        })
                    )

                    const context = yield* builder(user)

                    expect(context).toHaveProperty("lower", {name: "anna"})
                    expect(context).toHaveProperty("upper", {name: "ANNA"})
                })
        )
    })
})
