import {afterEach, beforeEach, describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {pipe} from "effect"
import {
    asErrorLike,
    ErrorLike,
    getErrorChain,
    getErrorMessage,
    isErrorLike,
    prettyPrintError,
    withLogging
} from "../../src/common/Error"
import {Debug} from "@skyrim-platform/skyrim-platform"

declare global {
    // noinspection ES6ConvertVarToLetConst
    var skyrimPlatform:
        | typeof import("@skyrim-platform/skyrim-platform")
        | undefined
}

//@ts-expect-error Vitest dynamic import mock overload
vi.mock(import("@skyrim-platform/skyrim-platform"), async importOriginal => {
    const mod = await importOriginal()

    return {
        ...mod,
        Debug: {
            messageBox: vi.fn(),
            notification: vi.fn(),
            trace: vi.fn(),
            traceStack: vi.fn()
        },
        printConsole: vi.fn()
    }
})

describe("isErrorLike", () => {
    it("should return true for objects with _tag, message and optional cause", () => {
        const validError = {
            _tag: "SomeError",
            message: "Error message"
        }

        expect(isErrorLike(validError)).toBe(true)
    })

    it("should return true for objects with cause", () => {
        const validError = {
            _tag: "SomeError",
            message: "Error message",
            cause: new Error("Root cause")
        }

        expect(isErrorLike(validError)).toBe(true)
    })

    it("should return false for non-objects", () => {
        expect(isErrorLike(null)).toBe(false)
        expect(isErrorLike(undefined)).toBe(false)
        expect(isErrorLike("string error")).toBe(false)
        expect(isErrorLike(123)).toBe(false)
    })

    it("should return false for objects missing required properties", () => {
        expect(isErrorLike({message: "Message only"})).toBe(false)
        expect(isErrorLike({_tag: "TagOnly"})).toBe(false)
        expect(isErrorLike({_tag: 123, message: "Invalid tag type"})).toBe(
            false
        )
        expect(isErrorLike({_tag: "ValidTag", message: 123})).toBe(false)
    })

    it("should return false when cause is null", () => {
        expect(
            isErrorLike({
                _tag: "Error",
                message: "Message",
                cause: null
            })
        ).toBe(false)
    })
})

describe("getErrorMessage", () => {
    it("should return the string as is for string errors", () => {
        expect(getErrorMessage("String error")).toBe("String error")
    })

    it("should extract message from objects with message property", () => {
        const error = {message: "Error message"}
        expect(getErrorMessage(error)).toBe("Error message")
    })

    it("should convert non-string messages to strings", () => {
        expect(getErrorMessage({message: 123})).toBe("123")
        expect(getErrorMessage({message: true})).toBe("true")
        expect(getErrorMessage({message: null})).toBe("null")
        expect(getErrorMessage({message: undefined})).toBe("undefined")
    })

    it("should stringify objects without message property", () => {
        const obj = {code: 404, name: "NotFound"}
        expect(getErrorMessage(obj)).toBe(JSON.stringify(obj))
    })

    it("should stringify empty objects", () => {
        expect(getErrorMessage({})).toBe("{}")
    })

    it("should convert primitives to string", () => {
        expect(getErrorMessage(123)).toBe("123")
        expect(getErrorMessage(null)).toBe("null")
        expect(getErrorMessage(undefined)).toBe("undefined")
        expect(getErrorMessage(true)).toBe("true")
    })

    it("should handle Error objects", () => {
        const nativeError = new Error("Native error")
        expect(getErrorMessage(nativeError)).toBe("Native error")
    })

    it("should handle objects with an empty message", () => {
        expect(getErrorMessage({message: ""})).toBe("")
    })

    it("should handle complex nested objects", () => {
        const complexObj = {
            user: {
                id: 1,
                name: "User"
            },
            errors: ["error1", "error2"]
        }

        expect(getErrorMessage(complexObj)).toBe(JSON.stringify(complexObj))
    })
})

describe("asErrorLike", () => {
    it("should return ErrorLike objects unchanged", () => {
        const errorLike = {
            _tag: "TestError",
            message: "Test message"
        }

        expect(asErrorLike(errorLike)).toBe(errorLike)
    })

    it("should wrap non-ErrorLike objects as UnknownError", () => {
        const result = asErrorLike("string error")

        expect(result._tag).toBe("UnknownError")
        expect(result.message).toBe("string error")
    })

    it("should wrap native Error objects", () => {
        const nativeError = new Error("Native error")
        const result = asErrorLike(nativeError)

        expect(result._tag).toBe("UnknownError")
        expect(result.message).toBe(nativeError.toString())
    })

    it("should convert primitive values to string in UnknownError", () => {
        expect(asErrorLike(123).message).toBe("123")
        expect(asErrorLike(null).message).toBe("null")
        expect(asErrorLike(undefined).message).toBe("undefined")
    })
})

describe("getErrorChain", () => {
    it("should return a single-element array for errors without cause", () => {
        const error = {_tag: "TestError", message: "Test error"}
        const chain = getErrorChain(error)

        expect(chain.length).toBe(1)
        expect(chain[0]).toBe(error)
    })

    it("should extract the full cause chain", () => {
        const rootCause = {_tag: "RootError", message: "Root cause"}
        const midCause = {
            _tag: "MidError",
            message: "Mid cause",
            cause: rootCause
        }
        const topError = {
            _tag: "TopError",
            message: "Top error",
            cause: midCause
        }

        const chain = getErrorChain(topError)

        expect(chain.length).toBe(3)
        expect(chain[0]).toBe(topError)
        expect(chain[1]).toBe(midCause)
        expect(chain[2]).toBe(rootCause)
    })

    it("should handle non-ErrorLike values in the chain", () => {
        const rootCause = "string cause"
        const topError = {
            _tag: "TopError",
            message: "Top error",
            cause: rootCause
        }

        const chain = getErrorChain(topError)

        expect(chain.length).toBe(2)
        expect(chain[0]).toBe(topError)
        expect(chain[1]._tag).toBe("UnknownError")
        expect(chain[1].message).toBe("string cause")
    })
})

describe("prettyPrintError", () => {
    it("should format a single error", () => {
        const error = {_tag: "TestError", message: "Test error"}
        const formatted = prettyPrintError(error)

        expect(formatted).toBe("TestError: Test error")
    })

    it("should format an error chain with proper indentation", () => {
        const rootCause = {_tag: "RootError", message: "Root cause"}
        const midCause = {
            _tag: "MidError",
            message: "Mid-cause",
            cause: rootCause
        }
        const topError = {
            _tag: "TopError",
            message: "Top error",
            cause: midCause
        }

        const formatted = prettyPrintError(topError)

        // Check the expected format with indentation
        expect(formatted).toBe(
            "TopError: Top error\n" +
                "  MidError: Mid-cause\n" +
                "    RootError: Root cause"
        )
    })

    it("should handle non-ErrorLike values", () => {
        const formatted = prettyPrintError("string error")

        expect(formatted).toBe("UnknownError: string error")
    })

    it("should handle mixed ErrorLike and non-ErrorLike values in chain", () => {
        const rootCause = "string cause"
        const topError = {
            _tag: "TopError",
            message: "Top error",
            cause: rootCause
        }

        const formatted = prettyPrintError(topError)

        expect(formatted).toBe(
            "TopError: Top error\n" + "  UnknownError: string cause"
        )
    })
})

describe("withLogging", async () => {
    beforeEach(async () => {
        vi.clearAllMocks()

        global.skyrimPlatform = await import("@skyrim-platform/skyrim-platform")
    })

    afterEach(() => {
        delete global.skyrimPlatform
    })

    it.effect("should show in-game notification and log error details", () =>
        FX.gen(function* () {
            const error: ErrorLike = {
                _tag: "TestError",
                message: "Test error message"
            }

            const notification = vi.spyOn(Debug, "notification")
            const trace = vi.spyOn(Debug, "trace")

            yield* pipe(
                error,
                FX.fail,
                withLogging(),
                FX.catchAll(() => FX.void)
            )

            expect(notification).toHaveBeenCalledExactlyOnceWith(
                "Eldermind: Test error message"
            )

            expect(trace).toHaveBeenCalledExactlyOnceWith(
                "[ELM][ERROR]: TestError: Test error message",
                2
            )
        })
    )

    it.effect("should handle non-ErrorLike errors in notification", () =>
        FX.gen(function* () {
            const error = "Plain string error"

            const notification = vi.spyOn(Debug, "notification")
            const trace = vi.spyOn(Debug, "trace")

            yield* pipe(
                error,
                FX.fail,
                withLogging(),
                FX.catchAll(() => FX.void)
            )

            expect(notification).toHaveBeenCalledExactlyOnceWith(
                "Eldermind: Unknown error occurred. See log for details."
            )

            expect(trace).toHaveBeenCalledExactlyOnceWith(
                "[ELM][ERROR]: UnknownError: Plain string error",
                2
            )
        })
    )

    it.effect("should handle defects with message box and stack trace", () =>
        FX.gen(function* () {
            const defectError = new Error("Fatal defect error")

            defectError.stack = "Error stack trace"

            const messageBox = vi.spyOn(Debug, "messageBox")
            const traceStack = vi.spyOn(Debug, "traceStack")
            const trace = vi.spyOn(Debug, "trace")

            yield* pipe(
                FX.die(defectError),
                withLogging(),
                FX.catchAllDefect(() => FX.void)
            )

            expect(messageBox).toHaveBeenCalledExactlyOnceWith(
                "A fatal error occurred. Eldermind will terminate: Fatal defect error"
            )

            expect(traceStack).toHaveBeenCalledExactlyOnceWith(
                "Error stack trace",
                2
            )

            expect(trace).toHaveBeenCalledExactlyOnceWith(
                "[ELM][FATAL]: UnknownError: Error: Fatal defect error",
                2
            )
        })
    )

    it.effect("should handle defects without stack trace", () =>
        FX.gen(function* () {
            const defectError = {
                _tag: "FatalError",
                message: "Fatal error without stack"
            }

            const messageBox = vi.spyOn(Debug, "messageBox")
            const traceStack = vi.spyOn(Debug, "traceStack")
            const trace = vi.spyOn(Debug, "trace")

            yield* pipe(
                FX.die(defectError),
                withLogging(),
                FX.catchAllDefect(() => FX.void)
            )

            expect(messageBox).toHaveBeenCalledExactlyOnceWith(
                "A fatal error occurred. Eldermind will terminate: Fatal error without stack"
            )

            expect(traceStack).not.toHaveBeenCalled()

            expect(trace).toHaveBeenCalledExactlyOnceWith(
                "[ELM][FATAL]: FatalError: Fatal error without stack",
                2
            )
        })
    )

    it.effect("should handle defects that are not ErrorLike", () =>
        FX.gen(function* () {
            const defectError = "String defect error"

            const messageBox = vi.spyOn(Debug, "messageBox")
            const trace = vi.spyOn(Debug, "trace")

            yield* pipe(
                FX.die(defectError),
                withLogging(),
                FX.catchAllDefect(() => FX.void)
            )

            expect(messageBox).toHaveBeenCalledExactlyOnceWith(
                "A fatal error occurred. Eldermind will terminate: String defect error"
            )

            expect(trace).toHaveBeenCalledExactlyOnceWith(
                "[ELM][FATAL]: UnknownError: String defect error",
                2
            )
        })
    )

    it.effect("should handle successful operations without logging", () =>
        FX.gen(function* () {
            const notification = vi.spyOn(Debug, "notification")
            const trace = vi.spyOn(Debug, "trace")
            const messageBox = vi.spyOn(Debug, "messageBox")

            const result = yield* pipe(
                FX.succeed("Success result"),
                withLogging()
            )

            expect(result).toBe("Success result")
            expect(notification).not.toHaveBeenCalled()
            expect(trace).not.toHaveBeenCalled()
            expect(messageBox).not.toHaveBeenCalled()
        })
    )

    it.effect("should use custom prefix in logging options", () =>
        FX.gen(function* () {
            const error: ErrorLike = {
                _tag: "CustomError",
                message: "Custom error message"
            }

            const trace = vi.spyOn(Debug, "trace")

            yield* pipe(
                error,
                FX.fail,
                withLogging({prefix: "CUSTOM"}),
                FX.catchAll(() => FX.void)
            )

            expect(trace).toHaveBeenCalledExactlyOnceWith(
                "[CUSTOM][ERROR]: CustomError: Custom error message",
                2
            )
        })
    )

    it.effect("should handle error chains in logging", () =>
        FX.gen(function* () {
            const rootCause: ErrorLike = {
                _tag: "RootError",
                message: "Root cause"
            }

            const error: ErrorLike = {
                _tag: "ChainedError",
                message: "Chained error",
                cause: rootCause
            }

            const notification = vi.spyOn(Debug, "notification")
            const trace = vi.spyOn(Debug, "trace")

            yield* pipe(
                error,
                FX.fail,
                withLogging(),
                FX.catchAll(() => FX.void)
            )

            expect(notification).toHaveBeenCalledExactlyOnceWith(
                "Eldermind: Chained error"
            )

            expect(trace).toHaveBeenCalledExactlyOnceWith(
                "[ELM][ERROR]: ChainedError: Chained error\n  RootError: Root cause",
                2
            )
        })
    )
})
