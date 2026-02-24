/**
 * State management for LangGraph multi-agent workflows
 * Supports serialization for checkpointing and persistence
 */

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

export interface StateAnnotation<T = any> {
  default?: T;
  reducer?: (current: T, update: T) => T;
}

/**
 * Annotation helper for defining state schema
 * Similar to LangGraph's Annotation API
 */
export function Annotation<T>(
  config: StateAnnotation<T> = {},
): StateAnnotation<T> {
  return {
    default: config.default,
    reducer: config.reducer || ((_: T, update: T) => update),
  };
}

/**
 * AgentState represents the state that flows through the graph
 * LangGraph uses mutable state updates, so we follow that pattern
 */
export class AgentState {
  public readonly version = 1;
  public messages: Message[] = [];
  public nextAgent: string | null = null;
  public metadata: Record<string, any> = {};

  // Approval state for human-in-the-loop
  public pendingApproval: boolean = false;
  public approvalCount: number = 0;
  public maxApprovals: number = 3;

  constructor(initialState?: Partial<AgentState>) {
    if (initialState) {
      this.messages = initialState.messages || [];
      this.nextAgent = initialState.nextAgent || null;
      this.metadata = initialState.metadata || {};
      this.pendingApproval = initialState.pendingApproval || false;
      this.approvalCount = initialState.approvalCount || 0;
      this.maxApprovals = initialState.maxApprovals || 3;
    }
  }

  /**
   * Add a message to the conversation history
   */
  addMessage(message: Message): this {
    const newMessage = {
      ...message,
      timestamp: message.timestamp || Date.now(),
    };
    this.messages.push(newMessage);
    return this;
  }

  /**
   * Get all messages
   */
  getMessages(): readonly Message[] {
    return this.messages;
  }

  /**
   * Set the next agent to execute
   */
  setNextAgent(agent: string | null): this {
    this.nextAgent = agent;
    return this;
  }

  /**
   * Get the next agent to execute
   */
  getNextAgent(): string | null {
    return this.nextAgent;
  }

  /**
   * Set metadata field
   */
  setMetadata(key: string, value: any): this {
    this.metadata[key] = value;
    return this;
  }

  /**
   * Get metadata field
   */
  getMetadata<T = any>(key: string): T | undefined {
    return this.metadata[key];
  }

  /**
   * Request human approval
   */
  requestApproval(): this {
    this.pendingApproval = true;
    this.nextAgent = "__human__";
    return this;
  }

  /**
   * Check if waiting for human approval
   */
  isWaitingForApproval(): boolean {
    return this.pendingApproval;
  }

  /**
   * Approve and continue
   */
  approve(approved: boolean, feedback?: string): this {
    this.pendingApproval = false;
    this.approvalCount++;

    if (feedback) {
      this.messages.push({
        role: "user",
        content: `Feedback: ${feedback}`,
        timestamp: Date.now(),
      });
    }

    if (approved) {
      this.nextAgent = null; // Continue to next in flow
    } else if (this.approvalCount >= this.maxApprovals) {
      this.nextAgent = null; // Max retries reached, continue anyway
    }

    return this;
  }

  /**
   * Serialize state to JSON for storage
   */
  serialize(): string {
    return JSON.stringify({
      version: this.version,
      messages: this.messages,
      nextAgent: this.nextAgent,
      metadata: this.metadata,
      pendingApproval: this.pendingApproval,
      approvalCount: this.approvalCount,
      maxApprovals: this.maxApprovals,
    });
  }

  /**
   * Deserialize state from JSON
   */
  static deserialize(json: string): AgentState {
    const data = JSON.parse(json);
    return new AgentState({
      messages: data.messages || [],
      nextAgent: data.nextAgent || null,
      metadata: data.metadata || {},
      pendingApproval: data.pendingApproval || false,
      approvalCount: data.approvalCount || 0,
      maxApprovals: data.maxApprovals || 3,
    });
  }

  /**
   * Create a copy of the state
   */
  clone(): AgentState {
    return new AgentState({
      messages: [...this.messages],
      nextAgent: this.nextAgent,
      metadata: { ...this.metadata },
      pendingApproval: this.pendingApproval,
      approvalCount: this.approvalCount,
      maxApprovals: this.maxApprovals,
    });
  }
}

/**
 * Checkpoint data structure
 */
export interface Checkpoint {
  id: string;
  threadId: string;
  timestamp: number;
  state: string; // Serialized AgentState
}

/**
 * Manages checkpoints for state persistence
 * In production, this would use a database
 */
export class CheckpointManager {
  private checkpoints: Map<string, Checkpoint[]> = new Map();
  private threadIndex: Map<string, string[]> = new Map(); // threadId -> checkpointIds

  /**
   * Save a checkpoint for a thread
   */
  saveCheckpoint(threadId: string, state: AgentState): string {
    const checkpointId = `ckpt-${threadId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const checkpoint: Checkpoint = {
      id: checkpointId,
      threadId,
      timestamp: Date.now(),
      state: state.serialize(),
    };

    if (!this.checkpoints.has(threadId)) {
      this.checkpoints.set(threadId, []);
    }
    this.checkpoints.get(threadId)!.push(checkpoint);

    if (!this.threadIndex.has(threadId)) {
      this.threadIndex.set(threadId, []);
    }
    this.threadIndex.get(threadId)!.push(checkpointId);

    return checkpointId;
  }

  /**
   * Load a specific checkpoint
   */
  loadCheckpoint(threadId: string, checkpointId: string): AgentState | null {
    const checkpoints = this.checkpoints.get(threadId);
    if (!checkpoints) return null;

    const checkpoint = checkpoints.find((c) => c.id === checkpointId);
    if (!checkpoint) return null;

    return AgentState.deserialize(checkpoint.state);
  }

  /**
   * Load the most recent checkpoint for a thread
   */
  loadLatestCheckpoint(threadId: string): AgentState | null {
    const checkpoints = this.checkpoints.get(threadId);
    if (!checkpoints || checkpoints.length === 0) return null;

    const latest = checkpoints[checkpoints.length - 1];
    return AgentState.deserialize(latest.state);
  }

  /**
   * Get all checkpoints for a thread
   */
  getCheckpoints(threadId: string): Checkpoint[] {
    return this.checkpoints.get(threadId) || [];
  }

  /**
   * List all thread IDs
   */
  listThreads(): string[] {
    return Array.from(this.checkpoints.keys());
  }

  /**
   * Delete a thread and all its checkpoints
   */
  deleteThread(threadId: string): boolean {
    const deleted = this.checkpoints.delete(threadId);
    this.threadIndex.delete(threadId);
    return deleted;
  }

  /**
   * Clear all checkpoints (for testing)
   */
  clear(): void {
    this.checkpoints.clear();
    this.threadIndex.clear();
  }

  /**
   * Get checkpoint count for a thread
   */
  getCheckpointCount(threadId: string): number {
    return this.checkpoints.get(threadId)?.length || 0;
  }
}

/**
 * Type for agent function
 */
export type AgentFunction = (state: AgentState) => Promise<AgentState | null>;

/**
 * Type for routing function
 */
export type RoutingFunction = (state: AgentState) => string | null;

/**
 * Configuration for creating graphs
 */
export interface GraphConfig {
  maxIterations?: number;
  checkpointEnabled?: boolean;
  humanInTheLoop?: boolean;
}

/**
 * Create a basic multi-agent graph
 */
export function createAgentGraph(
  agents: Record<string, AgentFunction>,
  config: GraphConfig = {},
) {
  return {
    agents,
    config: {
      maxIterations: config.maxIterations || 10,
      checkpointEnabled: config.checkpointEnabled ?? true,
      humanInTheLoop: config.humanInTheLoop ?? false,
    },
    async invoke(
      inputState: AgentState,
      startAgent: string,
    ): Promise<AgentState> {
      const executor = await import("./graph").then(
        (m) => new m.GraphExecutor(agents, config),
      );
      return executor.invoke(inputState, startAgent);
    },
  };
}

/**
 * Create a graph with cyclic workflow support
 */
export function createCyclicWorkflowGraph(config: GraphConfig = {}) {
  return {
    config: {
      maxIterations: config.maxIterations || 3,
      checkpointEnabled: config.checkpointEnabled ?? true,
    },
    async invoke(
      inputState: AgentState,
      startAgent: string,
    ): Promise<AgentState> {
      // Create a simple loop agent for demonstration
      const agents: Record<string, AgentFunction> = {
        [startAgent]: async (state: AgentState) => {
          const iterations = state.getMetadata<number>("iterations") || 0;
          if (iterations >= (config.maxIterations || 3)) {
            state.addMessage({
              role: "assistant",
              content: "Workflow complete",
            });
            state.setNextAgent(null);
          } else {
            state.setMetadata("iterations", iterations + 1);
            state.addMessage({
              role: "assistant",
              content: `Iteration ${iterations + 1}`,
            });
            state.setNextAgent(startAgent);
          }
          return state;
        },
      };

      const executor = await import("./graph").then(
        (m) => new m.GraphExecutor(agents, config),
      );
      return executor.invoke(inputState, startAgent);
    },
  };
}

/**
 * Create a graph with human-in-the-loop approval points
 */
export function createHumanInTheLoopGraph(config: GraphConfig = {}) {
  return {
    config: {
      maxIterations: config.maxIterations || 10,
      humanInTheLoop: true,
    },
    async invoke(
      inputState: AgentState,
      startAgent: string,
    ): Promise<AgentState> {
      const agents: Record<string, AgentFunction> = {
        [startAgent]: async (state: AgentState) => {
          state.addMessage({
            role: "assistant",
            content: "Action completed, awaiting approval",
          });
          return state.requestApproval();
        },
      };

      const executor = await import("./graph").then(
        (m) => new m.GraphExecutor(agents, { ...config, humanInTheLoop: true }),
      );
      return executor.invoke(inputState, startAgent);
    },
    async invokeWithFeedback(
      inputState: AgentState,
      startAgent: string,
      feedback: { approved: boolean; feedback?: string },
    ): Promise<AgentState> {
      const result = await this.invoke(inputState, startAgent);
      return result.approve(feedback.approved, feedback.feedback);
    },
  };
}
