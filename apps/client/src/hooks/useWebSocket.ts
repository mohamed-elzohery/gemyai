import { useEffect, useRef, useCallback, useState } from "react";

interface UseWebSocketOptions {
    userId: string;
    sessionId: string;
    proactivity: boolean;
    affectiveDialog: boolean;
    onMessage: (data: unknown) => void;
    onBinary: (data: ArrayBuffer) => void;
    onConnected: () => void;
    onDisconnected: () => void;
}

export function useWebSocket({
    userId,
    sessionId,
    proactivity,
    affectiveDialog,
    onMessage,
    onBinary,
    onConnected,
    onDisconnected,
}: UseWebSocketOptions) {
    const wsRef = useRef<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // Track intentional close so onclose doesn't auto-reconnect after cleanup
    const intentionalCloseRef = useRef(false);

    // Stable refs for callbacks so we don't re-create the WS on every render
    const onMessageRef = useRef(onMessage);
    onMessageRef.current = onMessage;
    const onBinaryRef = useRef(onBinary);
    onBinaryRef.current = onBinary;
    const onConnectedRef = useRef(onConnected);
    onConnectedRef.current = onConnected;
    const onDisconnectedRef = useRef(onDisconnected);
    onDisconnectedRef.current = onDisconnected;

    const buildUrl = useCallback(() => {
        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const base = `${wsProtocol}//${window.location.host}/ws/${userId}/${sessionId}`;
        const params = new URLSearchParams();
        if (proactivity) params.append("proactivity", "true");
        if (affectiveDialog) params.append("affective_dialog", "true");
        const qs = params.toString();
        return qs ? `${base}?${qs}` : base;
    }, [userId, sessionId, proactivity, affectiveDialog]);

    const connect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        intentionalCloseRef.current = false;

        const url = buildUrl();
        const ws = new WebSocket(url);

        ws.onopen = () => {
            console.log("[WS] Connected to", url);
            setConnected(true);
            onConnectedRef.current();
        };

        ws.onmessage = (event: MessageEvent) => {
            if (event.data instanceof Blob) {
                console.debug(`[WS ▼ BINARY] ${event.data.size} bytes`);
                event.data.arrayBuffer().then((buf) => onBinaryRef.current(buf));
            } else {
                try {
                    const parsed = JSON.parse(event.data);
                    console.log("[WS ▼ RECV]", parsed);
                    onMessageRef.current(parsed);
                } catch {
                    console.warn("[WS] Failed to parse message:", event.data);
                }
            }
        };

        ws.onclose = () => {
            console.log("[WS] Disconnected");
            setConnected(false);
            onDisconnectedRef.current();
            // Only auto-reconnect if this wasn't a deliberate teardown
            if (!intentionalCloseRef.current) {
                reconnectTimer.current = setTimeout(() => {
                    connect();
                }, 5000);
            }
        };

        ws.onerror = () => {
            setConnected(false);
        };

        wsRef.current = ws;
    }, [buildUrl]);

    // Connect on mount and when connection params change
    useEffect(() => {
        connect();
        return () => {
            intentionalCloseRef.current = true;
            clearTimeout(reconnectTimer.current);
            wsRef.current?.close();
            wsRef.current = null;
        };
    }, [connect]);

    const sendJson = useCallback((data: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log("[WS ▲ SEND]", data);
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    const sendBinary = useCallback((data: ArrayBuffer) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.debug(`[WS ▲ BINARY] ${data.byteLength} bytes`);
            wsRef.current.send(data);
        }
    }, []);

    const reconnect = useCallback(() => {
        clearTimeout(reconnectTimer.current);
        wsRef.current?.close();
    }, []);

    return { connected, sendJson, sendBinary, reconnect };
}
