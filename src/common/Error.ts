/**
 * @module Error
 *
 * This module provides error handling utilities and types for creating and managing
 * strongly-typed errors in a structured way. It includes:
 *
 * - Factory function for creating tagged error classes
 * - Error-like interface and type guards
 * - Utilities for error message extraction and formatting
 * - Functions for handling error cause chains
 *
 * The module is designed to work with Effect-TS error handling patterns and provides
 * consistent error management across the application.
 */
import * as SC from "effect/Schema"
import * as A from "effect/Array"
import * as O from "effect/Option"
import {pipe} from "effect"

/**
 * Factory function to create a strongly-typed error class with a specific tag.
 *
 * The `BaseError` function generates a tagged error structure using the provided
 * `tag` and optional default values. It incorporates a message and an optional
 * cause, allowing for structured error management in an application.
 *
 * @param tag - The tag to uniquely identify the error type.
 * @param defaults - An optional object containing default values for the error
 *                   properties. If not provided:
 *                   - The default `message` will be set to "Unknown error."
 *                   - `cause` will remain undefined.
 *
 * @returns A tagged error class constructor specific to the error type.
 */
export const BaseError = <TSelf>(tag: string, defaults?: {message?: string}) =>
    SC.TaggedError<TSelf>()(tag, {
        message: SC.optionalWith(SC.String, {
            default: () => defaults?.message ?? "Unknown error."
        }),
        cause: SC.optional(SC.Unknown)
    })

/**
 * Represents an error-like object with standardised properties.
 * This interface provides a common structure for error handling.
 *
 * @property _tag - A string identifier for the error type
 * @property message - A human-readable error message
 * @property cause - Optional underlying cause of the error
 */
export interface ErrorLike {
    readonly _tag: string
    readonly message: string
    readonly cause?: unknown
}

/**
 * Type guard to check if an object is {@link ErrorLike}.
 * Verifies that the object has the required properties with correct types.
 *
 * @param obj - The object to check
 * @returns True if the object matches the ErrorLike interface structure
 */
export function isErrorLike(obj: unknown): obj is ErrorLike {
    if (typeof obj !== "object" || obj === null) return false

    const err = obj as Record<string, unknown>

    return (
        typeof err._tag === "string" &&
        typeof err.message === "string" &&
        (err.cause === undefined || err.cause !== null)
    )
}

/**
 * Gets the message from an error-like object.
 * Handles different error types and formats.
 */
export function getErrorMessage(error: unknown): string {
    if (typeof error === "string") {
        return error
    } else if (
        typeof error === "object" &&
        error !== null &&
        error !== undefined
    ) {
        const err = error as Record<string, unknown>

        if ("message" in err) {
            return String(err.message)
        }

        return JSON.stringify(err)
    }

    return String(error)
}

/**
 * Converts any value into an ErrorLike object.
 * If the input is already ErrorLike, returns it as is.
 * Otherwise, wraps the input in an UnknownError object.
 */
export function asErrorLike(error: unknown): ErrorLike {
    return pipe(
        error,
        O.liftPredicate(isErrorLike),
        O.getOrElse(() => ({
            _tag: "UnknownError",
            message: String(error)
        }))
    )
}

/**
 * Extracts a chain of errors from a given error by traversing the `cause` property.
 * Returns an array containing the original error followed by all errors in the cause chain.
 */
export function getErrorChain(error: unknown): readonly ErrorLike[] {
    const collectCauses = (source: unknown = error): readonly ErrorLike[] => {
        const e = asErrorLike(source)

        return pipe(
            e.cause,
            O.fromNullable,
            A.fromOption,
            A.flatMap(collectCauses),
            A.prepend(e)
        )
    }

    return collectCauses()
}

/**
 * Returns a pretty-printed message from an error, including its cause chain if present.
 * Indents each level of the cause chain for better readability.
 */
export function prettyPrintError(error: unknown): string {
    return pipe(
        error,
        getErrorChain,
        A.map((err, index) => {
            const {message, _tag} = err

            const indent = "  ".repeat(index)
            const tagString = [_tag, ": "].join("")

            return [indent, tagString, message].join("")
        }),
        A.join("\n")
    )
}
