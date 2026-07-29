FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev || uv sync --no-dev
COPY bot.py ./bot.py

ENV PORT=7860
EXPOSE 7860
CMD ["uv", "run", "bot.py", "-t", "twilio"]
