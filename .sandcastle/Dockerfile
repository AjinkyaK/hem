# The agent's sandbox. Built by .github/workflows/agent-implement.yml with the
# repo root as context. Holds the toolchain only; `uv sync` runs per run.
FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.3 /uv /uvx /usr/local/bin/

# sandcastle runs the container as the host's UID/GID, so bind-mounted files
# and image-built files share an owner. The workflow passes `id -u` / `id -g`.
ARG AGENT_UID=1000
ARG AGENT_GID=1000
RUN groupmod -o -g "$AGENT_GID" node \
  && usermod -o -u "$AGENT_UID" -g "$AGENT_GID" -d /home/agent -m -l agent node
USER ${AGENT_UID}:${AGENT_GID}

RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/agent/.local/bin:$PATH"

# The worktree is a bind mount, so uv can't hardlink from its cache into it.
ENV UV_LINK_MODE=copy
COPY .python-version /tmp/.python-version
RUN uv python install "$(cat /tmp/.python-version)"

WORKDIR /home/agent
# sandcastle mounts the worktree at /home/agent/workspace and execs into it.
ENTRYPOINT ["sleep", "infinity"]
