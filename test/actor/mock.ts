import {vi} from "vitest"
import {Actor} from "@skyrim-platform/skyrim-platform"
import {ActorId} from "skyrim-effect/game/Actor"
import {pipe} from "effect"
import * as A from "effect/Array"
import * as O from "effect/Option"
import * as R from "effect/Record"
import * as FX from "effect/Effect"

const Lydia: Actor = {
    getFormID: () => 0x000a2c94,
    getDisplayName: () => "Lydia",
    getLeveledActorBase: () => ({
        getSex: () => 1
    }),
    getVoiceType: () => ({
        getFormID: () => 0x00013add,
        getName: () => "FemaleEvenToned"
    })
} as unknown as Actor

const Ulfric: Actor = {
    getFormID: () => 0x000a2c95,
    getDisplayName: () => "Ulfric",
    getLeveledActorBase: () => ({
        getSex: () => 0
    }),
    getVoiceType: () => ({
        getFormID: () => 0x00013ae6,
        getName: () => "MaleNord"
    })
} as unknown as Actor

export const mockActors = {
    Lydia,
    Ulfric
}

export function installActorMocks() {
    vi.mock(import("skyrim-effect/game/Actor"), async importOriginal => {
        const mod = await importOriginal()

        return {
            ...mod,
            getActor: (id: ActorId) =>
                pipe(
                    mockActors,
                    R.toEntries,
                    A.findFirst(([, a]) => a.getFormID() == id),
                    O.map(([, a]) => a),
                    O.getOrThrow,
                    FX.succeed
                )
        }
    })
}
