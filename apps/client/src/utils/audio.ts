/**
 * Decode base64 (standard or base64url) to an ArrayBuffer.
 */
export function base64ToArray(base64: string): ArrayBuffer {
    let standardBase64 = base64.replace(/-/g, "+").replace(/_/g, "/");
    while (standardBase64.length % 4) {
        standardBase64 += "=";
    }
    const binaryString = window.atob(standardBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Convert Float32 audio samples to 16-bit PCM ArrayBuffer.
 */
export function convertFloat32ToPCM(inputData: Float32Array): ArrayBuffer {
    const pcm16 = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
        pcm16[i] = inputData[i] * 0x7fff;
    }
    return pcm16.buffer;
}
