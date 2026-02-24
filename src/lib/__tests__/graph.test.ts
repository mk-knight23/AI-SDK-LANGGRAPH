import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { GraphExecutor, type StreamEvent } from "../graph";
import { AgentState } from "../state";

describe("GraphExecutor", () => {
  let executor: GraphExecutor;
  let mockAgents: Record<
    string,
    (state: AgentState) => Promise<AgentState | null>
  >;

  beforeEach(() => {
    mockAgents = {
      researcher: async (state: AgentState) => {
        state.addMessage({ role: "assistant", content: "Research done" });
        state.setNextAgent("writer");
        return state;
      },
      writer: async (state: AgentState) => {
        state.addMessage({ role: "assistant", content: "Content written" });
        state.setNextAgent(null);
        return state;
      },
      critic: async (state: AgentState) => {
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage.content.includes("reject")) {
          state.addMessage({ role: "assistant", content: "Needs revision" });
          state.setNextAgent("writer");
        } else {
          state.addMessage({ role: "assistant", content: "Approved" });
          state.setNextAgent(null);
        }
        return state;
      },
    };

    executor = new GraphExecutor(mockAgents);
  });

  describe("construction", () => {
    it("should initialize with provided agents", () => {
      expect(executor.agents).toEqual(mockAgents);
    });

    it("should create executor with empty checkpoint manager", () => {
      expect(executor.checkpointManager).toBeDefined();
    });
  });

  describe("invoke", () => {
    it("should execute single agent", async () => {
      const simpleAgent = {
        test: async (state: AgentState) => {
          state.addMessage({ role: "assistant", content: "Test response" });
          return state;
        },
      };

      const exec = new GraphExecutor(simpleAgent);
      const inputState = new AgentState();
      inputState.addMessage({ role: "user", content: "Hello" });

      const result = await exec.invoke(inputState, "test");

      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].content).toBe("Test response");
    });

    it("should execute linear chain of agents", async () => {
      const inputState = new AgentState();
      inputState.addMessage({ role: "user", content: "Write article" });

      const result = await executor.invoke(inputState, "researcher");

      expect(result.messages).toHaveLength(3); // user + researcher + writer
      expect(result.messages[1].content).toBe("Research done");
      expect(result.messages[2].content).toBe("Content written");
    });

    it("should handle cyclic execution with critic", async () => {
      const inputState = new AgentState();
      inputState.addMessage({ role: "user", content: "reject this" });

      const agents = {
        writer: async (state: AgentState) => {
          state.addMessage({ role: "assistant", content: "Draft written" });
          state.setNextAgent("critic");
          return state;
        },
        critic: mockAgents.critic,
      };

      const exec = new GraphExecutor(agents, { maxIterations: 5 });
      const result = await exec.invoke(inputState, "writer");

      expect(result.messages.length).toBeGreaterThan(2);
    });
  });

  describe("stream", () => {
    it("should emit events during execution", async () => {
      const inputState = new AgentState();
      inputState.addMessage({ role: "user", content: "Start" });

      const events: StreamEvent[] = [];

      for await (const event of executor.stream(inputState, "researcher")) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe("agent_start");
    });

    it("should include agent name in events", async () => {
      const inputState = new AgentState();
      inputState.addMessage({ role: "user", content: "Hello" });

      const events: StreamEvent[] = [];

      for await (const event of executor.stream(inputState, "researcher")) {
        events.push(event);
      }

      const firstAgentEvent = events.find((e) => e.type === "agent_start");
      expect(firstAgentEvent?.agentName).toBe("researcher");
    });

    it("should emit completion event", async () => {
      const inputState = new AgentState();
      inputState.addMessage({ role: "user", content: "Hello" });

      const events: StreamEvent[] = [];

      for await (const event of executor.stream(inputState, "researcher")) {
        events.push(event);
      }

      const completionEvent = events.find((e) => e.type === "complete");
      expect(completionEvent).toBeDefined();
    });
  });

  describe("checkpoint integration", () => {
    it("should save checkpoint after each agent", async () => {
      const inputState = new AgentState();
      inputState.addMessage({ role: "user", content: "Test" });

      const threadId = "test-thread-checkpoint";
      await executor.invoke(inputState, "researcher", {
        threadId,
        checkpoint: true,
      });

      const checkpoints = executor.checkpointManager.getCheckpoints(threadId);
      expect(checkpoints.length).toBeGreaterThan(0);
    });

    it("should resume from checkpoint", async () => {
      const inputState = new AgentState();
      inputState.addMessage({ role: "user", content: "Test" });

      const threadId = "test-thread-resume";
      await executor.invoke(inputState, "researcher", {
        threadId,
        checkpoint: true,
      });

      const latest = executor.checkpointManager.loadLatestCheckpoint(threadId);
      expect(latest).toBeDefined();
      // Should have user message + researcher message + writer message (chain of 2 agents)
      expect(latest?.messages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("human-in-the-loop", () => {
    it("should pause execution for human input", async () => {
      let pauseCalled = false;

      const agents = {
        agent: async (state: AgentState) => {
          pauseCalled = true;
          state.addMessage({
            role: "assistant",
            content: "Waiting for approval",
          });
          state.setNextAgent("__human__");
          return state;
        },
      };

      const exec = new GraphExecutor(agents);
      const inputState = new AgentState();
      inputState.addMessage({ role: "user", content: "Go" });

      const result = await exec.invoke(inputState, "agent", {
        waitForHuman: true,
      });

      expect(pauseCalled).toBe(true);
      expect(result.nextAgent).toBe("__human__");
    });

    it("should continue execution after human input", async () => {
      const agents = {
        agent1: async (state: AgentState) => {
          state.addMessage({ role: "assistant", content: "Step 1" });
          state.setNextAgent("__human__");
          return state;
        },
        agent2: async (state: AgentState) => {
          state.addMessage({ role: "assistant", content: "Step 2" });
          return state;
        },
      };

      const exec = new GraphExecutor(agents);
      const inputState = new AgentState();
      inputState.addMessage({ role: "user", content: "Start" });

      // First execution
      const result1 = await exec.invoke(inputState, "agent1", {
        waitForHuman: true,
      });

      // Human approves
      result1.setNextAgent("agent2");

      // Continue
      const result2 = await exec.invoke(result1, "agent2");

      expect(result2.messages).toHaveLength(3);
      expect(result2.messages[2].content).toBe("Step 2");
    });
  });

  describe("error handling", () => {
    it("should handle agent errors gracefully", async () => {
      const agents = {
        failing: async () => {
          throw new Error("Agent failed");
        },
      };

      const exec = new GraphExecutor(agents);
      const inputState = new AgentState();

      await expect(exec.invoke(inputState, "failing")).rejects.toThrow(
        "Agent failed",
      );
    });

    it("should include error in stream events", async () => {
      const agents = {
        failing: async () => {
          throw new Error("Stream error");
        },
      };

      const exec = new GraphExecutor(agents);
      const inputState = new AgentState();

      const events: StreamEvent[] = [];

      try {
        for await (const event of exec.stream(inputState, "failing")) {
          events.push(event);
        }
      } catch (e) {
        // Expected
      }

      const errorEvent = events.find((e) => e.type === "error");
      expect(errorEvent).toBeDefined();
    });
  });

  describe("execution options", () => {
    it("should respect max iterations limit", async () => {
      let iterations = 0;
      const agents = {
        loop: async (state: AgentState) => {
          iterations++;
          state.addMessage({
            role: "assistant",
            content: `Iter ${iterations}`,
          });
          state.setNextAgent("loop");
          return state;
        },
      };

      const exec = new GraphExecutor(agents, { maxIterations: 3 });
      const inputState = new AgentState();

      const result = await exec.invoke(inputState, "loop");

      expect(iterations).toBeLessThanOrEqual(3);
    });

    it("should support timeout", async () => {
      const agents = {
        slow: async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const state = new AgentState();
          return state;
        },
      };

      const exec = new GraphExecutor(agents);
      const inputState = new AgentState();

      await expect(
        exec.invoke(inputState, "slow", { timeout: 100 }),
      ).rejects.toThrow();
    });
  });
});

describe("StreamEvent", () => {
  it("should create agent_start event", () => {
    const event: StreamEvent = {
      type: "agent_start",
      agentName: "test-agent",
      timestamp: Date.now(),
    };
    expect(event.type).toBe("agent_start");
  });

  it("should create agent_complete event", () => {
    const event: StreamEvent = {
      type: "agent_complete",
      agentName: "test-agent",
      timestamp: Date.now(),
    };
    expect(event.type).toBe("agent_complete");
  });

  it("should create message event", () => {
    const event: StreamEvent = {
      type: "message",
      agentName: "test-agent",
      message: { role: "assistant", content: "Hello" },
      timestamp: Date.now(),
    };
    expect(event.type).toBe("message");
  });
});
