# Project Brain: AI-SDK-LANGGRAPH

## Purpose

Durable state-machine agents for long-running mission flows.

## Current State

- Typed GraphState contract for mission execution.
- Route, planning, and verification graph nodes.
- FastAPI service and CLI runner.
- Shared skill registry and mission plan rendering.
- Docker, CI, pytest contract tests, and deployment-ready metadata.

## Upgrade Direction

- Add checkpoints for durable runs.
- Add human approval gates for risky tools.
- Create graph benchmarks for latency, recovery, and correctness.

## Quality Bar

- Keep the repository runnable from a fresh clone.
- Keep generated caches and local secrets out of git.
- Keep README, skill matrix, tests, and CI aligned with actual behavior.
