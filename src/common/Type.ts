import * as TA from "@effect/typeclass/data/Array"
import * as TR from "@effect/typeclass/data/Record"
import * as TFX from "@effect/typeclass/data/Effect"
import * as TO from "@effect/typeclass/data/Option"

const applicative = TFX.getApplicative()

export const traverseArray = TA.Traversable.traverse(applicative)

export const traverseOption = TO.Traversable.traverse(applicative)

export const traverseRecord = TR.Traversable.traverse(applicative)

export type ConstructorType<T> = T extends new (...args: infer A) => unknown
    ? A
    : never
