import {defineConfig} from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        include: ["./test/**/*.test.ts"],
        setupFiles: "./test/setup.ts",
        coverage: {
            provider: "v8",
            reporter: ["json-summary", "html"],
            exclude: [
                "dist",
                "coverage",
                "docs",
                "node_modules",
                "test",
                "script",
                "**/*/index.ts",
                "*.config.*js"
            ]
        }
    }
})
