import { useRef, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import type { ChatMessage } from "../types";
import MessageBubble from "./MessageBubble";
import InputBar from "./InputBar";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendText: (text: string) => void;
  onStartSession: () => void;
  sessionStarted: boolean;
  sendEnabled: boolean;
}

export default function ChatPanel({
  messages,
  onSendText,
  onStartSession,
  sessionStarted,
  sendEnabled,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStartSession = async () => {
    setSessionLoading(true);
    try {
      await onStartSession();
    } finally {
      setSessionLoading(false);
    }
  };

  return (
    <>
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 1,
          background: "linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%)",
        }}
      >
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </Box>

      <InputBar
        onSend={onSendText}
        onStartSession={handleStartSession}
        sessionStarted={sessionStarted}
        sessionLoading={sessionLoading}
        sendEnabled={sendEnabled}
      />
    </>
  );
}
