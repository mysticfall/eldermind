import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as E from "effect/Either"
import * as SC from "effect/Schema"
import {pipe} from "effect"
import {ModName} from "../../src/game/Game"

describe("ModName", () => {
    const validPaths = [
        "Eldermind.esp",
        "Skyrim.esm",
        "DLC01.esm",
        "MyMod.ESP",
        "Another_Mod.esm",
        "Complex-Mod-Name.esp",
        "Mod With Spaces.esp",
        "123NumericStart.esm",
        "special!@#$%^&*()chars.esp",
        "unicode文字.esm",
        "very_long_mod_name_that_still_should_be_valid.esp",
        "a.esp", // Single character filename
        "MOD.ESM" // All uppercase
    ]

    const invalidPaths = [
        "", // Empty path
        ".esp", // No filename, just extension
        ".esm", // No filename, just extension
        "mod", // No extension
        "mod.txt", // Wrong extension
        "mod.exe", // Wrong extension
        "mod.esp.backup", // Multiple extensions
        "mod.esm.old", // Multiple extensions
        "esp", // Extension without dot
        "esm", // Extension without dot
        "mod.", // Filename with dot but no extension
        "mod.es", // Incomplete extension
        "mod.espx", // Invalid extension
        "mod.esmx", // Invalid extension
        ".esp.esp", // Starting with dot
        ".esm.esm" // Starting with dot
    ]

    describe("should accept valid names", () => {
        it.each(validPaths)("should accept name: '%s'", path => {
            const result = pipe(path, SC.decodeUnknownEither(ModName))

            expect(result).satisfy(E.isRight)
        })
    })

    describe("should reject invalid names", () => {
        it.each(invalidPaths)("should reject name: '%s'", path => {
            const result = pipe(path, SC.decodeUnknownEither(ModName))

            expect(result).satisfy(E.isLeft)
        })
    })
})
