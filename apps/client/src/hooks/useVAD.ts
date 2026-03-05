import { useRef, useCallback } from "react";

// @ricky0123/vad-web ships a global "vad" when loaded from CDN,
// but when imported as an npm package the API is different.
// We'll use dynamic import so tree-shaking works.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VadInstance = any;

interface UseVADOptions {
    onSpeechStart: () => void;
    onSpeechEnd: (audio: Float32Array) => void;
}

/**
 * Hook that wraps @ricky0123/vad-web for client-side voice activity detection.
 */
export function useVAD({ onSpeechStart, onSpeechEnd }: UseVADOptions) {
    const vadRef = useRef<VadInstance>(null);

    const onSpeechStartRef = useRef(onSpeechStart);
    onSpeechStartRef.current = onSpeechStart;
    const onSpeechEndRef = useRef(onSpeechEnd);
    onSpeechEndRef.current = onSpeechEnd;

    const init = useCallback(async () => {
        // Dynamic import avoids bundling if SSR or tests are run without browser
        const vadModule = await import("@ricky0123/vad-web");

        const myVad = await vadModule.MicVAD.new({
            onSpeechStart: () => onSpeechStartRef.current(),
            onSpeechEnd: (audio: Float32Array) => onSpeechEndRef.current(audio),

            // Strict thresholds to avoid false positives (matching original)
            positiveSpeechThreshold: 0.9,
            negativeSpeechThreshold: 0.75,
            minSpeechMs: 480,
            redemptionMs: 1152,
            preSpeechPadMs: 288,

            onnxWASMBasePath:
                "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
            baseAssetPath:
                "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/",
        });
        myVad.start();
        vadRef.current = myVad;
    }, []);

    const destroy = useCallback(() => {
        vadRef.current?.destroy?.();
        vadRef.current = null;
    }, []);

    return { init, destroy };
}
