import { useRef, useCallback } from "react";

/**
 * Hook that manages the camera stream and snapshot capture.
 */
export function useCamera() {
    const streamRef = useRef<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const facingModeRef = useRef<"user" | "environment">("user");

    /** Internal helper — start stream with current facingMode. */
    const startStream = useCallback(async (videoElement: HTMLVideoElement) => {
        // Stop any previous tracks
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 768 },
                height: { ideal: 768 },
                facingMode: facingModeRef.current,
            },
        });
        videoElement.srcObject = stream;

        // Wait for video metadata to load so videoWidth/videoHeight are
        // populated, then explicitly play — this avoids relying on the HTML
        // autoplay attribute which can silently fail in production.
        await new Promise<void>((resolve, reject) => {
            videoElement.onloadedmetadata = () => {
                videoElement
                    .play()
                    .then(() => resolve())
                    .catch(reject);
            };
            // Safety timeout in case metadata never fires
            setTimeout(() => resolve(), 3000);
        });

        streamRef.current = stream;
        videoRef.current = videoElement;
    }, []);

    /** Request camera access and attach to a <video> element. */
    const init = useCallback(
        async (videoElement: HTMLVideoElement) => {
            await startStream(videoElement);
        },
        [startStream],
    );

    /** Toggle between front ("user") and rear ("environment") cameras. */
    const switchCamera = useCallback(async () => {
        facingModeRef.current =
            facingModeRef.current === "user" ? "environment" : "user";
        const videoEl = videoRef.current;
        if (videoEl) {
            await startStream(videoEl);
        }
    }, [startStream]);

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

    return { init, captureSnapshot, stop, switchCamera, streamRef, videoRef, facingModeRef };
}
