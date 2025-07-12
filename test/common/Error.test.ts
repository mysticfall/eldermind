import {describe, expect, it} from "vitest"
import {
    asErrorLike,
    getErrorChain,
    getErrorMessage,
    isErrorLike,
    prettyPrintError
} from "../../src/common/Error"

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
