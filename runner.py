"""CLI runner for LangGraph adapter."""

import argparse

try:
    from .app import run_langgraph_mission
except ImportError:
    from app import run_langgraph_mission


def demo(mission: str) -> None:
    state = run_langgraph_mission(mission)
    print("[LangGraph] primary:", state.get("primary"))
    print("[LangGraph] support:", state.get("support"))
    print("[LangGraph] plan:", state.get("plan_summary"))
    print("[LangGraph] verification:", state.get("verification"))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mission", default="orchestrate rollout and verify qa gates")
    args = parser.parse_args()
    demo(args.mission)
