Scriptname ELMALIPlayer extends ReferenceAlias

Event OnPlayerLoadGame()
    ELMQSTMain main = GetOwningQuest() As ELMQSTMain
    main.Initialise()
EndEvent
