import { useRef, useCallback } from "react";

/**
 * Hook that wraps the PCM audio player worklet (24 kHz playback).
 *
 * Features:
 *  - GainNode (3×) to boost volume on mobile speakers.
 *  - Playback-state messages from the worklet (`isPlaying` ref).
 *  - Pre-init buffer so audio arriving before init() isn't dropped.
 */
export function useAudioPlayer() {
    const nodeRef = useRef<AudioWorkletNode | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const gainRef = useRef<GainNode | null>(null);

    /** True when the worklet's ring-buffer is actively outputting audio. */
    const isPlayingRef = useRef(false);

    /** Optional external callback invoked on playback state transitions. */
    const playbackCbRef = useRef<((playing: boolean) => void) | null>(null);

    /** Queue of PCM chunks that arrived before init() completed. */
    const pendingRef = useRef<ArrayBuffer[]>([]);

    const init = useCallback(async () => {
        if (ctxRef.current) return; // already initialised

        const audioContext = new AudioContext({ sampleRate: 24000 });

        // On mobile browsers the AudioContext starts "suspended" until a
        // user-gesture.  We call resume() here because init() is invoked
        // right after the user navigates to the session (counts as a gesture).
        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }

        const workletURL = `${import.meta.env.BASE_URL}pcm-player-processor.js`;
        await audioContext.audioWorklet.addModule(workletURL);
        const node = new AudioWorkletNode(audioContext, "pcm-player-processor");

        // Gain stage — boost volume for mobile speakers
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 3.0;
        node.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Listen for playback-state messages from the worklet
        node.port.onmessage = (e: MessageEvent) => {
            if (e.data?.type === "playbackState") {
                const playing: boolean = e.data.playing;
                if (isPlayingRef.current !== playing) {
                    isPlayingRef.current = playing;
                    playbackCbRef.current?.(playing);
                }
            }
        };

        nodeRef.current = node;
        ctxRef.current = audioContext;
        gainRef.current = gainNode;

        // Flush any PCM data that arrived before init completed
        for (const chunk of pendingRef.current) {
            node.port.postMessage(chunk);
        }
        pendingRef.current = [];
    }, []);

    /** Feed base64-decoded PCM data into the player worklet. */
    const play = useCallback((data: ArrayBuffer) => {
        if (nodeRef.current) {
            nodeRef.current.port.postMessage(data);
        } else {
            // Buffer until init() finishes so the welcome message isn't lost
            pendingRef.current.push(data);
        }
    }, []);

    /** Flush the playback buffer (on interruption). */
    const stop = useCallback(() => {
        nodeRef.current?.port.postMessage({ command: "endOfAudio" });
    }, []);

    /** Register a callback for playback-state changes. */
    const onPlaybackStateChange = useCallback(
        (cb: (playing: boolean) => void) => {
            playbackCbRef.current = cb;
        },
        [],
    );

    return { init, play, stop, nodeRef, isPlayingRef, onPlaybackStateChange };
}
