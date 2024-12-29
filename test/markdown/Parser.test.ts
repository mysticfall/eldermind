import * as O from "effect/Option"
import {Tokens} from "marked"
import {describe, expect, it} from "vitest"
import {parseMarkdown} from "../../src/markdown/Parser"

describe("parseMarkdown", () => {
    it("should parse the given markdown text while preserving its hierarchical structure", () => {
        const text = `# Cat

Cats are invasive alien species\n disguising as domestic pets.
Cats often use their meows as a primary method to communicate \nand manipulate humans.

## Appearance

### General features

 * Large eyes.
 * Furry.
 * Pointy ears.
 
### Coat patterns

 * Mackerel
 * Classic
 * Spotted

## Goals

Cats aim to dominate the world.`

        const document = parseMarkdown(text)

        expect(document.content).length(1)

        const root = document.content[0]

        expect(root.title).toEqual(O.some("Cat"))
        expect(root.children).length(2)
        expect(root.tokens).length(2)

        expect(root.tokens[0]).toHaveProperty("type", "paragraph")
        expect(root.tokens[0]).toHaveProperty(
            "text",
            "Cats are invasive alien species\n" +
                " disguising as domestic pets.\n" +
                "Cats often use their meows as a primary method to communicate \n" +
                "and manipulate humans."
        )

        const appearance = root.children[0]

        expect(appearance.title).toEqual(O.some("Appearance"))
        expect(appearance.children).length(2)
        expect(appearance.tokens).toEqual([])

        const generalFeatures = appearance.children[0]

        expect(generalFeatures.title).toEqual(O.some("General features"))
        expect(generalFeatures.children).length(0)
        expect(generalFeatures.tokens).length(2)

        const generalFeaturesList = generalFeatures.tokens[0] as Tokens.List

        expect(generalFeaturesList.items).length(3)
        expect(generalFeaturesList.items[0].text).toBe("Large eyes.")
        expect(generalFeaturesList.items[1].text).toBe("Furry.")
        expect(generalFeaturesList.items[2].text).toBe("Pointy ears.")

        expect(generalFeatures.tokens[1]).toHaveProperty("type", "space")

        const coatPatterns = appearance.children[1]

        expect(coatPatterns.title).toEqual(O.some("Coat patterns"))
        expect(coatPatterns.children).length(0)
        expect(coatPatterns.tokens).length(2)

        const coatPatternsList = coatPatterns.tokens[0] as Tokens.List

        expect(coatPatternsList.items).length(3)
        expect(coatPatternsList.items[0].text).toBe("Mackerel")
        expect(coatPatternsList.items[1].text).toBe("Classic")
        expect(coatPatternsList.items[2].text).toBe("Spotted")

        expect(coatPatterns.tokens[1]).toHaveProperty("type", "space")

        const goals = root.children[1]

        expect(goals.title).toEqual(O.some("Goals"))
        expect(goals.children).length(0)
        expect(goals.tokens).length(1)
        expect(goals.tokens[0]).toHaveProperty("type", "paragraph")
        expect(goals.tokens[0]).toHaveProperty(
            "text",
            "Cats aim to dominate the world."
        )
    })

    it("should return the metadata in the given Markdown text when it's available", () => {
        const text = `---
id: cats
category: species
revision: 3
public: true
---

# Cat

Cats are invasive alien species disguising as domestic pets.`

        const {content, metadata} = parseMarkdown(text)

        expect(metadata["id"]).toBe("cats")
        expect(metadata["category"]).toBe("species")
        expect(metadata["revision"]).toBe(3)
        expect(metadata["public"]).toBe(true)

        expect(content).length(1)
        expect(content[0].title).toEqual(O.some("Cat"))
    })

    it("should ignore white space characters around the content", () => {
        const text = `
        
                
---
id: cats
category: species
revision: 3
public: true
---



# Cat

Cats are invasive alien species disguising as domestic pets.    
        
        
## Goals

Cats aim to dominate the world.
        
`

        const {content, metadata} = parseMarkdown(text)

        expect(metadata["id"]).toBe("cats")
        expect(metadata["category"]).toBe("species")
        expect(metadata["revision"]).toBe(3)
        expect(metadata["public"]).toBe(true)

        expect(content).length(1)
        const root = content[0]

        expect(content[0].title).toEqual(O.some("Cat"))

        expect(root.children).length(1)

        const goals = root.children[0]

        expect(goals.title).toEqual(O.some("Goals"))
        expect(goals.children).length(0)
        expect(goals.tokens).length(1)
        expect(goals.tokens[0]).toHaveProperty(
            "text",
            "Cats aim to dominate the world."
        )
    })

    it("should handle simple content without title", () => {
        const text = "The internet was invented to share cat pictures."

        const {content} = parseMarkdown(text)

        expect(content).length(1)

        expect(content[0].title).satisfy(O.isNone)
        expect(content[0].tokens).length(1)
        expect(content[0].tokens[0]).toHaveProperty("text", text)
    })
})
