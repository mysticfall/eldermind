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
import * as FX from "effect/Effect"
import {Effect} from "effect/Effect"
import * as A from "effect/Array"
import * as O from "effect/Option"
import * as STR from "effect/String"
import {flow, Logger, LogLevel, pipe} from "effect"
import {Debug} from "@skyrim-platform/skyrim-platform"
import {createLogger, LoggingOptions} from "skyrim-effect/common/Log"
import {notification} from "skyrim-effect/common/Debug"

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
 * A utility type for customising or modifying error objects by omitting the
 * `message` property and allowing partial overriding of the same.
 *
 * This type accepts a generic parameter `T` that extends the base
 * {@link ErrorLike} interface and adjusts its type by removing the `message`
 * property from `T` while making the `message` property an optional field.
 *
 * @template T - A generic type that extends the `ErrorLike` interface.
 *  Defaults to {@link ErrorLike}.
 *
 * @typedef {Omit<T, "message"> & Partial<Pick<T, "message">>} ErrorArgs
 */
export type ErrorArgs<T extends ErrorLike = ErrorLike> = Omit<
    T,
    "_tag" | "message"
> &
    Partial<Pick<T, "message">>

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

export function withLogging(
    options?: LoggingOptions
): <E, R>(process: Effect<void, E, R>) => Effect<void, E, R> {
    const loggingLayer = Logger.replace(
        Logger.defaultLogger,
        createLogger({
            ...options,
            prefix: options?.prefix ?? "ELM",
            minLevels: {
                ...options,
                messageBox: LogLevel.None
            }
        })
    )

    return flow(
        FX.tapError(e =>
            notification(
                `Eldermind: ${
                    isErrorLike(e)
                        ? e.message
                        : "Unknown error occurred. See log for details."
                }`
            )
        ),
        FX.tapError(e => pipe(e, prettyPrintError, FX.logError)),
        FX.catchAllDefect(e => {
            const message = pipe(
                getErrorMessage(e),
                O.liftPredicate(STR.isNonEmpty),
                O.map(m => `: ${m}`),
                O.getOrElse(() => ".")
            )

            Debug.messageBox(
                `A fatal error occurred. Eldermind will terminate${message}`
            )

            if (typeof e === "object" && e !== null && "stack" in e) {
                Debug.traceStack((e as {stack: unknown}).stack as string, 2)
            }

            return pipe(e, prettyPrintError, FX.logFatal)
        }),
        FX.provide(loggingLayer)
    )
}
