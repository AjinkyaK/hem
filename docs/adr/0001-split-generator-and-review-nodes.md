# 1. Split Generator Nodes from Shared Review Node

In LangGraph, resuming execution from an `interrupt()` re-executes the node containing the interrupt from the beginning. Placing the interrupt inside generator nodes (`tailorResume`, `reviseResume`) caused the LLM call to fire twice per human review cycle. We decided to separate draft generation from human review by introducing a single, idempotent `reviewDraft` node that handles disk writes and the `interrupt()` call, ensuring LLM calls fire exactly once and draft generation remains a pure transformation.

