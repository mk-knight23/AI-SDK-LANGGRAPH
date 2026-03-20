"""Production-style LangGraph flow for Kazi's Agents Army."""

from pathlib import Path
import sys
from typing import TypedDict

sys.path.append(str(Path(__file__).resolve().parent / "core"))
from agents_army_core import MissionRequest, build_mission_plan


class GraphState(TypedDict, total=False):
    mission: str
    primary: str
    support: list[str]
    plan_summary: str
    verification: str


def run_langgraph_mission(mission_text: str) -> GraphState:
    plan = build_mission_plan(MissionRequest(mission_text))

    try:
        from langgraph.graph import StateGraph, START, END
    except Exception as exc:
        return {
            "mission": mission_text,
            "primary": plan.primary,
            "support": plan.support,
            "verification": f"LangGraph dependency missing: {exc}",
        }

    graph = StateGraph(GraphState)

    def route_node(state: GraphState) -> GraphState:
        state["primary"] = plan.primary
        state["support"] = plan.support
        return state

    def planning_node(state: GraphState) -> GraphState:
        state["plan_summary"] = (
            f"{plan.primary} leads mission '{plan.mission}' across phases: {', '.join(plan.phases)}"
        )
        return state

    def verify_node(state: GraphState) -> GraphState:
        state["verification"] = "Route, planning, and verification nodes executed."
        return state

    graph.add_node("route", route_node)
    graph.add_node("plan", planning_node)
    graph.add_node("verify", verify_node)
    graph.add_edge(START, "route")
    graph.add_edge("route", "plan")
    graph.add_edge("plan", "verify")
    graph.add_edge("verify", END)

    compiled = graph.compile()
    return compiled.invoke({"mission": mission_text})
