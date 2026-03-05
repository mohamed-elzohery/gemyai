import { useRef, useCallback } from "react";
import { convertFloat32ToPCM } from "../utils/audio";

/**
 * Hook that wraps the PCM audio recorder worklet (16 kHz capture).
 */
export function useAudioRecorder() {
    const nodeRef = useRef<AudioWorkletNode | null>(null);
    const ctxRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    /**
     * Initialise the recorder worklet.
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

        source.connect(node);
        node.port.onmessage = (event: MessageEvent) => {
            const pcmData = convertFloat32ToPCM(event.data);
            onPCM(pcmData);
        };

        nodeRef.current = node;
        ctxRef.current = audioRecorderContext;
        streamRef.current = micStream;
    }, []);

    /** Stop the microphone. */
    const stopMic = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
    }, []);

    return { init, stopMic, streamRef };
}
