# 2. Markdown-Only Output Boundary for Agent

The core LangGraph agent produces and iterates strictly on markdown resume drafts. Rendering or converting the finalized markdown to DOCX or PDF is deliberately excluded from the graph pipeline and delegated to external downstream tooling. This keeps the agent runtime lightweight, isolates LLM prompt iteration from formatting/templating libraries, and avoids non-deterministic binary document rendering within graph checkpoints.

