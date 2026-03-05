"""Google Search Agent definition for ADK Gemini Live API Toolkit demo."""

import os

from google.adk.agents import Agent
from google.adk.tools import google_search

from .visual_grounding import annotate_image

# Default models for Live API with native audio support:
# - Gemini Live API: gemini-2.5-flash-native-audio-preview-12-2025
# - Vertex AI Live API: gemini-live-2.5-flash-native-audio
agent = Agent(
    name="google_search_agent",
    model=os.getenv(
        "DEMO_AGENT_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025"
    ),
    tools=[google_search, annotate_image],
    instruction=(
        "You are a helpful assistant. You can search the web using google_search.\n\n"
        "## Visual Grounding\n"
        "When the user asks you to point at, locate, find, or identify something "
        "visible in their camera feed (e.g. 'where is the slot?', 'show me the "
        "button', 'point to the USB port'), do the following:\n"
        "1. First, say aloud 'Let me show you <what they asked about>' so the "
        "user hears you are working on it.\n"
        "2. Then immediately call the `annotate_image` tool with a clear, concise "
        "query describing what to find.\n"
        "3. After the tool returns, briefly describe what was found and marked.\n\n"
        "IMPORTANT: Never mention tool names, internal processes, delegation "
        "details, or how you work internally. Keep your responses natural and "
        "conversational."
    ),
)
