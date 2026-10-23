# 3. Migrate Agent Runtime to Python 3 with uv and pytest

The initial prototype and test suite were built in TypeScript on Node.js. We decided to migrate the entire agent implementation to Python 3 using `pyproject.toml`, `uv`, and `pytest` at the repository root, retiring the TypeScript codebase once 1:1 test parity is achieved. This aligns the project directly with the primary LangGraph/LangChain Python ecosystem, simplifies multi-modal and NLP library integration, and leverages `uv` for deterministic, high-performance dependency management.

