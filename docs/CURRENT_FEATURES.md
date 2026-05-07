# Current Feature Inventory

## Repository

- Name: `AI-SDK-LANGGRAPH`
- SDK: LangGraph
- Positioning: Durable state-machine agents for long-running mission flows.

## Implemented Today

- Typed GraphState contract for mission execution.
- Route, planning, and verification graph nodes.
- FastAPI service and CLI runner.
- Shared skill registry and mission plan rendering.
- Docker, CI, pytest contract tests, and deployment-ready metadata.

## Not Yet Implemented

- Add checkpoints for durable runs.
- Add human approval gates for risky tools.
- Create graph benchmarks for latency, recovery, and correctness.

## Verification Contract

- The local runner must complete without crashing when optional SDK credentials are missing.
- The API contract must return routing and verification fields.
- Tests must prove mission routing and a security-focused SENTINEL route.
