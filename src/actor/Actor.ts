import {ActorId} from "skyrim-effect/game/Form"
import {pipe} from "effect"
import * as FX from "effect/Effect"
import * as SC from "effect/Schema"
import {ContextBuilder} from "../common/Data"
import {Actor} from "@skyrim-platform/skyrim-platform"

export const ActorName = pipe(
    SC.String,
    SC.nonEmptyString(),
    SC.brand("ActorName"),
    SC.annotations({
        title: "Actor Name",
        description: "The name of an actor."
    })
)

export type ActorName = typeof ActorName.Type

export const ActorContext = pipe(
    SC.Struct({
        id: ActorId,
        name: ActorName
    }),
    SC.annotations({
        title: "Actor Context",
        description: "Basic information of an actor."
    })
)

export type ActorContext = typeof ActorContext.Type

export const actorContextBuilder: ContextBuilder<Actor, ActorContext> = (
    context: Actor
) =>
    FX.succeed({
        id: ActorId.make(context.getFormID()),
        name: ActorName.make(context.getName())
    })
