import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
    plugins: [react()],
    base: command === "build" ? "/static/" : "/",
    build: {
        outDir: "../server/app/static",
        emptyOutDir: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    three: ["three", "@react-three/fiber", "@react-three/drei"],
                },
            },
        },
    },
    server: {
        headers: {
            // Allow Google Sign-In popup to postMessage back to this page
            "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
        },
        proxy: {
            "/ws": {
                target: "http://localhost:8000",
                ws: true,
            },
            "/api": {
                target: "http://localhost:8000",
            },
        },
    },
}));
