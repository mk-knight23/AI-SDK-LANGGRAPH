/**
 * Graph executor for LangGraph multi-agent workflows
 * Handles agent execution, routing, checkpointing, and streaming
 */

import {
  AgentState,
  type AgentFunction,
  CheckpointManager,
  type Message,
} from "./state";

export interface StreamEvent {
  type: "agent_start" | "agent_complete" | "message" | "error" | "complete";
  agentName?: string;
  message?: Message;
  error?: string;
  timestamp: number;
}

export interface GraphOptions {
  threadId?: string;
  checkpoint?: boolean;
  waitForHuman?: boolean;
  timeout?: number;
}

export interface ExecutorConfig {
  maxIterations?: number;
  humanInTheLoop?: boolean;
}

/**
 * GraphExecutor manages the execution of multi-agent workflows
 * Supports cyclic graphs, checkpointing, and human-in-the-loop patterns
 */
export class GraphExecutor {
  public readonly agents: Record<string, AgentFunction>;
  public readonly config: ExecutorConfig;
  public readonly checkpointManager: CheckpointManager;

  constructor(
    agents: Record<string, AgentFunction>,
    config: ExecutorConfig = {},
    checkpointManager?: CheckpointManager,
  ) {
    this.agents = agents;
    this.config = {
      maxIterations: config.maxIterations || 10,
      humanInTheLoop: config.humanInTheLoop || false,
    };
    this.checkpointManager = checkpointManager || new CheckpointManager();
  }

  /**
   * Execute the graph starting from the specified agent
   */
  async invoke(
    inputState: AgentState,
    startAgent: string,
    options: GraphOptions = {},
  ): Promise<AgentState> {
    const { threadId, checkpoint, waitForHuman } = options;

    // Clone state to avoid mutation
    let state = inputState.clone();
    let currentAgent = startAgent;
    let iterations = 0;

    while (currentAgent && iterations < this.config.maxIterations) {
      // Check for human-in-the-loop pause
      if (state.isWaitingForApproval() && this.config.humanInTheLoop) {
        if (waitForHuman) {
          break; // Pause execution
        }
      }

      // Handle special __human__ agent (pause point)
      if (currentAgent === "__human__") {
        if (waitForHuman) {
          break; // Pause execution for human input
        }
        // If not waiting, skip to next agent
        currentAgent = state.getNextAgent();
        continue;
      }

      // Execute current agent
      try {
        const agentFn = this.agents[currentAgent];
        if (!agentFn) {
          throw new Error(`Agent '${currentAgent}' not found`);
        }

        const result = await this.executeWithTimeout(
          agentFn(state),
          options.timeout || 30000,
        );

        if (result === null) {
          // Agent returned null, continue to next based on state
          currentAgent = state.getNextAgent();
        } else {
          state = result;
          currentAgent = state.getNextAgent();
        }

        // Save checkpoint if enabled
        if (checkpoint && threadId) {
          this.checkpointManager.saveCheckpoint(threadId, state);
        }

        iterations++;
      } catch (error) {
        if (error instanceof Error && error.message === "Execution timeout") {
          throw new Error(`Agent '${currentAgent}' timed out`);
        }
        throw error;
      }
    }

    return state;
  }

  /**
   * Stream execution events
   */
  async *stream(
    inputState: AgentState,
    startAgent: string,
    options: GraphOptions = {},
  ): AsyncGenerator<StreamEvent, AgentState, unknown> {
    const { threadId, checkpoint } = options;

    let state = inputState.clone();
    let currentAgent = startAgent;
    let iterations = 0;

    while (currentAgent && iterations < this.config.maxIterations) {
      yield {
        type: "agent_start",
        agentName: currentAgent,
        timestamp: Date.now(),
      };

      try {
        const agentFn = this.agents[currentAgent];
        if (!agentFn) {
          throw new Error(`Agent '${currentAgent}' not found`);
        }

        const messageCountBefore = state.messages.length;
        const result = await this.executeWithTimeout(
          agentFn(state),
          options.timeout || 30000,
        );

        if (result) {
          state = result;

          // Emit new messages
          for (let i = messageCountBefore; i < state.messages.length; i++) {
            yield {
              type: "message",
              agentName: currentAgent,
              message: state.messages[i],
              timestamp: Date.now(),
            };
          }

          currentAgent = state.getNextAgent();
        } else {
          currentAgent = state.getNextAgent();
        }

        yield {
          type: "agent_complete",
          agentName: currentAgent || "",
          timestamp: Date.now(),
        };

        // Save checkpoint
        if (checkpoint && threadId) {
          this.checkpointManager.saveCheckpoint(threadId, state);
        }

        iterations++;
      } catch (error) {
        yield {
          type: "error",
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        };
        throw error;
      }
    }

    yield {
      type: "complete",
      timestamp: Date.now(),
    };

    return state;
  }

  /**
   * Resume execution from a checkpoint
   */
  async resumeFromCheckpoint(
    threadId: string,
    checkpointId: string,
    forceAgent?: string,
  ): Promise<AgentState> {
    const state = this.checkpointManager.loadCheckpoint(threadId, checkpointId);
    if (!state) {
      throw new Error(
        `Checkpoint ${checkpointId} not found for thread ${threadId}`,
      );
    }

    const nextAgent = forceAgent || state.getNextAgent();
    if (!nextAgent) {
      throw new Error("No next agent specified in checkpoint");
    }

    return this.invoke(state, nextAgent, { threadId, checkpoint: true });
  }

  /**
   * Submit human feedback and continue execution
   */
  async submitHumanFeedback(
    threadId: string,
    checkpointId: string,
    feedback: { approved: boolean; message?: string },
  ): Promise<AgentState> {
    const state = this.checkpointManager.loadCheckpoint(threadId, checkpointId);
    if (!state) {
      throw new Error(
        `Checkpoint ${checkpointId} not found for thread ${threadId}`,
      );
    }

    const updatedState = state.approve(feedback.approved, feedback.message);
    this.checkpointManager.saveCheckpoint(threadId, updatedState);

    const nextAgent = updatedState.getNextAgent();
    if (!nextAgent || nextAgent === "__human__") {
      return updatedState;
    }

    return this.invoke(updatedState, nextAgent, { threadId, checkpoint: true });
  }

  /**
   * Create a new thread with initial state
   */
  createThread(threadId: string, initialState: AgentState): string {
    return this.checkpointManager.saveCheckpoint(threadId, initialState);
  }

  /**
   * Get thread history
   */
  getThreadHistory(threadId: string) {
    return this.checkpointManager.getCheckpoints(threadId);
  }

  /**
   * List all threads
   */
  listThreads(): string[] {
    return this.checkpointManager.listThreads();
  }

  /**
   * Delete a thread
   */
  deleteThread(threadId: string): boolean {
    return this.checkpointManager.deleteThread(threadId);
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeout: number,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Execution timeout")), timeout),
      ),
    ]);
  }
}

/**
 * Create a graph with conditional routing
 */
export function createRoutingGraph(
  agents: Record<string, AgentFunction>,
  routingFn: (state: AgentState) => string | null,
  config: ExecutorConfig = {},
): GraphExecutor {
  // Wrap agents to handle routing
  const wrappedAgents: Record<string, AgentFunction> = {};

  for (const [name, agent] of Object.entries(agents)) {
    wrappedAgents[name] = async (state: AgentState) => {
      const result = await agent(state);
      if (result) {
        const next = routingFn(result);
        result.setNextAgent(next);
      }
      return result;
    };
  }

  return new GraphExecutor(wrappedAgents, config);
}

/**
 * Create a graph with cycle detection and limits
 */
export function createCyclicGraph(
  agents: Record<string, AgentFunction>,
  config: ExecutorConfig = {},
): GraphExecutor {
  const visited = new Set<string>();

  const wrappedAgents: Record<string, AgentFunction> = {};

  for (const [name, agent] of Object.entries(agents)) {
    wrappedAgents[name] = async (state: AgentState) => {
      const path = state.getMetadata<string[]>("executionPath") || [];

      // Check for cycles
      const currentPath = [...path, name];
      const pathKey = currentPath.join("->");

      if (visited.has(pathKey)) {
        state.addMessage({
          role: "system",
          content: `Cycle detected at ${name}. Breaking cycle.`,
        });
        state.setNextAgent(null);
        return state;
      }

      visited.add(pathKey);
      state.setMetadata("executionPath", currentPath);

      const result = await agent(state);
      return result;
    };
  }

  return new GraphExecutor(wrappedAgents, config);
}

/**
 * Create a graph with parallel agent execution
 */
export function createParallelGraph(
  agents: Record<string, AgentFunction>,
  config: ExecutorConfig = {},
): GraphExecutor {
  // Add a special parallel executor agent
  const parallelAgent: AgentFunction = async (state: AgentState) => {
    const targets = state.getMetadata<string[]>("parallelTargets") || [];

    const results = await Promise.all(
      targets.map((name) => agents[name]?.(state.clone())),
    );

    // Merge results
    const mergedState = state.clone();
    for (const result of results) {
      if (result) {
        for (const msg of result.messages) {
          if (!mergedState.messages.some((m) => m.content === msg.content)) {
            mergedState.addMessage(msg);
          }
        }
      }
    }

    mergedState.setMetadata("parallelTargets", []);
    return mergedState;
  };

  return new GraphExecutor({ ...agents, __parallel__: parallelAgent }, config);
}
