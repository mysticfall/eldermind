import {defineConfig} from "vite"
import path from "path"
import tsconfigPaths from "vite-tsconfig-paths"
import {globSync} from "glob"
import {fileURLToPath} from "node:url"
import nodeExternals from "rollup-plugin-node-externals"
import externalGlobals from "rollup-plugin-external-globals"
import nodeResolve from "@rollup/plugin-node-resolve"

export default defineConfig(({mode}) => {
    const isDebug = mode === "development"

    return {
        plugins: [
            tsconfigPaths(),
            nodeExternals({
                deps: false,
                peerDeps: true
            }),
            externalGlobals({
                skyrimPlatform: "skyrimPlatform"
            })
        ],
        build: {
            rollupOptions: {
                input: Object.fromEntries(
                    globSync("src/**/*.ts").map(file => [
                        path.relative(
                            "src",
                            file.slice(
                                0,
                                file.length - path.extname(file).length
                            )
                        ),
                        fileURLToPath(new URL(file, import.meta.url))
                    ])
                ),
                output: [
                    {
                        entryFileNames: "[name].js",
                        chunkFileNames: "[name]-[hash].js",
                        format: "esm",
                        dir: "dist/esm"
                    },
                    {
                        entryFileNames: "[name].js",
                        chunkFileNames: "[name]-[hash].js",
                        format: "cjs",
                        dir: "dist/cjs"
                    }
                ],
                preserveEntrySignatures: "allow-extension",
                plugins: [nodeResolve()]
            },
            minify: !isDebug,
            sourcemap: isDebug,
            target: "esnext"
        },
        test: {
            include: ["./test/**/*.test.ts"],
            setupFiles: "./test/setup.ts",
            coverage: {
                provider: "v8",
                reporter: ["json-summary", "html"],
                exclude: [
                    "docs",
                    "coverage",
                    "dist",
                    "test",
                    "**/index.ts",
                    "*.config.js",
                    "*.config.mjs"
                ]
            }
        }
    }
})
