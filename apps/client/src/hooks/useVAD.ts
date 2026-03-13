import { useRef, useCallback, useEffect } from "react";
import { MicVAD } from "@ricky0123/vad-web";

// ---------------------------------------------------------------------------
// Configuration — tune these to match your speech detection preferences
// ---------------------------------------------------------------------------
const POSITIVE_SPEECH_THRESHOLD = 0.8;
const NEGATIVE_SPEECH_THRESHOLD = 0.6;
const REDEMPTION_MS = 1200; // ms of silence before firing onSpeechEnd
const MIN_SPEECH_MS = 400; // minimum speech duration to avoid misfires
// ---------------------------------------------------------------------------

interface UseVADOptions {
    /** Called the moment speech is detected. */
    onSpeechStart: () => void;
    /** Called after sustained silence following speech. */
    onSpeechEnd: () => void;
}

/**
 * Hook that runs Silero VAD v5 in the browser using @ricky0123/vad-web.
 *
 * The library bundles its own ONNX runtime, AudioWorklet, and Silero model.
 * We override `getStream` so the VAD taps into the *same* mic MediaStream
 * used by the PCM recorder (no second getUserMedia call).
 *
 * Exposes:
 * - `init(stream)` — attach to an existing mic MediaStream
 * - `destroy()` — tear down
 * - `isSpeaking` ref — current state
 */
export function useVAD({ onSpeechStart, onSpeechEnd }: UseVADOptions) {
    const vadRef = useRef<MicVAD | null>(null);
    const isSpeakingRef = useRef(false);

    // Keep callback refs stable so the VAD callbacks always use latest
    const onSpeechStartRef = useRef(onSpeechStart);
    onSpeechStartRef.current = onSpeechStart;
    const onSpeechEndRef = useRef(onSpeechEnd);
    onSpeechEndRef.current = onSpeechEnd;

    // ---------------------------------------------------------------------------
    // Initialization
    // ---------------------------------------------------------------------------
    const init = useCallback(async (micStream: MediaStream) => {
        if (vadRef.current) return;

        const basePath = import.meta.env.BASE_URL;

        const micVad = await MicVAD.new({
            model: "v5",
            startOnLoad: false,

            // Asset paths — worklet + model served from public/
            baseAssetPath: basePath,
            // ONNX WASM binaries loaded from CDN to avoid Vite intercepting
            // .mjs dynamic imports (Vite treats them as ES modules, breaking ORT)
            onnxWASMBasePath:
                "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/",

            // Reuse the recorder's mic stream instead of calling getUserMedia
            getStream: async () => micStream,
            // Don't stop tracks on pause — the recorder owns the mic
            pauseStream: async () => { },
            // Return same stream on resume — no need to re-acquire
            resumeStream: async () => micStream,

            // Tuning
            positiveSpeechThreshold: POSITIVE_SPEECH_THRESHOLD,
            negativeSpeechThreshold: NEGATIVE_SPEECH_THRESHOLD,
            redemptionMs: REDEMPTION_MS,
            minSpeechMs: MIN_SPEECH_MS,

            // Suppress ONNX runtime noise
            ortConfig: (ort) => {
                ort.env.logLevel = "error";
            },

            // Callbacks
            onSpeechStart: () => {
                isSpeakingRef.current = true;
                onSpeechStartRef.current();
            },
            onSpeechEnd: () => {
                isSpeakingRef.current = false;
                onSpeechEndRef.current();
            },
        });

        await micVad.start();
        vadRef.current = micVad;

        console.log("[VAD] @ricky0123/vad-web v5 initialized");
    }, []);

    // ---------------------------------------------------------------------------
    // Teardown
    // ---------------------------------------------------------------------------
    const destroy = useCallback(() => {
        if (vadRef.current) {
            vadRef.current.destroy();
            vadRef.current = null;
        }
        isSpeakingRef.current = false;
        console.log("[VAD] Destroyed");
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            destroy();
        };
    }, [destroy]);

    return { init, destroy, isSpeaking: isSpeakingRef };
}
