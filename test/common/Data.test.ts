import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import {
    createTextDataLoader,
    DataIdentifier,
    DataPath,
    makeIdentifier,
    validate
} from "../../src/common/Data"
import * as FX from "effect/Effect"
import * as E from "effect/Either"
import * as O from "effect/Option"
import * as SC from "effect/Schema"
import {pipe} from "effect"
import {causeOption} from "effect/Exit"
import {isFailType} from "effect/Cause"

describe("BaseIdentifier", () => {
    const validIdentifiers = [
        "valid_identifier", // Simple valid snake_case
        "snake_case", // Valid lowercase with underscore
        "snake_case_123", // Valid with numbers
        "identifier123", // Contains numbers
        "x", // Single alphabetic character
        "a1", // Letter followed by a number
        "i_am_an_identifier", // Long identifier with underscores
        "example_123_case" // Combination of letters, numbers, and underscores
    ]

    const invalidIdentifiers = [
        "Invalid_Identifier", // Contains uppercase letters
        "123invalid", // Starts with a number
        "snake-case", // Contains a non-underscore symbol (dash)
        "snake case", // Contains spaces
        "_snake_case", // Starts with an underscore
        "snake_case_", // Ends with an underscore
        "snake__case", // Consecutive underscores
        "123", // Only numbers
        "", // Empty string
        " ", // String with only a space
        "__", // Only underscores
        "no-special!chars" // Contains special characters
    ]

    describe("should accept valid identifiers", () => {
        it.each(validIdentifiers)(
            "should validate identifier: '%s'",
            identifier => {
                const result = pipe(
                    identifier,
                    SC.decodeUnknownEither(DataIdentifier)
                )

                expect(result).satisfy(E.isRight) // Result should be a Right (valid)
            }
        )
    })

    describe("should reject invalid identifiers", () => {
        it.each(invalidIdentifiers)(
            "should reject identifier: '%s'",
            identifier => {
                const result = pipe(
                    identifier,
                    SC.decodeUnknownEither(DataIdentifier)
                )

                expect(result).satisfy(E.isLeft) // Result should be a Left (invalid)
            }
        )
    })
})

describe("makeIdentifier", () => {
    const testCases = [
        {input: "Hello World", expected: "hello_world"},
        {input: "Item 1", expected: "item_1"},
        {input: "Already_Snake_Case", expected: "already_snake_case"},
        {
            input: "   Leading and Trailing Spaces   ",
            expected: "leading_and_trailing_spaces"
        },
        {
            input: "Special@Characters#Here!",
            expected: "special_characters_here_"
        },
        {input: "_StartingWithUnderscore", expected: "_startingwithunderscore"},
        {input: "EndsWithSpace ", expected: "endswithspace"},
        {input: "Multiple   Spaces", expected: "multiple_spaces"},
        {input: "Dash-Separated", expected: "dash_separated"},
        {input: "ALLCAPS", expected: "allcaps"}
    ]

    it.each(testCases)(
        "should convert '%s' to snake_case",
        ({input, expected}) => {
            const result = makeIdentifier(input)
            expect(result).toBe(expected)
        }
    )
})

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
        "./folder/file.json" // Relative path starting with `./`, now valid
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
