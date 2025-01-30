import {describe, expect} from "vitest"
import {it} from "@effect/vitest"
import * as FX from "effect/Effect"
import {pipe} from "effect"
import {NodeContext} from "@effect/platform-node"
import {createMarkdownSceneLoader} from "../../src/scene/Markdown"
import {createTextFileLoader, FilePathResolver} from "../../src/common/File"
import {createMarkdownLoader} from "../../src/markdown/Data"
import {DataPath} from "../../src/common/Data"

describe("createMarkdownSceneLoader", () => {
    const resolver: FilePathResolver = (path: DataPath) =>
        FX.succeed(`test/scene/fixtures/${path}`)

    it.scoped(
        "should create a SceneDataLoader from the given MarkdownDataLoader",
        () =>
            pipe(
                FX.gen(function* () {
                    const load = yield* pipe(
                        resolver,
                        createTextFileLoader,
                        FX.map(createMarkdownLoader),
                        FX.map(createMarkdownSceneLoader)
                    )

                    const {id, description, roles, objectives} = yield* pipe(
                        "scene.md",
                        DataPath.make,
                        load
                    )

                    expect(id).toBe("confrontation_in_whiterun")

                    // It should preserve placeholders, and ignore line breaks in paragraphs.
                    expect(description).toBe(
                        "In Whiterun's marketplace, the _investigator_ confronts " +
                            "the _suspect_ accused of selling fake goods. " +
                            "The exchange draws attention from nearby townsfolk."
                    )

                    expect(roles).length(2)

                    expect(roles[0].id).toBe("investigator")
                    expect(roles[0].description).toBe(
                        "A figure aiming to uncover the truth " +
                            "behind the alleged sale of fake goods."
                    )

                    expect(roles[1].id).toBe("suspect")
                    expect(roles[1].description).toBe(
                        "An individual accused of dishonesty and attempting to " +
                            "defend themselves or justify their actions."
                    )

                    expect(objectives).length(2)

                    expect(objectives[0].id).toBe("task_1")
                    expect(objectives[0].instruction).toBe(
                        "Confront the _suspect_ about the alleged dishonesty."
                    )
                    expect(objectives[0].checklist).toBe(
                        "Does the _suspect_ either deny or deflect it with an explanation?"
                    )

                    expect(objectives[0].examples).length(1)
                    expect(objectives[0].examples[0]).toBe(
                        "Aela: I've heard you're selling fake goods. Care to explain?\n" +
                            "Balgruuf: Lies! My wares are as true as the Skyforge's steel!\n" +
                            'Aela: Then why do these "fine wares" fall apart so easily?\n' +
                            "Balgruuf: You must be mistaken. Perhaps another merchant deceived you."
                    )

                    expect(objectives[1].id).toBe("task_2")
                    expect(objectives[1].instruction).toBe(
                        "Pressure the _suspect_ to admit their wrongdoing."
                    )
                    expect(objectives[1].checklist).toBe(
                        "Does the _suspect_ either admit to deception or escalate " +
                            "the confrontation by refusing to comply?"
                    )

                    expect(objectives[1].examples).length(2)

                    expect(objectives[1].examples[0]).toBe(
                        "Ralof: Tell the truth, or I'll bring this to the Jarl.\n" +
                            "Olfina: Fine! Maybe I cut corners, but do you know how hard it is to make a living?\n" +
                            "Ralof: No excuses. Fix this, or face the consequences.\n" +
                            "Olfina: I'll do better. Just don’t ruin me, please."
                    )
                    expect(objectives[1].examples[1]).toBe(
                        "Lydia: Stop lying and confess.\n" +
                            "Severio: And if I don’t? Who’ll believe a wanderer over me?\n" +
                            "Lydia: The guards might. Your choice.\n" +
                            "Severio: All right, all right! Just keep your voice down."
                    )
                }),
                FX.provide(NodeContext.layer)
            )
    )
})
