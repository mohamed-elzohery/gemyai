/**
 * Remove spaces between CJK (Japanese/Chinese/Korean) characters while
 * preserving spaces around Latin text.
 */
export function cleanCJKSpaces(text: string): string {
    const cjkPattern =
        /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uff00-\uffef]/;

    return text.replace(/(\S)\s+(?=\S)/g, (match, char1: string) => {
        const nextCharMatch = text.match(new RegExp(char1 + "\\s+(.)", "g"));
        if (nextCharMatch && nextCharMatch.length > 0) {
            const char2 = nextCharMatch[0].slice(-1);
            if (cjkPattern.test(char1) && cjkPattern.test(char2)) {
                return char1;
            }
        }
        return match;
    });
}

/**
 * Replace large inline audio data with a size summary for console display.
 */
export function sanitizeEventForDisplay(event: unknown): unknown {
    const sanitized = JSON.parse(JSON.stringify(event));

    if (sanitized.content?.parts) {
        sanitized.content.parts = sanitized.content.parts.map(
            (part: { inlineData?: { data?: string } }) => {
                if (part.inlineData?.data) {
                    const byteSize = Math.floor(part.inlineData.data.length * 0.75);
                    return {
                        ...part,
                        inlineData: {
                            ...part.inlineData,
                            data: `(${byteSize.toLocaleString()} bytes)`,
                        },
                    };
                }
                return part;
            },
        );
    }

    return sanitized;
}

/**
 * Format a Date to HH:MM:SS.mmm string for console timestamps.
 */
export function formatTimestamp(): string {
    const now = new Date();
    return now.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
}

/**
 * Generate a short random ID.
 */
export function randomId(): string {
    return Math.random().toString(36).substring(2, 9);
}
