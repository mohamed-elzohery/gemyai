/**
 * app.js: JS code for the ADK Gemini Live API Toolkit demo app.
 */

/**
 * WebSocket handling
 */

// Connect the server with a WebSocket connection
const userId = "demo-user";
const sessionId = "demo-session-" + Math.random().toString(36).substring(7);
let websocket = null;
let is_audio = false;

// Get checkbox elements for RunConfig options
const enableProactivityCheckbox = document.getElementById("enableProactivity");
const enableAffectiveDialogCheckbox = document.getElementById(
  "enableAffectiveDialog",
);

// Reconnect WebSocket when RunConfig options change
function handleRunConfigChange() {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    addSystemMessage("Reconnecting with updated settings...");
    addConsoleEntry(
      "outgoing",
      "Reconnecting due to settings change",
      {
        proactivity: enableProactivityCheckbox.checked,
        affective_dialog: enableAffectiveDialogCheckbox.checked,
      },
      "🔄",
      "system",
    );
    websocket.close();
    // connectWebsocket() will be called by onclose handler after delay
  }
}

// Add change listeners to RunConfig checkboxes
enableProactivityCheckbox.addEventListener("change", handleRunConfigChange);
enableAffectiveDialogCheckbox.addEventListener("change", handleRunConfigChange);

// Build WebSocket URL with RunConfig options as query parameters
function getWebSocketUrl() {
  // Use wss:// for HTTPS pages, ws:// for HTTP (localhost development)
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const baseUrl =
    wsProtocol +
    "//" +
    window.location.host +
    "/ws/" +
    userId +
    "/" +
    sessionId;
  const params = new URLSearchParams();

  // Add proactivity option if checked
  if (enableProactivityCheckbox && enableProactivityCheckbox.checked) {
    params.append("proactivity", "true");
  }

  // Add affective dialog option if checked
  if (enableAffectiveDialogCheckbox && enableAffectiveDialogCheckbox.checked) {
    params.append("affective_dialog", "true");
  }

  const queryString = params.toString();
  return queryString ? baseUrl + "?" + queryString : baseUrl;
}

// Get DOM elements
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("message");
const messagesDiv = document.getElementById("messages");
const statusIndicator = document.getElementById("statusIndicator");
const statusText = document.getElementById("statusText");
const consoleContent = document.getElementById("consoleContent");
const clearConsoleBtn = document.getElementById("clearConsole");
const showAudioEventsCheckbox = document.getElementById("showAudioEvents");
let currentMessageId = null;
let currentBubbleElement = null;
let currentInputTranscriptionId = null;
let currentInputTranscriptionElement = null;
let currentOutputTranscriptionId = null;
let currentOutputTranscriptionElement = null;
let inputTranscriptionFinished = false; // Track if input transcription is complete for this turn
let hasOutputTranscriptionInTurn = false; // Track if output transcription delivered the response

// Helper function to clean spaces between CJK characters
// Removes spaces between Japanese/Chinese/Korean characters while preserving spaces around Latin text
function cleanCJKSpaces(text) {
  // CJK Unicode ranges: Hiragana, Katakana, Kanji, CJK Unified Ideographs, Fullwidth forms
  const cjkPattern =
    /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uff00-\uffef]/;

  // Remove spaces between two CJK characters
  return text.replace(/(\S)\s+(?=\S)/g, (match, char1) => {
    // Get the character after the space(s)
    const nextCharMatch = text.match(new RegExp(char1 + "\\s+(.)", "g"));
    if (nextCharMatch && nextCharMatch.length > 0) {
      const char2 = nextCharMatch[0].slice(-1);
      // If both characters are CJK, remove the space
      if (cjkPattern.test(char1) && cjkPattern.test(char2)) {
        return char1;
      }
    }
    return match;
  });
}

// Console logging functionality
function formatTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function addConsoleEntry(
  type,
  content,
  data = null,
  emoji = null,
  author = null,
  isAudio = false,
) {
  // Skip audio events if checkbox is unchecked
  if (isAudio && !showAudioEventsCheckbox.checked) {
    return;
  }

  const entry = document.createElement("div");
  entry.className = `console-entry ${type}`;

  const header = document.createElement("div");
  header.className = "console-entry-header";

  const leftSection = document.createElement("div");
  leftSection.className = "console-entry-left";

  // Add emoji icon if provided
  if (emoji) {
    const emojiIcon = document.createElement("span");
    emojiIcon.className = "console-entry-emoji";
    emojiIcon.textContent = emoji;
    leftSection.appendChild(emojiIcon);
  }

  // Add expand/collapse icon
  const expandIcon = document.createElement("span");
  expandIcon.className = "console-expand-icon";
  expandIcon.textContent = data ? "▶" : "";

  const typeLabel = document.createElement("span");
  typeLabel.className = "console-entry-type";
  typeLabel.textContent =
    type === "outgoing"
      ? "↑ Upstream"
      : type === "incoming"
        ? "↓ Downstream"
        : "⚠ Error";

  leftSection.appendChild(expandIcon);
  leftSection.appendChild(typeLabel);

  // Add author badge if provided
  if (author) {
    const authorBadge = document.createElement("span");
    authorBadge.className = "console-entry-author";
    authorBadge.textContent = author;
    authorBadge.setAttribute("data-author", author);
    leftSection.appendChild(authorBadge);
  }

  const timestamp = document.createElement("span");
  timestamp.className = "console-entry-timestamp";
  timestamp.textContent = formatTimestamp();

  header.appendChild(leftSection);
  header.appendChild(timestamp);

  const contentDiv = document.createElement("div");
  contentDiv.className = "console-entry-content";
  contentDiv.textContent = content;

  entry.appendChild(header);
  entry.appendChild(contentDiv);

  // JSON details (hidden by default)
  let jsonDiv = null;
  if (data) {
    jsonDiv = document.createElement("div");
    jsonDiv.className = "console-entry-json collapsed";
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(data, null, 2);
    jsonDiv.appendChild(pre);
    entry.appendChild(jsonDiv);

    // Make entry clickable if it has data
    entry.classList.add("expandable");

    // Toggle expand/collapse on click
    entry.addEventListener("click", () => {
      const isExpanded = !jsonDiv.classList.contains("collapsed");

      if (isExpanded) {
        // Collapse
        jsonDiv.classList.add("collapsed");
        expandIcon.textContent = "▶";
        entry.classList.remove("expanded");
      } else {
        // Expand
        jsonDiv.classList.remove("collapsed");
        expandIcon.textContent = "▼";
        entry.classList.add("expanded");
      }
    });
  }

  consoleContent.appendChild(entry);
  consoleContent.scrollTop = consoleContent.scrollHeight;
}

function clearConsole() {
  consoleContent.innerHTML = "";
}

// Clear console button handler
clearConsoleBtn.addEventListener("click", clearConsole);

// Update connection status UI
function updateConnectionStatus(connected) {
  if (connected) {
    statusIndicator.classList.remove("disconnected");
    statusText.textContent = "Connected";
  } else {
    statusIndicator.classList.add("disconnected");
    statusText.textContent = "Disconnected";
  }
}

// Create a message bubble element
function createMessageBubble(text, isUser, isPartial = false) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user" : "agent"}`;

  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "bubble";

  const textP = document.createElement("p");
  textP.className = "bubble-text";
  textP.textContent = text;

  // Add typing indicator for partial messages
  if (isPartial && !isUser) {
    const typingSpan = document.createElement("span");
    typingSpan.className = "typing-indicator";
    textP.appendChild(typingSpan);
  }

  bubbleDiv.appendChild(textP);
  messageDiv.appendChild(bubbleDiv);

  return messageDiv;
}

// Create an image message bubble element
function createImageBubble(imageDataUrl, isUser) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${isUser ? "user" : "agent"}`;

  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "bubble image-bubble";

  const img = document.createElement("img");
  img.src = imageDataUrl;
  img.className = "bubble-image";
  img.alt = "Captured image";

  bubbleDiv.appendChild(img);
  messageDiv.appendChild(bubbleDiv);

  return messageDiv;
}

// Update existing message bubble text
function updateMessageBubble(element, text, isPartial = false) {
  const textElement = element.querySelector(".bubble-text");

  // Remove existing typing indicator
  const existingIndicator = textElement.querySelector(".typing-indicator");
  if (existingIndicator) {
    existingIndicator.remove();
  }

  textElement.textContent = text;

  // Add typing indicator for partial messages
  if (isPartial) {
    const typingSpan = document.createElement("span");
    typingSpan.className = "typing-indicator";
    textElement.appendChild(typingSpan);
  }
}

// Add a system message
function addSystemMessage(text) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "system-message";
  messageDiv.textContent = text;
  messagesDiv.appendChild(messageDiv);
  scrollToBottom();
}

// Scroll to bottom of messages
function scrollToBottom() {
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Sanitize event data for console display (replace large audio data with summary)
function sanitizeEventForDisplay(event) {
  // Deep clone the event object
  const sanitized = JSON.parse(JSON.stringify(event));

  // Check for audio data in content.parts
  if (sanitized.content && sanitized.content.parts) {
    sanitized.content.parts = sanitized.content.parts.map((part) => {
      if (part.inlineData && part.inlineData.data) {
        // Calculate byte size (base64 string length / 4 * 3, roughly)
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
    });
  }

  return sanitized;
}

// WebSocket handlers
function connectWebsocket() {
  // Connect websocket
  const ws_url = getWebSocketUrl();
  websocket = new WebSocket(ws_url);

  // Handle connection open
  websocket.onopen = function () {
    console.log("WebSocket connection opened.");
    updateConnectionStatus(true);
    addSystemMessage("Connected to ADK streaming server");

    // Log to console
    addConsoleEntry(
      "incoming",
      "WebSocket Connected",
      {
        userId: userId,
        sessionId: sessionId,
        url: ws_url,
      },
      "🔌",
      "system",
    );

    // Enable the Send button
    document.getElementById("sendButton").disabled = false;
    addSubmitHandler();
  };

  // Handle incoming messages
  let groundingLoadingBubble = null;
  websocket.onmessage = function (event) {
    // Parse the incoming message
    const parsed = JSON.parse(event.data);

    // --- Visual grounding custom messages (not ADK events) ---
    if (parsed.type === "grounding_status") {
      // Show a loading bubble for visual grounding
      const loadingDiv = document.createElement("div");
      loadingDiv.className = "message agent grounding-loading-message";
      loadingDiv.innerHTML =
        '<div class="bubble grounding-loading"><p class="bubble-text">' +
        "\uD83D\uDD0D " +
        parsed.message +
        "</p></div>";
      messagesDiv.appendChild(loadingDiv);
      groundingLoadingBubble = loadingDiv;
      scrollToBottom();
      // Log to console
      addConsoleEntry(
        "incoming",
        parsed.message,
        parsed,
        "\uD83D\uDD0D",
        "system",
      );
      return;
    }

    if (parsed.type === "grounding_result") {
      // Remove loading bubble if present
      if (groundingLoadingBubble) {
        groundingLoadingBubble.remove();
        groundingLoadingBubble = null;
      }
      // Display the annotated image as an agent bubble
      const dataUrl =
        "data:" + (parsed.mimeType || "image/jpeg") + ";base64," + parsed.image;
      const imageBubble = createImageBubble(dataUrl, false);
      messagesDiv.appendChild(imageBubble);
      scrollToBottom();
      // Log to console
      addConsoleEntry(
        "incoming",
        "Visual grounding result image",
        { mimeType: parsed.mimeType, imageSize: parsed.image.length },
        "\uD83D\uDDBC\uFE0F",
        "system",
      );
      return;
    }

    // --- Normal ADK event handling ---
    const adkEvent = parsed;
    console.log("[AGENT TO CLIENT] ", adkEvent);

    // Log to console panel
    let eventSummary = "Event";
    let eventEmoji = "📨"; // Default emoji
    const author = adkEvent.author || "system";

    if (adkEvent.turnComplete) {
      eventSummary = "Turn Complete";
      eventEmoji = "✅";
    } else if (adkEvent.interrupted) {
      eventSummary = "Interrupted";
      eventEmoji = "⏸️";
    } else if (adkEvent.inputTranscription) {
      // Show transcription text in summary
      const transcriptionText = adkEvent.inputTranscription.text || "";
      const truncated =
        transcriptionText.length > 60
          ? transcriptionText.substring(0, 60) + "..."
          : transcriptionText;
      eventSummary = `Input Transcription: "${truncated}"`;
      eventEmoji = "📝";
    } else if (adkEvent.outputTranscription) {
      // Show transcription text in summary
      const transcriptionText = adkEvent.outputTranscription.text || "";
      const truncated =
        transcriptionText.length > 60
          ? transcriptionText.substring(0, 60) + "..."
          : transcriptionText;
      eventSummary = `Output Transcription: "${truncated}"`;
      eventEmoji = "📝";
    } else if (adkEvent.usageMetadata) {
      // Show token usage information
      const usage = adkEvent.usageMetadata;
      const promptTokens = usage.promptTokenCount || 0;
      const responseTokens = usage.candidatesTokenCount || 0;
      const totalTokens = usage.totalTokenCount || 0;
      eventSummary = `Token Usage: ${totalTokens.toLocaleString()} total (${promptTokens.toLocaleString()} prompt + ${responseTokens.toLocaleString()} response)`;
      eventEmoji = "📊";
    } else if (adkEvent.content && adkEvent.content.parts) {
      const hasText = adkEvent.content.parts.some((p) => p.text);
      const hasAudio = adkEvent.content.parts.some((p) => p.inlineData);
      const hasExecutableCode = adkEvent.content.parts.some(
        (p) => p.executableCode,
      );
      const hasCodeExecutionResult = adkEvent.content.parts.some(
        (p) => p.codeExecutionResult,
      );

      if (hasExecutableCode) {
        // Show executable code
        const codePart = adkEvent.content.parts.find((p) => p.executableCode);
        if (codePart && codePart.executableCode) {
          const code = codePart.executableCode.code || "";
          const language = codePart.executableCode.language || "unknown";
          const truncated =
            code.length > 60
              ? code.substring(0, 60).replace(/\n/g, " ") + "..."
              : code.replace(/\n/g, " ");
          eventSummary = `Executable Code (${language}): ${truncated}`;
          eventEmoji = "💻";
        }
      }

      if (hasCodeExecutionResult) {
        // Show code execution result
        const resultPart = adkEvent.content.parts.find(
          (p) => p.codeExecutionResult,
        );
        if (resultPart && resultPart.codeExecutionResult) {
          const outcome = resultPart.codeExecutionResult.outcome || "UNKNOWN";
          const output = resultPart.codeExecutionResult.output || "";
          const truncatedOutput =
            output.length > 60
              ? output.substring(0, 60).replace(/\n/g, " ") + "..."
              : output.replace(/\n/g, " ");
          eventSummary = `Code Execution Result (${outcome}): ${truncatedOutput}`;
          eventEmoji = outcome === "OUTCOME_OK" ? "✅" : "❌";
        }
      }

      if (hasText) {
        // Show text preview in summary
        const textPart = adkEvent.content.parts.find((p) => p.text);
        if (textPart && textPart.text) {
          const text = textPart.text;
          const truncated =
            text.length > 80 ? text.substring(0, 80) + "..." : text;
          eventSummary = `Text: "${truncated}"`;
          eventEmoji = "💭";
        } else {
          eventSummary = "Text Response";
          eventEmoji = "💭";
        }
      }

      if (hasAudio) {
        // Extract audio info for summary
        const audioPart = adkEvent.content.parts.find((p) => p.inlineData);
        if (audioPart && audioPart.inlineData) {
          const mimeType = audioPart.inlineData.mimeType || "unknown";
          const dataLength = audioPart.inlineData.data
            ? audioPart.inlineData.data.length
            : 0;
          // Base64 string length / 4 * 3 gives approximate bytes
          const byteSize = Math.floor(dataLength * 0.75);
          eventSummary = `Audio Response: ${mimeType} (${byteSize.toLocaleString()} bytes)`;
          eventEmoji = "🔊";
        } else {
          eventSummary = "Audio Response";
          eventEmoji = "🔊";
        }

        // Log audio event with isAudio flag (filtered by checkbox)
        const sanitizedEvent = sanitizeEventForDisplay(adkEvent);
        addConsoleEntry(
          "incoming",
          eventSummary,
          sanitizedEvent,
          eventEmoji,
          author,
          true,
        );
      }
    }

    // Create a sanitized version for console display (replace large audio data with summary)
    // Skip if already logged as audio event above
    const isAudioOnlyEvent =
      adkEvent.content &&
      adkEvent.content.parts &&
      adkEvent.content.parts.some((p) => p.inlineData) &&
      !adkEvent.content.parts.some((p) => p.text);
    if (!isAudioOnlyEvent) {
      const sanitizedEvent = sanitizeEventForDisplay(adkEvent);
      addConsoleEntry(
        "incoming",
        eventSummary,
        sanitizedEvent,
        eventEmoji,
        author,
      );
    }

    // Handle turn complete event
    if (adkEvent.turnComplete === true) {
      // Remove typing indicator from current message
      if (currentBubbleElement) {
        const textElement = currentBubbleElement.querySelector(".bubble-text");
        const typingIndicator = textElement.querySelector(".typing-indicator");
        if (typingIndicator) {
          typingIndicator.remove();
        }
      }
      // Remove typing indicator from current output transcription
      if (currentOutputTranscriptionElement) {
        const textElement =
          currentOutputTranscriptionElement.querySelector(".bubble-text");
        const typingIndicator = textElement.querySelector(".typing-indicator");
        if (typingIndicator) {
          typingIndicator.remove();
        }
      }
      currentMessageId = null;
      currentBubbleElement = null;
      currentOutputTranscriptionId = null;
      currentOutputTranscriptionElement = null;
      inputTranscriptionFinished = false; // Reset for next turn
      hasOutputTranscriptionInTurn = false; // Reset for next turn
      return;
    }

    // Handle interrupted event
    if (adkEvent.interrupted === true) {
      // Stop audio playback if it's playing
      if (audioPlayerNode) {
        audioPlayerNode.port.postMessage({ command: "endOfAudio" });
      }

      // Keep the partial message but mark it as interrupted
      if (currentBubbleElement) {
        const textElement = currentBubbleElement.querySelector(".bubble-text");

        // Remove typing indicator
        const typingIndicator = textElement.querySelector(".typing-indicator");
        if (typingIndicator) {
          typingIndicator.remove();
        }

        // Add interrupted marker
        currentBubbleElement.classList.add("interrupted");
      }

      // Keep the partial output transcription but mark it as interrupted
      if (currentOutputTranscriptionElement) {
        const textElement =
          currentOutputTranscriptionElement.querySelector(".bubble-text");

        // Remove typing indicator
        const typingIndicator = textElement.querySelector(".typing-indicator");
        if (typingIndicator) {
          typingIndicator.remove();
        }

        // Add interrupted marker
        currentOutputTranscriptionElement.classList.add("interrupted");
      }

      // Reset state so new content creates a new bubble
      currentMessageId = null;
      currentBubbleElement = null;
      currentOutputTranscriptionId = null;
      currentOutputTranscriptionElement = null;
      inputTranscriptionFinished = false; // Reset for next turn
      hasOutputTranscriptionInTurn = false; // Reset for next turn
      return;
    }

    // Handle input transcription (user's spoken words)
    if (adkEvent.inputTranscription && adkEvent.inputTranscription.text) {
      const transcriptionText = adkEvent.inputTranscription.text;
      const isFinished = adkEvent.inputTranscription.finished;

      if (transcriptionText) {
        // Ignore late-arriving transcriptions after we've finished for this turn
        if (inputTranscriptionFinished) {
          return;
        }

        if (currentInputTranscriptionId == null) {
          // Create new transcription bubble
          currentInputTranscriptionId = Math.random().toString(36).substring(7);
          // Clean spaces between CJK characters
          const cleanedText = cleanCJKSpaces(transcriptionText);
          currentInputTranscriptionElement = createMessageBubble(
            cleanedText,
            true,
            !isFinished,
          );
          currentInputTranscriptionElement.id = currentInputTranscriptionId;

          // Add a special class to indicate it's a transcription
          currentInputTranscriptionElement.classList.add("transcription");

          messagesDiv.appendChild(currentInputTranscriptionElement);
        } else {
          // Update existing transcription bubble only if model hasn't started responding
          // This prevents late partial transcriptions from overwriting complete ones
          if (
            currentOutputTranscriptionId == null &&
            currentMessageId == null
          ) {
            if (isFinished) {
              // Final transcription contains the complete text, replace entirely
              const cleanedText = cleanCJKSpaces(transcriptionText);
              updateMessageBubble(
                currentInputTranscriptionElement,
                cleanedText,
                false,
              );
            } else {
              // Partial transcription - append to existing text
              const existingText =
                currentInputTranscriptionElement.querySelector(
                  ".bubble-text",
                ).textContent;
              // Remove typing indicator if present
              const cleanText = existingText.replace(/\.\.\.$/, "");
              // Clean spaces between CJK characters before updating
              const accumulatedText = cleanCJKSpaces(
                cleanText + transcriptionText,
              );
              updateMessageBubble(
                currentInputTranscriptionElement,
                accumulatedText,
                true,
              );
            }
          }
        }

        // If transcription is finished, reset the state and mark as complete
        if (isFinished) {
          currentInputTranscriptionId = null;
          currentInputTranscriptionElement = null;
          inputTranscriptionFinished = true; // Prevent duplicate bubbles from late events
        }

        scrollToBottom();
      }
    }

    // Handle output transcription (model's spoken words)
    if (adkEvent.outputTranscription && adkEvent.outputTranscription.text) {
      const transcriptionText = adkEvent.outputTranscription.text;
      const isFinished = adkEvent.outputTranscription.finished;
      hasOutputTranscriptionInTurn = true;

      if (transcriptionText) {
        // Finalize any active input transcription when server starts responding
        if (
          currentInputTranscriptionId != null &&
          currentOutputTranscriptionId == null
        ) {
          // This is the first output transcription - finalize input transcription
          const textElement =
            currentInputTranscriptionElement.querySelector(".bubble-text");
          const typingIndicator =
            textElement.querySelector(".typing-indicator");
          if (typingIndicator) {
            typingIndicator.remove();
          }
          // Reset input transcription state so next user input creates new balloon
          currentInputTranscriptionId = null;
          currentInputTranscriptionElement = null;
          inputTranscriptionFinished = true; // Prevent duplicate bubbles from late events
        }

        if (currentOutputTranscriptionId == null) {
          // Create new transcription bubble for agent
          currentOutputTranscriptionId = Math.random()
            .toString(36)
            .substring(7);
          currentOutputTranscriptionElement = createMessageBubble(
            transcriptionText,
            false,
            !isFinished,
          );
          currentOutputTranscriptionElement.id = currentOutputTranscriptionId;

          // Add a special class to indicate it's a transcription
          currentOutputTranscriptionElement.classList.add("transcription");

          messagesDiv.appendChild(currentOutputTranscriptionElement);
        } else {
          // Update existing transcription bubble
          if (isFinished) {
            // Final transcription contains the complete text, replace entirely
            updateMessageBubble(
              currentOutputTranscriptionElement,
              transcriptionText,
              false,
            );
          } else {
            // Partial transcription - append to existing text
            const existingText =
              currentOutputTranscriptionElement.querySelector(
                ".bubble-text",
              ).textContent;
            // Remove typing indicator if present
            const cleanText = existingText.replace(/\.\.\.$/, "");
            updateMessageBubble(
              currentOutputTranscriptionElement,
              cleanText + transcriptionText,
              true,
            );
          }
        }

        // If transcription is finished, reset the state
        if (isFinished) {
          currentOutputTranscriptionId = null;
          currentOutputTranscriptionElement = null;
        }

        scrollToBottom();
      }
    }

    // Handle content events (text or audio)
    if (adkEvent.content && adkEvent.content.parts) {
      const parts = adkEvent.content.parts;

      // Finalize any active input transcription when server starts responding with content
      if (
        currentInputTranscriptionId != null &&
        currentMessageId == null &&
        currentOutputTranscriptionId == null
      ) {
        // This is the first content event - finalize input transcription
        const textElement =
          currentInputTranscriptionElement.querySelector(".bubble-text");
        const typingIndicator = textElement.querySelector(".typing-indicator");
        if (typingIndicator) {
          typingIndicator.remove();
        }
        // Reset input transcription state so next user input creates new balloon
        currentInputTranscriptionId = null;
        currentInputTranscriptionElement = null;
        inputTranscriptionFinished = true; // Prevent duplicate bubbles from late events
      }

      for (const part of parts) {
        // Handle inline data (audio or images)
        if (part.inlineData) {
          const mimeType = part.inlineData.mimeType;
          const data = part.inlineData.data;

          if (mimeType && mimeType.startsWith("audio/pcm") && audioPlayerNode) {
            audioPlayerNode.port.postMessage(base64ToArray(data));
          } else if (mimeType && mimeType.startsWith("image/")) {
            // Display inline image from the model
            const imgDataUrl = "data:" + mimeType + ";base64," + data;
            const imgBubble = createImageBubble(imgDataUrl, false);
            messagesDiv.appendChild(imgBubble);
            scrollToBottom();
          }
        }

        // Handle text
        if (part.text) {
          // Skip thinking/reasoning text from chat bubbles (shown in event console)
          if (part.thought) {
            continue;
          }

          // Skip final aggregated content when output transcription already
          // delivered the response (prevents duplicate thinking text replay)
          if (!adkEvent.partial && hasOutputTranscriptionInTurn) {
            continue;
          }

          // Add a new message bubble for a new turn
          if (currentMessageId == null) {
            currentMessageId = Math.random().toString(36).substring(7);
            currentBubbleElement = createMessageBubble(part.text, false, true);
            currentBubbleElement.id = currentMessageId;
            messagesDiv.appendChild(currentBubbleElement);
          } else {
            // Update the existing message bubble with accumulated text
            const existingText =
              currentBubbleElement.querySelector(".bubble-text").textContent;
            // Remove the "..." if present
            const cleanText = existingText.replace(/\.\.\.$/, "");
            updateMessageBubble(
              currentBubbleElement,
              cleanText + part.text,
              true,
            );
          }

          // Scroll down to the bottom of the messagesDiv
          scrollToBottom();
        }
      }
    }
  };

  // Handle connection close
  websocket.onclose = function () {
    console.log("WebSocket connection closed.");
    updateConnectionStatus(false);
    document.getElementById("sendButton").disabled = true;
    addSystemMessage("Connection closed. Reconnecting in 5 seconds...");

    // Log to console
    addConsoleEntry(
      "error",
      "WebSocket Disconnected",
      {
        status: "Connection closed",
        reconnecting: true,
        reconnectDelay: "5 seconds",
      },
      "🔌",
      "system",
    );

    setTimeout(function () {
      console.log("Reconnecting...");

      // Log reconnection attempt to console
      addConsoleEntry(
        "outgoing",
        "Reconnecting to ADK server...",
        {
          userId: userId,
          sessionId: sessionId,
        },
        "🔄",
        "system",
      );

      connectWebsocket();
    }, 5000);
  };

  websocket.onerror = function (e) {
    console.log("WebSocket error: ", e);
    updateConnectionStatus(false);

    // Log to console
    addConsoleEntry(
      "error",
      "WebSocket Error",
      {
        error: e.type,
        message: "Connection error occurred",
      },
      "⚠️",
      "system",
    );
  };
}
connectWebsocket();

// Add submit handler to the form
function addSubmitHandler() {
  messageForm.onsubmit = function (e) {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message) {
      // Add user message bubble
      const userBubble = createMessageBubble(message, true, false);
      messagesDiv.appendChild(userBubble);
      scrollToBottom();

      // Clear input
      messageInput.value = "";

      // Send message to server
      sendMessage(message);
      console.log("[CLIENT TO AGENT] " + message);
    }
    return false;
  };
}

// Send a message to the server as JSON
function sendMessage(message) {
  if (websocket && websocket.readyState == WebSocket.OPEN) {
    const jsonMessage = JSON.stringify({
      type: "text",
      text: message,
    });
    websocket.send(jsonMessage);

    // Log to console panel
    addConsoleEntry("outgoing", "User Message: " + message, null, "💬", "user");
  }
}

// Decode Base64 data to Array
// Handles both standard base64 and base64url encoding
function base64ToArray(base64) {
  // Convert base64url to standard base64
  // Replace URL-safe characters: - with +, _ with /
  let standardBase64 = base64.replace(/-/g, "+").replace(/_/g, "/");

  // Add padding if needed
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
 * Session handling (camera + audio + VAD)
 */

let cameraStream = null;
let isSpeaking = false;
let imageStreamInterval = null;
let myVad = null;

const startSessionButton = document.getElementById("startSessionButton");
const cameraPreviewOverlay = document.getElementById("cameraPreviewOverlay");
const cameraPreviewLive = document.getElementById("cameraPreviewLive");
const vadIndicator = document.getElementById("vadIndicator");

// Capture a camera frame and send it to the server (silently — no chat bubble)
function captureAndSendSnapshot() {
  if (!cameraStream || !websocket || websocket.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    const video = cameraPreviewLive;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement("canvas");
    // Resize to 768 max dimension while keeping aspect ratio
    const scale = Math.min(768 / video.videoWidth, 768 / video.videoHeight, 1);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result.split(",")[1];
          const jsonMessage = JSON.stringify({
            type: "image",
            data: base64data,
            mimeType: "image/jpeg",
          });
          websocket.send(jsonMessage);

          // Log to console only (not chat)
          addConsoleEntry(
            "outgoing",
            `Snapshot: ${blob.size} bytes (${canvas.width}x${canvas.height})`,
            {
              size: blob.size,
              type: "image/jpeg",
              dimensions: `${canvas.width}x${canvas.height}`,
            },
            "📷",
            "user",
          );
        };
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      0.7,
    );
  } catch (err) {
    console.error("Snapshot capture error:", err);
  }
}

// Called by VAD when speech starts
function handleSpeechStart() {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
  isSpeaking = true;

  // Send activity_start before any audio
  websocket.send(JSON.stringify({ type: "activity_start" }));

  // Visual feedback
  vadIndicator.classList.add("active");
  cameraPreviewOverlay.classList.add("speaking");

  // Capture first snapshot immediately
  captureAndSendSnapshot();

  // Start periodic image streaming every 1000ms
  imageStreamInterval = setInterval(captureAndSendSnapshot, 1000);

  addConsoleEntry(
    "outgoing",
    "Speech start → activity_start",
    null,
    "🎙️",
    "user",
  );
  console.log("[VAD] Speech start — activity_start sent");
}

// Called by VAD when speech ends
function handleSpeechEnd(audio) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) return;

  // Capture final snapshot
  captureAndSendSnapshot();

  // Stop image streaming (always clear to guard against stale intervals)
  clearInterval(imageStreamInterval);
  imageStreamInterval = null;

  isSpeaking = false;

  // Send activity_end after last audio
  websocket.send(JSON.stringify({ type: "activity_end" }));

  // Visual feedback
  vadIndicator.classList.remove("active");
  cameraPreviewOverlay.classList.remove("speaking");

  addConsoleEntry("outgoing", "Speech end → activity_end", null, "🎙️", "user");
  console.log("[VAD] Speech end — activity_end sent");
}

// Start session: request mic + camera, init audio worklets, init VAD
async function startSession() {
  startSessionButton.disabled = true;
  startSessionButton.textContent = "Starting...";

  try {
    // 1. Request camera access
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 768 },
        height: { ideal: 768 },
        facingMode: "user",
      },
    });
    cameraPreviewLive.srcObject = cameraStream;
    cameraPreviewOverlay.classList.remove("hidden");

    // 2. Start audio player worklet (for playback)
    const [pNode, pCtx] = await startAudioPlayerWorklet();
    audioPlayerNode = pNode;
    audioPlayerContext = pCtx;

    // 3. Start audio recorder worklet (for PCM capture → streaming)
    const [rNode, rCtx, stream] =
      await startAudioRecorderWorklet(audioRecorderHandler);
    audioRecorderNode = rNode;
    audioRecorderContext = rCtx;
    micStream = stream;

    // 4. Initialize client-side VAD with strict thresholds to avoid false positives
    myVad = await vad.MicVAD.new({
      onSpeechStart: () => {
        handleSpeechStart();
      },
      onSpeechEnd: (audio) => {
        handleSpeechEnd(audio);
      },
      // Higher = requires stronger speech probability to trigger (default 0.5)
      positiveSpeechThreshold: 0.9,
      // Lower = ends speech faster when voice drops (default 0.35)
      negativeSpeechThreshold: 0.75,
      // Require more consecutive speech frames before triggering start (default 1)
      minSpeechFrames: 5,
      // Number of negative frames needed before ending speech (default 8)
      redemptionFrames: 12,
      // Pre-speech padding in frames to include audio before detection
      preSpeechPadFrames: 3,
      onnxWASMBasePath:
        "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
      baseAssetPath:
        "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/",
    });
    myVad.start();

    // 5. Session is ready
    is_audio = true;
    startSessionButton.classList.add("hidden");
    addSystemMessage("Session started — speak to interact with the agent");

    addConsoleEntry(
      "outgoing",
      "Session started (audio + camera + VAD)",
      {
        status: "active",
        camera: true,
        vad: "client-side (@ricky0123/vad-web)",
      },
      "🚀",
      "system",
    );
  } catch (err) {
    console.error("Failed to start session:", err);
    startSessionButton.disabled = false;
    startSessionButton.textContent = "Start Session";

    // Graceful fallback messaging
    let errorMsg = `Failed to start session: ${err.message}`;
    if (err.name === "NotAllowedError") {
      errorMsg =
        "Camera/microphone permission denied. Please allow access and try again.";
    } else if (err.name === "NotFoundError") {
      errorMsg = "No camera or microphone found on this device.";
    }
    addSystemMessage(errorMsg);

    addConsoleEntry(
      "error",
      "Session start failed",
      {
        error: err.message,
        name: err.name,
      },
      "⚠️",
      "system",
    );

    // Clean up partial state
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    cameraPreviewOverlay.classList.add("hidden");
  }
}

startSessionButton.addEventListener("click", startSession);

/**
 * Audio handling
 */

let audioPlayerNode;
let audioPlayerContext;
let audioRecorderNode;
let audioRecorderContext;
let micStream;

// Import the audio worklets
import { startAudioPlayerWorklet } from "./audio-player.js";
import { startAudioRecorderWorklet } from "./audio-recorder.js";

// Audio recorder handler — only send audio when VAD detects speech
function audioRecorderHandler(pcmData) {
  if (
    websocket &&
    websocket.readyState === WebSocket.OPEN &&
    is_audio &&
    isSpeaking
  ) {
    websocket.send(pcmData);
    console.log(
      "[CLIENT TO AGENT] Sent audio chunk: %s bytes",
      pcmData.byteLength,
    );
  }
}
