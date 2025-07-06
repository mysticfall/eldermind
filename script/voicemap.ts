import * as fs from "fs"
import {accessSync} from "fs"
import path from "path"
import * as constants from "constants"

const CONFIG_FILE = process.env.CONFIG_FILE ?? path.resolve("./voicemap.json")
const VOICE_DIR = process.env.VOICE_DIR
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? path.resolve("./output")

;(async () => {
    if (!CONFIG_FILE) {
        console.warn("'CONFIG_FILE' environment variable is not set.")
        process.exit(1)
    }

    if (!VOICE_DIR) {
        console.warn("'VOICE_DIR' environment variable is not set.")
        process.exit(1)
    }

    accessSync(CONFIG_FILE, constants.R_OK)
    accessSync(VOICE_DIR, constants.R_OK)

    fs.mkdirSync(OUTPUT_DIR, {recursive: true})

    const content = fs.readFileSync(CONFIG_FILE)
    const mappings = JSON.parse(content.toString()) as Record<string, string>

    console.info("Copying voice files:")

    const voices: Record<string, unknown> = {}

    Object.keys(mappings).forEach(key => {
        const source = path.resolve(
            VOICE_DIR,
            key.toLowerCase(),
            `${mappings[key]}.wav`
        )

        const target = path.resolve(OUTPUT_DIR, `${key}.wav`)

        console.info(source, " -> ", target)

        voices[key] = {Neutral: key}

        fs.copyFileSync(source, target)
    })

    const config = {
        voices,
        fallback: {
            male: "MaleEvenToned",
            female: "FemaleEvenToned",
            none: "FemaleEvenToned"
        }
    }

    fs.writeFileSync(
        path.resolve(OUTPUT_DIR, "voicemap.json"),
        JSON.stringify(config, null, 2)
    )
})()
