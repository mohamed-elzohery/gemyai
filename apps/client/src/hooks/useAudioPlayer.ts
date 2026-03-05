import { useRef, useCallback } from "react";

/**
 * Hook that wraps the PCM audio player worklet (24 kHz playback).
 */
export function useAudioPlayer() {
    const nodeRef = useRef<AudioWorkletNode | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);

    const init = useCallback(async () => {
        if (ctxRef.current) return; // already initialised

        const audioContext = new AudioContext({ sampleRate: 24000 });
        const workletURL = `${import.meta.env.BASE_URL}pcm-player-processor.js`;
        await audioContext.audioWorklet.addModule(workletURL);
        const node = new AudioWorkletNode(audioContext, "pcm-player-processor");
        node.connect(audioContext.destination);

        nodeRef.current = node;
        ctxRef.current = audioContext;
    }, []);

    /** Feed base64-decoded PCM data into the player worklet. */
    const play = useCallback((data: ArrayBuffer) => {
        nodeRef.current?.port.postMessage(data);
    }, []);

    /** Flush the playback buffer (on interruption). */
    const stop = useCallback(() => {
        nodeRef.current?.port.postMessage({ command: "endOfAudio" });
    }, []);

    return { init, play, stop, nodeRef };
}
