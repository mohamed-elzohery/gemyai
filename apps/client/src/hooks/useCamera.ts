import { useRef, useCallback } from "react";

/**
 * Hook that manages the camera stream and snapshot capture.
 */
export function useCamera() {
    const streamRef = useRef<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    /** Request camera access and attach to a <video> element. */
    const init = useCallback(async (videoElement: HTMLVideoElement) => {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 768 },
                height: { ideal: 768 },
                facingMode: "user",
            },
        });
        videoElement.srcObject = stream;
        streamRef.current = stream;
        videoRef.current = videoElement;
    }, []);

    /** Capture a JPEG snapshot (max 768 px) and return base64 data. */
    const captureSnapshot = useCallback((): string | null => {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

        const canvas = document.createElement("canvas");
        const scale = Math.min(768 / video.videoWidth, 768 / video.videoHeight, 1);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        // strip the data:image/jpeg;base64, prefix
        const base64 = dataUrl.split(",")[1];
        return base64 ?? null;
    }, []);

    /** Stop all camera tracks. */
    const stop = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    }, []);

    return { init, captureSnapshot, stop, streamRef, videoRef };
}
