import {afterEach, describe, expect, vi} from "vitest"
import {it} from "@effect/vitest"
import * as os from "node:os"
import path from "node:path"
import {
    createFaceFXWrapperCommand,
    createFaceFXWrapperConfig,
    createLipSyncGenerator,
    LipSyncCommandCreator
} from "../../src/speech/LipSync"
import {Chunk, pipe, Queue, Sink} from "effect"
import * as FX from "effect/Effect"
import * as A from "effect/Array"
import * as O from "effect/Option"
import {some} from "effect/Option"
import {Command} from "@effect/platform"
import * as FS from "@effect/platform/FileSystem"
import {FileSystem} from "@effect/platform/FileSystem"
import * as ST from "effect/Stream"
import {DialogueText} from "../../src/speech/Dialogue"
import {VoiceFile, VoicePathResolver} from "../../src/speech/Voice"
import {FilePath} from "../../src/data/File"
import {CommandExecutor, Process} from "@effect/platform/CommandExecutor"
import {createGamePaths} from "../../src/data/Service"
import {NodePath} from "@effect/platform-node"
import {ActorId} from "skyrim-effect/game/Actor"

vi.mock("node:os", () => ({
    ...vi.importActual("node:os"),
    platform: vi.fn()
}))

describe("createLipSyncGenerator", () => {
    const baseDir = FilePath.make("/home/user/skyrim")

    const gamePaths = createGamePaths({baseDir})

    const mockFileSystem = FS.layerNoop({
        exists: () => FX.succeed(true),
        access: () => FX.void,
        makeDirectory: () => FX.void,
        sink: () => Sink.collectAll()
    })

    const voiceFile = VoiceFile.make("Eldermind_Dialogue_00001827_1")

    const dialogue = DialogueText.make(
        "Let Me Guess, Someone Stole Your Sweetroll?"
    )

    const mockAudio = pipe(
        new TextEncoder().encode(dialogue),
        FX.succeed,
        ST.fromEffect
    )

    const maleElf = ActorId.make(1)
    const femaleNord = ActorId.make(2)

    const voicePathResolver: VoicePathResolver = (speaker, file) => {
        const voiceType =
            speaker == maleElf ? "MaleOldGrumpy" : "FemaleCommoner"

        const prefix = `${baseDir}/Data/Sound/Voice/Eldermind.esp/${voiceType}/${file}`

        return pipe(
            {
                wav: pipe(`${prefix}.wav`, FilePath.make),
                lip: pipe(`${prefix}.lip`, FilePath.make)
            },
            FX.succeed
        )
    }

    const createCommand: LipSyncCommandCreator = (audioFile, lipFile, text) =>
        Command.make(
            "wine",
            "/home/user/LipSync/FaceFXWrapper.exe",
            "Skyrim",
            "USEnglish",
            "/home/user/LipSync/FonixData.cdf",
            audioFile,
            audioFile,
            lipFile,
            text
        )

    const mockCommandExecutor: CommandExecutor = {
        start: () =>
            FX.succeed({
                exitCode: FX.succeed(0),
                stderr: ST.empty
            } as unknown as Process)
    } as unknown as CommandExecutor

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it.scoped("should create the target directory if it does not exist", () => {
        const test = FX.gen(function* () {
            const text = DialogueText.make(
                "Let Me Guess, Someone Stole Your Sweetroll?"
            )

            const generateLipSync = createLipSyncGenerator(
                voicePathResolver,
                createCommand
            )

            const fs = yield* FileSystem
            const makeDirectory = vi.spyOn(fs, "makeDirectory")

            yield* generateLipSync(mockAudio, text, voiceFile, femaleNord)

            expect(makeDirectory).toHaveBeenCalledExactlyOnceWith(
                `${baseDir}/Data/Sound/Voice/Eldermind.esp/FemaleCommoner`,
                {recursive: true}
            )
        })

        return pipe(
            test,
            FX.provide(gamePaths),
            FX.provide(mockFileSystem),
            FX.provide(NodePath.layer),
            FX.provideService(CommandExecutor, mockCommandExecutor)
        )
    })

    it.scoped(
        "should save the given audio data to the target directory",
        () => {
            const test = FX.gen(function* () {
                const text = DialogueText.make(
                    "Let Me Guess, Someone Stole Your Sweetroll?"
                )

                const generateLipSync = createLipSyncGenerator(
                    voicePathResolver,
                    createCommand
                )

                const queue =
                    yield* Queue.unbounded<Uint8Array<ArrayBufferLike>>()

                const fs = yield* FileSystem
                const method = vi
                    .spyOn(fs, "sink")
                    .mockReturnValueOnce(Sink.fromQueue(queue))

                yield* generateLipSync(mockAudio, text, voiceFile, maleElf)

                expect(method).toHaveBeenCalledExactlyOnceWith(
                    `${baseDir}/Data/Sound/Voice/Eldermind.esp/MaleOldGrumpy/${voiceFile}.wav`
                )

                const data = yield* pipe(
                    Queue.takeAll(queue),
                    FX.map(Chunk.toReadonlyArray)
                )

                expect(data).toHaveLength(1)

                const buffer = data[0].buffer as ArrayBuffer

                if (data.length > 0) {
                    const text = new TextDecoder().decode(buffer)

                    expect(text).toBe(dialogue)
                }
            })

            return pipe(
                test,
                FX.provide(gamePaths),
                FX.provide(mockFileSystem),
                FX.provide(NodePath.layer),
                FX.provideService(CommandExecutor, mockCommandExecutor)
            )
        }
    )

    it.scoped("should execute a command to create a lipsync file", () => {
        const test = FX.gen(function* () {
            const generateLipSync = createLipSyncGenerator(
                voicePathResolver,
                createCommand
            )

            const start = vi.spyOn(mockCommandExecutor, "start")

            yield* generateLipSync(mockAudio, dialogue, voiceFile, femaleNord)

            expect(start).toHaveBeenCalledOnce()
            expect(start.mock.lastCall).toHaveLength(1)

            const command = pipe(
                start.mock.lastCall,
                O.fromNullable,
                O.flatMap(A.head),
                O.filter(c => c._tag == "StandardCommand")
            )

            const cmd = pipe(
                command,
                O.map(c => c.command),
                O.getOrUndefined
            )

            expect(cmd).toBe("wine")

            const args = pipe(
                command,
                A.fromOption,
                A.flatMap(c => c.args)
            )

            const voiceDir = `${baseDir}/Data/Sound/Voice/Eldermind.esp/FemaleCommoner`

            expect(args).toEqual([
                "/home/user/LipSync/FaceFXWrapper.exe",
                "Skyrim",
                "USEnglish",
                "/home/user/LipSync/FonixData.cdf",
                `${voiceDir}/${voiceFile}.wav`,
                `${voiceDir}/${voiceFile}.wav`,
                `${voiceDir}/${voiceFile}.lip`,
                "Let Me Guess, Someone Stole Your Sweetroll?"
            ])

            const cwd = pipe(
                command,
                O.map(c => c.cwd),
                O.getOrUndefined
            )

            expect(cwd).toEqual(some(voiceDir))
        })

        return pipe(
            test,
            FX.provide(gamePaths),
            FX.provide(mockFileSystem),
            FX.provide(NodePath.layer),
            FX.provideService(CommandExecutor, mockCommandExecutor)
        )
    })
})

describe("createFaceFXWrapperConfig", () => {
    it("should return a valid config with correct paths on a non-Windows platform", () => {
        vi.mocked(os.platform).mockReturnValue("linux")

        const dir = "/home/user/tools"
        const config = createFaceFXWrapperConfig(dir)

        expect(config.programFile).toBe(path.join(dir, "FaceFXWrapper.exe"))
        expect(config.dataFile).toBe(path.join(dir, "FonixData.cdf"))
        expect(config.useWine).toBe(true)
    })

    it("should return a valid config with correct paths on a Windows platform", () => {
        vi.mocked(os.platform).mockReturnValue("win32")

        const dir = "C:\\tools"
        const config = createFaceFXWrapperConfig(dir)

        expect(config.programFile).toBe(path.join(dir, "FaceFXWrapper.exe"))
        expect(config.dataFile).toBe(path.join(dir, "FonixData.cdf"))
        expect(config.useWine).toBe(false)
    })
})

describe("createFaceFXWrapperCommand", () => {
    it("should generate the correct command and arguments without wine", () => {
        const audioFile = FilePath.make("c:\\voice\\test.wav")
        const lipFile = FilePath.make("c:\\voice\\test.lip")

        const text = DialogueText.make("Never should've come here.")

        const createCommand = pipe(
            {
                programFile: "c:\\tools\\FaceFXWrapper.exe",
                dataFile: "c:\\tools\\FonixData.cdf",
                useWine: false
            },
            createFaceFXWrapperCommand
        )

        const result = createCommand(audioFile, lipFile, text)

        expect(result._tag).toBe("StandardCommand")

        if (result._tag == "StandardCommand") {
            const {command, args} = result

            expect(command).toBe("c:\\tools\\FaceFXWrapper.exe")

            expect(args).toEqual([
                "Skyrim",
                "USEnglish",
                "c:\\tools\\FonixData.cdf",
                audioFile,
                audioFile,
                lipFile,
                text
            ])
        }
    })

    it("should generate the correct command and arguments with wine", () => {
        const audioFile = FilePath.make("/home/user/voice/test2.wav")
        const lipFile = FilePath.make("/home/user/voice/test2.lip")

        const text = DialogueText.make("Never should've come here.")

        const createCommand = pipe(
            {
                programFile: "/home/user/tools/FaceFXWrapper.exe",
                dataFile: "/home/user/tools/FonixData.cdf",
                useWine: true
            },
            createFaceFXWrapperCommand
        )

        const result = createCommand(audioFile, lipFile, text)

        expect(result._tag).toBe("StandardCommand")

        if (result._tag == "StandardCommand") {
            const {command, args} = result

            expect(command).toBe("wine")

            expect(args).toEqual([
                "/home/user/tools/FaceFXWrapper.exe",
                "Skyrim",
                "USEnglish",
                "/home/user/tools/FonixData.cdf",
                audioFile,
                audioFile,
                lipFile,
                text
            ])
        }
    })
})
