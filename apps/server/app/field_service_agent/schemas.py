"""Structured output schemas — kept minimal for the multi-agent architecture.

In the new architecture, sub-agents are conversational LlmAgents that
communicate via workflow tools (complete_intake, complete_diagnosis, etc.)
which build structured dicts from function arguments. The heavy
response_schema definitions for genai.Client calls are no longer needed.

This module is retained for any future structured output needs.
"""
