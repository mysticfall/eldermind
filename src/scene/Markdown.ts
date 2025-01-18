import {InvalidDataError, makeIdentifier, validate} from "../common/Data"
import * as FX from "effect/Effect"
import * as A from "effect/Array"
import * as E from "effect/Either"
import * as O from "effect/Option"
import {Option} from "effect/Option"
import * as R from "effect/Record"
import * as ST from "effect/String"
import {flow, pipe} from "effect"
import {renderMarkdown} from "../markdown/Renderer"
import {traverseArray} from "../common/Type"
import {MarkdownDataLoader} from "../markdown/Data"
import {Scene, SceneDataLoader, SceneDescription, SceneId} from "./Scene"
import {
    SceneObjectiveExample,
    SceneObjectiveId,
    SceneObjectiveInstruction,
    SceneObjectiveOutcome
} from "./Objective"
import {MarkdownContent, MarkdownDocument} from "../markdown/Parser"
import {RoleDescription, RoleId} from "./Role"

const parseId = (title: Option<string>, metadata: Record<string, string>) =>
    pipe(
        metadata,
        R.get("id"),
        O.filter(ST.isNonEmpty),
        O.orElse(() =>
            pipe(
                title,
                O.filter(ST.isNonEmpty),
                O.map(flow(ST.toLowerCase, ST.replaceAll(" ", "_")))
            )
        ),
        E.fromOption(
            () =>
                new InvalidDataError({
                    message: "The scene data is missing a title."
                })
        ),
        FX.flatMap(validate(SceneId))
    )

const parseOutcome = (children: readonly MarkdownContent[]) =>
    pipe(
        children,
        A.findFirst(c =>
            pipe(
                c.title,
                O.exists(t => t.toLowerCase().includes("outcome"))
            )
        ),
        O.map(c => renderMarkdown([...c.tokens])),
        E.fromOption(
            () =>
                new InvalidDataError({
                    message: "The task is missing expected outcome."
                })
        ),
        FX.flatMap(validate(SceneObjectiveOutcome))
    )

const parseExamples = (children: readonly MarkdownContent[]) =>
    pipe(
        children,
        A.findFirst(c =>
            pipe(
                c.title,
                O.exists(t => t.toLowerCase().includes("example"))
            )
        ),
        A.fromOption,
        A.flatMap(({tokens}) =>
            pipe(
                tokens,
                A.filter(t => t.type == "code"),
                A.map(t =>
                    pipe(
                        [t],
                        renderMarkdown,
                        ST.split("\n"),
                        A.map(ST.trim),
                        A.join("\n")
                    )
                )
            )
        ),
        traverseArray(validate(SceneObjectiveExample))
    )

const parseRoles = (children: readonly MarkdownContent[]) =>
    pipe(
        children,
        A.findFirst(c =>
            pipe(
                c.title,
                O.exists(t => t.toLowerCase() == "roles")
            )
        ),
        A.fromOption,
        A.flatMap(c => c.children),
        traverseArray(({title, tokens}) =>
            pipe(
                FX.Do,
                FX.bind("id", () =>
                    pipe(
                        title,
                        O.map(makeIdentifier),
                        E.fromOption(
                            () =>
                                new InvalidDataError({
                                    message:
                                        "The role section is missing a title."
                                })
                        ),
                        FX.flatMap(validate(RoleId))
                    )
                ),
                FX.bind("name", () => title),
                FX.bind("description", () =>
                    pipe([...tokens], renderMarkdown, validate(RoleDescription))
                )
            )
        ),
        FX.catchTag(
            "NoSuchElementException",
            () =>
                new InvalidDataError({
                    message: "The scene is missing role definitions."
                })
        )
    )

const parseObjectives = (children: readonly MarkdownContent[]) =>
    pipe(
        children,
        A.findFirst(c =>
            pipe(
                c.title,
                O.exists(t => t.toLowerCase() == "tasks")
            )
        ),
        A.fromOption,
        A.flatMap(c => c.children),
        traverseArray(({title, tokens, children}) =>
            pipe(
                FX.Do,
                FX.bind("id", () =>
                    pipe(
                        title,
                        O.map(makeIdentifier),
                        E.fromOption(
                            () =>
                                new InvalidDataError({
                                    message:
                                        "The scene objective is missing a title."
                                })
                        ),
                        FX.flatMap(validate(SceneObjectiveId))
                    )
                ),
                FX.bind("instruction", () =>
                    pipe(
                        [...tokens],
                        renderMarkdown,
                        validate(SceneObjectiveInstruction)
                    )
                ),
                FX.bind("outcome", () => parseOutcome(children)),
                FX.bind("examples", () => parseExamples(children))
            )
        )
    )

const createSceneFromMarkdown = (source: MarkdownDocument) =>
    FX.gen(function* () {
        const {metadata, content} = source

        const {title, tokens, children} = yield* pipe(
            content,
            FX.liftPredicate(
                c => c.length == 1,
                () =>
                    new InvalidDataError({
                        message:
                            "Scene data expects exactly one top-level element."
                    })
            ),
            FX.map(([head]) => head)
        )

        yield* FX.logDebug(
            O.isSome(title)
                ? `Loading a scene from a markdown document: (title: "${title.value}", metadata: ${JSON.stringify(metadata)})`
                : `Loading a scene from an untitled markdown document: (metadata: ${JSON.stringify(metadata)})`
        )

        const id = yield* parseId(title, metadata)

        const description = yield* pipe(
            renderMarkdown([...tokens]),
            validate(SceneDescription)
        )

        const roles = yield* parseRoles(children)
        const objectives = yield* parseObjectives(children)

        const scene = yield* validate(Scene)({
            id,
            description,
            roles,
            objectives
        })

        yield* FX.logTrace(
            `Scene was loaded successfully: \n${JSON.stringify(scene, undefined, 2)}`
        )

        return scene
    })

export function createMarkdownSceneLoader(
    loader: MarkdownDataLoader
): SceneDataLoader {
    return flow(loader, FX.flatMap(createSceneFromMarkdown))
}
