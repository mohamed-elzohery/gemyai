import { useRef, useCallback } from "react";
import { convertFloat32ToPCM } from "../utils/audio";

/**
 * Hook that wraps the PCM audio recorder worklet (16 kHz capture).
 *
 * Exposes `pause()` / `resume()` to disconnect/reconnect the source
 * from the worklet so no PCM data flows when the user is not speaking.
 *
 * Starts in **paused** state — call `resume()` when the VAD detects
 * the user is speaking.
 */
export function useAudioRecorder() {
    const nodeRef = useRef<AudioWorkletNode | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const pausedRef = useRef(true); // start paused — resume on VAD speech start

    /**
     * Initialise the recorder worklet.
     * The mic starts **paused** — call `resume()` to begin streaming PCM.
     * @param onPCM called with raw 16-bit PCM ArrayBuffer for every captured frame.
     */
    const init = useCallback(async (onPCM: (data: ArrayBuffer) => void) => {
        if (ctxRef.current) return;

        const audioRecorderContext = new AudioContext({ sampleRate: 16000 });
        const workletURL = `${import.meta.env.BASE_URL}pcm-recorder-processor.js`;
        await audioRecorderContext.audioWorklet.addModule(workletURL);

        const micStream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1 },
        });
        const source = audioRecorderContext.createMediaStreamSource(micStream);
        const node = new AudioWorkletNode(
            audioRecorderContext,
            "pcm-recorder-processor",
        );

        // Start disconnected (paused) — VAD will call resume() on speech start
        // source is NOT connected to node yet

        node.port.onmessage = (event: MessageEvent) => {
            if (pausedRef.current) return; // drop frames while paused
            const pcmData = convertFloat32ToPCM(event.data);
            onPCM(pcmData);
        };

        sourceRef.current = source;
        nodeRef.current = node;
        ctxRef.current = audioRecorderContext;
        streamRef.current = micStream;
        pausedRef.current = true; // explicitly paused until resume()
    }, []);

    /** Connect the mic source to the worklet — start streaming PCM. */
    const resume = useCallback(() => {
        if (!pausedRef.current) return;
        const source = sourceRef.current;
        const node = nodeRef.current;
        if (source && node) {
            try { source.connect(node); } catch { /* already connected */ }
            pausedRef.current = false;
            console.log("[AudioRecorder] Resumed — streaming PCM");
        }
    }, []);

    /** Disconnect the mic source from the worklet — stop streaming PCM. */
    const pause = useCallback(() => {
        if (pausedRef.current) return;
        const source = sourceRef.current;
        const node = nodeRef.current;
        if (source && node) {
            try { source.disconnect(node); } catch { /* already disconnected */ }
            pausedRef.current = true;
            console.log("[AudioRecorder] Paused — no PCM streaming");
        }
    }, []);

    /** Stop the microphone entirely. */
    const stopMic = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
    }, []);

    /** Return the underlying mic MediaStream (for VAD to tap into). */
    const getStream = useCallback((): MediaStream | null => {
        return streamRef.current;
    }, []);

    return { init, resume, pause, stopMic, getStream, streamRef };
}
