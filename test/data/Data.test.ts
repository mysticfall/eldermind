import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import {createTextDataLoader, DataPath, validate} from "../../src/data/Data"
import * as FX from "effect/Effect"
import * as E from "effect/Either"
import * as O from "effect/Option"
import * as SC from "effect/Schema"
import {pipe} from "effect"
import {causeOption} from "effect/Exit"
import {isFailType} from "effect/Cause"

describe("DataPath", () => {
    const validPaths = [
        "data/scene/common.txt", // Valid nested path
        "data/file.json", // Valid single nested path
        "folder/file", // Simple two-segment path
        "nested/folder/with-dots/file.name", // Nested with dots in filenames
        "unicode/文件/자료.json", // Unicode characters (Chinese, Korean)
        "singlefile.ext", // Valid filename
        "folder.with.dot/file", // Dotted folder name with valid file
        "noextension", // File without an extension
        "nested/path/to/file", // Deeper valid structure
        "relative/../path/to/file.txt", // Relative traversal, now valid
        "./folder/file.json", // Relative path starting with `./`, now valid,
        "Sound/Voice/My Mod.esp/MaleEvenToned/MY_Topic_0000284F_1.wav" // Path with a space or dot in its segments
    ]

    const invalidPaths = [
        "folder//file.txt", // Empty folder segment
        "/absolute/path/file.txt", // Absolute path not allowed
        "folder/invalid|characters?.txt", // Invalid symbols specific to Windows
        'folder/<>:"characters*.txt', // Invalid characters `<`, `>`, `:`, `*`
        "folder/invalid/\\characters.txt", // Backslash `\` (invalid on Unix)
        'folder/invalid"characters.txt', // Invalid quote `"`
        "folder/invalid<name>.txt", // Invalid name with `<>`
        " ", // Path with only spaces, considered invalid
        "", // Empty path
        "folder//nested/file" // Double forward slashes anywhere
    ]

    describe("should accept valid paths", () => {
        it.each(validPaths)("should accept path: '%s'", path => {
            const result = pipe(path, SC.decodeUnknownEither(DataPath))

            expect(result).satisfy(E.isRight)
        })
    })

    describe("should reject invalid paths", () => {
        it.each(invalidPaths)("should reject path: '%s'", path => {
            const result = pipe(path, SC.decodeUnknownEither(DataPath))

            expect(result).satisfy(E.isLeft)
        })
    })
})

describe("createTextDataLoader", () => {
    it.effect(
        "should create a TextDataLoader instance using the given BinaryDataLoader",
        () =>
            pipe(
                FX.gen(function* () {
                    const encoder = new TextEncoder()
                    const decoder = new TextDecoder()

                    const loadBinary = () =>
                        pipe(encoder.encode("Skyrim"), FX.succeed)

                    const load = createTextDataLoader(loadBinary, decoder)
                    const text = yield* load(DataPath.make("test.txt"))

                    expect(text).toBe("Skyrim")
                })
            )
    )

    it.scoped(
        "should create a TextDataLoader that reads a text file with the given decoder",
        () =>
            pipe(
                FX.gen(function* () {
                    const decoder = new TextDecoder("euc-kr")

                    const loadBinary = () =>
                        pipe(
                            new Uint8Array([
                                0xbd, 0xba, 0xc4, 0xab, 0xc0, 0xcc, 0xb8, 0xb2
                            ]),
                            FX.succeed
                        )

                    const load = createTextDataLoader(loadBinary, decoder)
                    const text = yield* load(DataPath.make("test.txt"))

                    expect(text).toBe("스카이림")
                })
            )
    )
})

describe("validate", () => {
    it.effect("should successfully load valid data", () =>
        FX.gen(function* () {
            const schema = SC.String.pipe(SC.parseNumber)
            const result = yield* pipe("39", validate(schema))

            expect(result).toBe(39)
        })
    )

    it.effect(
        "should fail with InvalidDataError when data does not match schema",
        () =>
            FX.gen(function* () {
                const schema = SC.String.pipe(SC.parseNumber)
                const result = yield* pipe("ABC", validate(schema), FX.exit)

                const error = pipe(
                    result,
                    causeOption,
                    O.filter(isFailType),
                    O.map(f => f.error),
                    O.getOrUndefined
                )

                expect(error?._tag).toBe("InvalidDataError")

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect((error?.cause as unknown as any)._tag).toBe("ParseError")

                expect(error?.message).toBe(
                    "(string <-> number)\n" +
                        "└─ Transformation process failure\n" +
                        '   └─ Unable to decode "ABC" into a number'
                )
            })
    )
})
