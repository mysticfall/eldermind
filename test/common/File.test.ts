import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {
    createBinaryFileLoader,
    createTextFileLoader,
    FilePathResolver,
    readBinaryFile,
    readTextFile
} from "../../src/common/File"
import {pipe} from "effect"
import {NodeContext} from "@effect/platform-node"
import {DataPath} from "../../src/common/Data"

describe("readTextFile", () => {
    it.scoped(
        "should read a text file from the given path and return its content",
        () =>
            pipe(
                FX.gen(function* () {
                    const text = yield* readTextFile(
                        "test/common/fixtures/utf-8.txt"
                    )

                    expect(text).toBe("Skyrim")
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should read a text file from the given path with the given decoder",
        () =>
            pipe(
                FX.gen(function* () {
                    const text = yield* readTextFile(
                        "test/common/fixtures/euc-kr.txt",
                        new TextDecoder("euc-kr")
                    )

                    expect(text).toBe("스카이림")
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should fail with a SystemError if the file with the given path does not exist",
        () =>
            pipe(
                FX.gen(function* () {
                    const error = yield* pipe(
                        readTextFile("test/fixtures/deleted.txt"),
                        FX.catchTag("SystemError", e => FX.succeed(e.reason))
                    )

                    expect(error).toBe("NotFound")
                }),
                FX.provide(NodeContext.layer)
            )
    )
})

describe("readBinaryFile", () => {
    it.scoped(
        "should read a binary file from the given path and return its content",
        () =>
            pipe(
                FX.gen(function* () {
                    const content = yield* readBinaryFile(
                        "test/common/fixtures/utf-8.txt"
                    )

                    const text = new TextDecoder().decode(content)

                    expect(text).toBe("Skyrim")
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should fail with a SystemError if the file with the given path does not exist",
        () =>
            pipe(
                FX.gen(function* () {
                    const error = yield* pipe(
                        readBinaryFile("test/fixtures/deleted.txt"),
                        FX.catchTag("SystemError", e => FX.succeed(e.reason))
                    )

                    expect(error).toBe("NotFound")
                }),
                FX.provide(NodeContext.layer)
            )
    )
})

const fixturePathResolver: FilePathResolver = (path: DataPath) =>
    FX.succeed(`test/common/fixtures/${path}`)

describe("createTextFileLoader", () => {
    it.scoped(
        "should create a TextDataLoader instance using the given path resolver",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(
                        fixturePathResolver,
                        createTextFileLoader
                    )

                    const text = yield* pipe("utf-8.txt", DataPath.make, load)

                    expect(text).toBe("Skyrim")
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should create a TextDataLoader that reads a text file with the given decoder",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(fixturePathResolver, resolver =>
                        createTextFileLoader(
                            resolver,
                            new TextDecoder("euc-kr")
                        )
                    )

                    const text = yield* pipe("euc-kr.txt", DataPath.make, load)

                    expect(text).toBe("스카이림")
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should create a TextDataLoader that returns a SystemError for a non-existent file",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(
                        fixturePathResolver,
                        createTextFileLoader
                    )

                    const error = yield* pipe(
                        "test/fixtures/deleted.txt",
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

describe("createBinaryFileLoader", () => {
    it.scoped(
        "should create a BinaryDataLoader instance using the given path resolver",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(
                        fixturePathResolver,
                        createTextFileLoader
                    )

                    const text = yield* pipe("utf-8.txt", DataPath.make, load)

                    expect(text).toBe("Skyrim")
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should create a BinaryDataLoader that reads a binary file from the given path",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(fixturePathResolver, resolver =>
                        createBinaryFileLoader(resolver)
                    )

                    const content = yield* pipe(
                        "euc-kr.txt",
                        DataPath.make,
                        load
                    )
                    const text = new TextDecoder("euc-kr").decode(content)

                    expect(text).toBe("스카이림")
                }),
                FX.provide(NodeContext.layer)
            )
    )

    it.scoped(
        "should create a BinaryDataLoader that returns a SystemError for a non-existent file",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(
                        fixturePathResolver,
                        createBinaryFileLoader
                    )

                    const error = yield* pipe(
                        "test/fixtures/deleted.txt",
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
