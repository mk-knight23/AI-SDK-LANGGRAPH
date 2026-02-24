/**
 * API endpoint for executing LangGraph workflows
 * POST /api/graph - Execute a graph
 */

import { json, type RequestEvent } from "@sveltejs/kit";
import { GraphExecutor } from "$lib/graph";
import { AgentState } from "$lib/state";
import { createResearchWorkflow, createCodeReviewWorkflow } from "$lib/agents";
import { OPENAI_API_KEY } from "$env/static/private";

// Validate environment
if (!OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY not set - graph execution will fail");
}

// Predefined workflows
const workflows = {
  research: createResearchWorkflow(),
  "code-review": (language: string) => createCodeReviewWorkflow(language),
};

// Executor instances cache
const executors = new Map<string, GraphExecutor>();

function getExecutor(workflow: string, language?: string): GraphExecutor {
  const key = language ? `${workflow}:${language}` : workflow;

  if (!executors.has(key)) {
    const agents =
      workflow === "code-review" && language
        ? workflows["code-review"](language)
        : workflows[workflow as keyof typeof workflows];

    if (!agents) {
      throw new Error(`Unknown workflow: ${workflow}`);
    }

    executors.set(
      key,
      new GraphExecutor(agents, {
        maxIterations: 10,
        humanInTheLoop: false,
      }),
    );
  }

  return executors.get(key)!;
}

interface GraphRequest {
  threadId: string;
  startAgent: string;
  messages: Array<{ role: string; content: string }>;
  workflow?: string;
  language?: string;
  options?: {
    checkpoint?: boolean;
    waitForHuman?: boolean;
    timeout?: number;
  };
}

interface GraphResponse {
  messages: Array<{ role: string; content: string; timestamp?: number }>;
  nextAgent: string | null;
  threadId: string;
  checkpointId?: string;
  pausedForHuman?: boolean;
}

export async function POST({ request }: RequestEvent) {
  try {
    const body: GraphRequest = await request.json();

    // Validate required fields
    if (!body.threadId) {
      return json({ error: "threadId is required" }, { status: 400 });
    }

    if (!body.startAgent) {
      return json({ error: "startAgent is required" }, { status: 400 });
    }

    if (!body.messages || !Array.isArray(body.messages)) {
      return json({ error: "messages must be an array" }, { status: 400 });
    }

    // Create initial state
    const state = new AgentState();
    for (const msg of body.messages) {
      state.addMessage({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      });
    }

    // Get or create executor
    let executor: GraphExecutor;

    if (body.workflow) {
      executor = getExecutor(body.workflow, body.language);
    } else {
      // Create custom executor with single agent
      executor = new GraphExecutor({
        [body.startAgent]: async (s: AgentState) => {
          s.addMessage({ role: "assistant", content: "Custom agent executed" });
          return s;
        },
      });
    }

    // Execute graph
    const result = await executor.invoke(state, body.startAgent, {
      threadId: body.threadId,
      checkpoint: body.options?.checkpoint ?? true,
      waitForHuman: body.options?.waitForHuman ?? false,
      timeout: body.options?.timeout,
    });

    // Get latest checkpoint ID if checkpointing was enabled
    let checkpointId: string | undefined;
    if (body.options?.checkpoint) {
      const checkpoints = executor.checkpointManager.getCheckpoints(
        body.threadId,
      );
      if (checkpoints.length > 0) {
        checkpointId = checkpoints[checkpoints.length - 1].id;
      }
    }

    // Build response
    const response: GraphResponse = {
      messages: result.messages,
      nextAgent: result.getNextAgent(),
      threadId: body.threadId,
      checkpointId,
      pausedForHuman: result.isWaitingForApproval(),
    };

    return json(response);
  } catch (error) {
    console.error("Graph execution error:", error);
    return json(
      {
        error: "Graph execution failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
