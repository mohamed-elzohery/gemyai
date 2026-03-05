import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
    plugins: [react()],
    base: command === "build" ? "/static/" : "/",
    build: {
        outDir: "../server/app/static",
        emptyOutDir: true,
    },
    server: {
        proxy: {
            "/ws": {
                target: "http://localhost:8000",
                ws: true,
            },
        },
    },
}));
