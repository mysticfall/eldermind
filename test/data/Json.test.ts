import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import * as SC from "effect/Schema"
import * as ST from "effect/String"
import {pipe} from "effect"
import {NodeContext} from "@effect/platform-node"
import {
    createTextFileLoader,
    FilePath,
    FilePathResolver
} from "../../src/data/File"
import {createJsonDataLoader, parseJson} from "../../src/data/Json"
import {DataPath, InvalidDataError} from "../../src/data/Data"

const SampleSchema = SC.Struct({
    name: SC.String,
    age: SC.Number
}).annotations({
    description: "SampleSchema"
})

describe("parseJson", () => {
    it.effect(
        "should parse a text representation of JSON data using the given schema",
        () =>
            FX.gen(function* () {
                const {name, age} = yield* pipe(
                    `{"name": "Anna","age": 42}`,
                    parseJson(SampleSchema)
                )

                expect(name).toBe("Anna")
                expect(age).toBe(42)
            })
    )

    it.effect(
        "should return an InvalidDataError for invalid JSON structure",
        () =>
            FX.gen(function* () {
                const error = yield* pipe(
                    `{"name": "Anna","age": 42`,
                    parseJson(SampleSchema),
                    FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                        FX.succeed(e.message)
                    )
                )

                expect(error).satisfy(
                    ST.startsWith(
                        "Expected ',' or '}' after property value in JSON"
                    )
                )
            })
    )

    it.scoped(
        "should return an InvalidDataError for JSON that doesn't match the schema",
        () =>
            pipe(
                FX.gen(function* () {
                    const error = yield* pipe(
                        `{"name": "Anna"}`,
                        parseJson(SampleSchema),
                        FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                            FX.succeed(e.message)
                        )
                    )

                    expect(error).toMatch(
                        `SampleSchema
└─ ["age"]
   └─ is missing`
                    )
                }),
                FX.provide(NodeContext.layer)
            )
    )
})

describe("createJsonDataLoader", () => {
    const resolver: FilePathResolver = (path: DataPath) =>
        FX.succeed(FilePath.make(`test/data/fixtures/${path}`))

    it.scoped(
        "should create a DataLoader instance that loads JSON data conforming to the given schema",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(
                        resolver,
                        createTextFileLoader,
                        FX.map(createJsonDataLoader(SampleSchema))
                    )

                    const {name, age} = yield* pipe(
                        "valid.json",
                        DataPath.make,
                        load
                    )

                    expect(name).toBe("Anna")
                    expect(age).toBe(42)
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should create a DataLoader that returns an InvalidDataError for invalid JSON structure",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(
                        resolver,
                        createTextFileLoader,
                        FX.map(createJsonDataLoader(SampleSchema))
                    )

                    const error = yield* pipe(
                        "invalid_structure.json",
                        DataPath.make,
                        load,
                        FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                            FX.succeed(e.message)
                        )
                    )

                    expect(error).satisfy(
                        ST.startsWith(
                            "Expected ',' or '}' after property value in JSON"
                        )
                    )
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should create a DataLoader that returns an InvalidDataError for JSON that doesn't match the schema",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(
                        resolver,
                        createTextFileLoader,
                        FX.map(createJsonDataLoader(SampleSchema))
                    )

                    const error = yield* pipe(
                        "invalid_schema.json",
                        DataPath.make,
                        load,
                        FX.catchTag("InvalidDataError", (e: InvalidDataError) =>
                            FX.succeed(e.message)
                        )
                    )

                    expect(error).toMatch(
                        `SampleSchema
└─ ["age"]
   └─ is missing`
                    )
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should create a DataLoader that returns a SystemError for a non-existent JSON file",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(
                        resolver,
                        createTextFileLoader,
                        FX.map(createJsonDataLoader(SampleSchema))
                    )

                    const error = yield* pipe(
                        "non_existent.json",
                        DataPath.make,
                        load,
                        FX.catchTag("SystemError", e => FX.succeed(e.reason))
                    )

                    expect(error).toBe("NotFound")
                }),
                FX.provide(NodeContext.layer)
            )
    )
})
