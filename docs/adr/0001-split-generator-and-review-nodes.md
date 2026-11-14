# 1. Split Generator Nodes from Shared Review Node

In LangGraph, resuming execution from an `interrupt()` re-executes the node containing the interrupt from the beginning. Placing the interrupt inside generator nodes (`tailor_resume`, `revise_resume`) caused the LLM call to fire twice per Human Review cycle. We decided to separate draft generation from Human Review by introducing a single, idempotent `human_review` node that handles disk writes and the `interrupt()` call, ensuring LLM calls fire exactly once and draft generation remains a pure transformation.

