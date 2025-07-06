import {ActorId, ActorName} from "skyrim-effect/game/Actor"
import {pipe} from "effect"
import * as FX from "effect/Effect"
import * as SC from "effect/Schema"
import {ContextBuilder} from "../data/Data"
import {Actor} from "@skyrim-platform/skyrim-platform"

export const ActorContext = pipe(
    SC.Struct({
        id: ActorId,
        name: ActorName
    }),
    SC.annotations({
        title: "Actor Context",
        description: "Basic information of an actor"
    })
)

export type ActorContext = typeof ActorContext.Type

export type ActorContextBuilder<T extends ActorContext> = ContextBuilder<
    Actor,
    T
>

export const actorContextBuilder: ContextBuilder<Actor, ActorContext> = (
    context: Actor
) =>
    FX.succeed({
        id: ActorId.make(context.getFormID()),
        name: ActorName.make(context.getDisplayName())
    })
