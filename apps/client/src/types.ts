/* ------------------------------------------------------------------ */
/*  TypeScript types for all WebSocket messages and app state          */
/* ------------------------------------------------------------------ */

// ---------- Client → Server ----------

export interface TextMessage {
    type: "text";
    text: string;
}

export interface ImageMessage {
    type: "image";
    data: string; // base64
    mimeType: string;
}

export interface ActivitySignal {
    type: "activity_start" | "activity_end";
}

export type UpstreamMessage = TextMessage | ImageMessage | ActivitySignal;

// ---------- Server → Client ----------

export interface AgentStatusEvent {
    type: "agent_status";
    tool: string;
    message: string;
}

export interface GroundingStatusEvent {
    type: "grounding_status";
    message: string;
}

export interface GroundingResultEvent {
    type: "grounding_result";
    image: string; // base64
    mimeType: string;
}

export interface ToolCompleteEvent {
    type: "tool_complete";
    tool: string;
    message: string;
}

export interface AnnotationFailedEvent {
    type: "annotation_failed";
    message: string;
}

export interface WelcomeEvent {
    type: "welcome";
    text: string;
}

export interface InlineData {
    mimeType: string;
    data: string; // base64
}

export interface ContentPart {
    text?: string;
    thought?: boolean;
    inlineData?: InlineData;
    executableCode?: { code: string; language: string };
    codeExecutionResult?: { outcome: string; output: string };
    functionCall?: { name: string; args: Record<string, unknown> };
    functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface TranscriptionData {
    text: string;
    finished?: boolean;
}

export interface UsageMetadata {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
}

export interface AdkEvent {
    content?: { parts: ContentPart[] };
    turnComplete?: boolean;
    interrupted?: boolean;
    partial?: boolean;
    author?: string;
    inputTranscription?: TranscriptionData;
    outputTranscription?: TranscriptionData;
    usageMetadata?: UsageMetadata;
}

export type DownstreamEvent =
    | AgentStatusEvent
    | GroundingStatusEvent
    | GroundingResultEvent
    | ToolCompleteEvent
    | AnnotationFailedEvent
    | WelcomeEvent
    | AdkEvent;

// ---------- Chat messages (UI state) ----------

export type ChatMessageType =
    | "user-text"
    | "agent-text"
    | "user-image"
    | "agent-image"
    | "system"
    | "agent-status"
    | "grounding-loading"
    | "input-transcription"
    | "output-transcription";

export interface ChatMessage {
    id: string;
    type: ChatMessageType;
    text?: string;
    imageUrl?: string;
    isPartial?: boolean;
    isInterrupted?: boolean;
}

// ---------- Console entries ----------

export type ConsoleEntryType = "outgoing" | "incoming" | "error";

export interface ConsoleEntry {
    id: string;
    type: ConsoleEntryType;
    content: string;
    data?: unknown;
    emoji?: string;
    author?: string;
    isAudio?: boolean;
    timestamp: string;
}
