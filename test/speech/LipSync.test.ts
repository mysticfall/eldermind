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
import {FileSystem} from "@effect/platform/FileSystem"
import * as ST from "effect/Stream"
import {DialogueText} from "../../src/speech/Dialogue"
import {VoicePathResolver} from "../../src/speech/Voice"
import {FilePathResolver} from "../../src/data/File"
import {DataPath} from "../../src/data/Data"
import {CommandExecutor, Process} from "@effect/platform/CommandExecutor"

vi.mock("node:os", () => ({
    ...vi.importActual("node:os"),
    platform: vi.fn()
}))

describe("createLipSyncGenerator", () => {
    const dialogue = DialogueText.make(
        "Let Me Guess, Someone Stole Your Sweetroll?"
    )

    const mockAudio = pipe(
        new TextEncoder().encode(dialogue),
        FX.succeed,
        ST.fromEffect
    )

    const filePathResolver: FilePathResolver = path =>
        FX.succeed(`/home/user/Skyrim/Data/${path}`)

    const voicePathResolver: VoicePathResolver = extension =>
        pipe(
            `Sound/Voice/Eldermind.esp/Dialogue_00001827_1${extension}`,
            DataPath.make,
            FX.succeed
        )

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

    const mockFileSystem: FileSystem = {
        makeDirectory: () => FX.void,
        sink: () => Sink.collectAll()
    } as unknown as FileSystem

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it.scoped("should create the target directory if it does not exist", () =>
        FX.gen(function* () {
            const text = DialogueText.make(
                "Let Me Guess, Someone Stole Your Sweetroll?"
            )

            const generateLipSync = createLipSyncGenerator(
                filePathResolver,
                createCommand
            )

            const makeDirectory = vi.spyOn(mockFileSystem, "makeDirectory")

            yield* pipe(
                generateLipSync(mockAudio, text, voicePathResolver),
                FX.provideService(FileSystem, mockFileSystem),
                FX.provideService(CommandExecutor, mockCommandExecutor)
            )

            expect(makeDirectory).toHaveBeenCalledExactlyOnceWith(
                "/home/user/Skyrim/Data/Sound/Voice/Eldermind.esp",
                {recursive: true}
            )
        })
    )

    it.scoped("should save the given audio data to the target directory", () =>
        FX.gen(function* () {
            const text = DialogueText.make(
                "Let Me Guess, Someone Stole Your Sweetroll?"
            )

            const generateLipSync = createLipSyncGenerator(
                filePathResolver,
                createCommand
            )

            const queue = yield* Queue.unbounded<Uint8Array<ArrayBufferLike>>()

            const method = vi
                .spyOn(mockFileSystem, "sink")
                .mockReturnValueOnce(Sink.fromQueue(queue))

            yield* pipe(
                generateLipSync(mockAudio, text, voicePathResolver),
                FX.provideService(FileSystem, mockFileSystem),
                FX.provideService(CommandExecutor, mockCommandExecutor)
            )

            expect(method).toHaveBeenCalledExactlyOnceWith(
                "/home/user/Skyrim/Data/Sound/Voice/Eldermind.esp/Dialogue_00001827_1.wav"
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
    )

    it.scoped("should execute a command to create a lip sync file", () =>
        FX.gen(function* () {
            const generateLipSync = createLipSyncGenerator(
                filePathResolver,
                createCommand
            )

            const start = vi.spyOn(mockCommandExecutor, "start")

            yield* pipe(
                generateLipSync(mockAudio, dialogue, voicePathResolver),
                FX.provideService(FileSystem, mockFileSystem),
                FX.provideService(CommandExecutor, mockCommandExecutor)
            )

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

            expect(args).toEqual([
                "/home/user/LipSync/FaceFXWrapper.exe",
                "Skyrim",
                "USEnglish",
                "/home/user/LipSync/FonixData.cdf",
                "/home/user/Skyrim/Data/Sound/Voice/Eldermind.esp/Dialogue_00001827_1.wav",
                "/home/user/Skyrim/Data/Sound/Voice/Eldermind.esp/Dialogue_00001827_1.wav",
                "/home/user/Skyrim/Data/Sound/Voice/Eldermind.esp/Dialogue_00001827_1.lip",
                "Let Me Guess, Someone Stole Your Sweetroll?"
            ])

            const cwd = pipe(
                command,
                O.map(c => c.cwd),
                O.getOrUndefined
            )

            expect(cwd).toEqual(
                some("/home/user/Skyrim/Data/Sound/Voice/Eldermind.esp")
            )
        })
    )
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
        const audioFile = "c:\\voice\\test.wav"
        const lipFile = "c:\\voice\\test.lip"

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
        const audioFile = "/home/user/voice/test2.wav"
        const lipFile = "/home/user/voice/test2.lip"

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
