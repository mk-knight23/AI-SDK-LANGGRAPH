import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
	AgentState,
	Annotation,
	createAgentGraph,
	createHumanInTheLoopGraph,
	createCyclicWorkflowGraph,
	CheckpointManager
} from '../state';

describe('AgentState', () => {
	let state: AgentState;

	beforeEach(() => {
		state = new AgentState();
	});

	describe('initialization', () => {
		it('should initialize with empty messages array', () => {
			expect(state.messages).toEqual([]);
		});

		it('should initialize with null next agent', () => {
			expect(state.nextAgent).toBeNull();
		});
	});

	describe('message management', () => {
		it('should add message to state', () => {
			state.addMessage({ role: 'user', content: 'Hello' });
			expect(state.messages).toHaveLength(1);
			expect(state.messages[0]).toEqual({ role: 'user', content: 'Hello' });
		});

		it('should retrieve all messages', () => {
			state.addMessage({ role: 'user', content: 'Hello' });
			state.addMessage({ role: 'assistant', content: 'Hi there!' });
			const messages = state.getMessages();
			expect(messages).toHaveLength(2);
		});
	});

	describe('agent routing', () => {
		it('should set next agent', () => {
			state.setNextAgent('researcher');
			expect(state.nextAgent).toBe('researcher');
		});

		it('should get next agent', () => {
			state.setNextAgent('critic');
			expect(state.getNextAgent()).toBe('critic');
		});
	});

	describe('checkpoint serialization', () => {
		it('should serialize to JSON', () => {
			state.addMessage({ role: 'user', content: 'Test' });
			state.setNextAgent('agent1');
			const serialized = state.serialize();
			expect(serialized).toBeDefined();
			expect(JSON.parse(serialized)).toEqual({
				messages: [{ role: 'user', content: 'Test' }],
				nextAgent: 'agent1',
				version: 1
			});
		});

		it('should deserialize from JSON', () => {
			const json = JSON.stringify({
				messages: [{ role: 'user', content: 'Test' }],
				nextAgent: 'agent1',
				version: 1
			});
			const deserialized = AgentState.deserialize(json);
			expect(deserialized.messages).toEqual([{ role: 'user', content: 'Test' }]);
			expect(deserialized.nextAgent).toBe('agent1');
		});
	});
});

describe('Annotation', () => {
	it('should create annotation with default value', () => {
		const annotation = Annotation<number>({ default: 0 });
		expect(annotation).toBeDefined();
	});

	it('should create annotation with reducer', () => {
		const annotation = Annotation<number[]>({
			default: [],
			reducer: (a, b) => [...a, ...b]
		});
		expect(annotation).toBeDefined();
	});
});

describe('CheckpointManager', () => {
	let manager: CheckpointManager;
	const mockThreadId = 'test-thread-123';

	beforeEach(() => {
		manager = new CheckpointManager();
	});

	describe('saveCheckpoint', () => {
		it('should save state checkpoint', () => {
			const state = new AgentState();
			state.addMessage({ role: 'user', content: 'Test message' });

			const checkpointId = manager.saveCheckpoint(mockThreadId, state);
			expect(checkpointId).toBeDefined();
			expect(typeof checkpointId).toBe('string');
		});

		it('should generate unique checkpoint IDs', () => {
			const state = new AgentState();
			const id1 = manager.saveCheckpoint(mockThreadId, state);
			const id2 = manager.saveCheckpoint(mockThreadId, state);
			expect(id1).not.toBe(id2);
		});

		it('should return checkpoint list for thread', () => {
			const state = new AgentState();
			state.addMessage({ role: 'user', content: 'Message 1' });
			manager.saveCheckpoint(mockThreadId, state);

			state.addMessage({ role: 'assistant', content: 'Response 1' });
			manager.saveCheckpoint(mockThreadId, state);

			const checkpoints = manager.getCheckpoints(mockThreadId);
			expect(checkpoints).toHaveLength(2);
		});
	});

	describe('loadCheckpoint', () => {
		it('should load saved checkpoint', () => {
			const state = new AgentState();
			state.addMessage({ role: 'user', content: 'Original message' });
			state.setNextAgent('agent2');

			const checkpointId = manager.saveCheckpoint(mockThreadId, state);
			const loaded = manager.loadCheckpoint(mockThreadId, checkpointId);

			expect(loaded).toBeDefined();
			expect(loaded?.messages).toEqual([{ role: 'user', content: 'Original message' }]);
			expect(loaded?.nextAgent).toBe('agent2');
		});

		it('should return null for non-existent checkpoint', () => {
			const loaded = manager.loadCheckpoint('non-existent-thread', 'non-existent-id');
			expect(loaded).toBeNull();
		});
	});

	describe('loadLatestCheckpoint', () => {
		it('should load most recent checkpoint', () => {
			const state = new AgentState();

			state.addMessage({ role: 'user', content: 'First' });
			manager.saveCheckpoint(mockThreadId, state);

			state.addMessage({ role: 'user', content: 'Second' });
			const latestId = manager.saveCheckpoint(mockThreadId, state);

			const loaded = manager.loadLatestCheckpoint(mockThreadId);
			expect(loaded).toBeDefined();
			expect(loaded?.messages).toHaveLength(2);
		});

		it('should return null for thread with no checkpoints', () => {
			const loaded = manager.loadLatestCheckpoint('empty-thread');
			expect(loaded).toBeNull();
		});
	});

	describe('listThreads', () => {
		it('should return list of thread IDs', () => {
			const state = new AgentState();
			manager.saveCheckpoint('thread-1', state);
			manager.saveCheckpoint('thread-2', state);
			manager.saveCheckpoint('thread-3', state);

			const threads = manager.listThreads();
			expect(threads).toHaveLength(3);
			expect(threads).toContain('thread-1');
			expect(threads).toContain('thread-2');
			expect(threads).toContain('thread-3');
		});
	});

	describe('deleteThread', () => {
		it('should delete thread and all checkpoints', () => {
			const state = new AgentState();
			manager.saveCheckpoint(mockThreadId, state);

			const deleted = manager.deleteThread(mockThreadId);
			expect(deleted).toBe(true);

			const checkpoints = manager.getCheckpoints(mockThreadId);
			expect(checkpoints).toHaveLength(0);
		});

		it('should return false for non-existent thread', () => {
			const deleted = manager.deleteThread('non-existent-thread');
			expect(deleted).toBe(false);
		});
	});
});

describe('createAgentGraph', () => {
	it('should create graph with multiple agents', () => {
		const agents = {
			researcher: async (state: AgentState) => {
				state.addMessage({ role: 'assistant', content: 'Research complete' });
				return state;
			},
			Writer: async (state: AgentState) => {
				state.addMessage({ role: 'assistant', content: 'Content written' });
				return state;
			}
		};

		const graph = createAgentGraph(agents);
		expect(graph).toBeDefined();
		expect(graph.agents).toEqual(agents);
	});

	it('should execute single agent graph', async () => {
		const agents = {
			simple: async (state: AgentState) => {
				state.addMessage({ role: 'assistant', content: 'Response' });
				return state;
			}
		};

		const graph = createAgentGraph(agents);
		const inputState = new AgentState();
		inputState.addMessage({ role: 'user', content: 'Input' });

		const result = await graph.invoke(inputState, 'simple');
		expect(result.messages).toHaveLength(2);
	});
});

describe('createCyclicWorkflowGraph', () => {
	it('should create graph with conditional routing', () => {
		const graph = createCyclicWorkflowGraph({
			maxIterations: 3
		});
		expect(graph).toBeDefined();
	});

	it('should handle iteration limits', async () => {
		let counter = 0;
		const agents = {
			process: async (state: AgentState) => {
				counter++;
				state.addMessage({ role: 'assistant', content: `Iteration ${counter}` });
				return counter >= 3 ? state : null; // Signal completion
			}
		};

		const graph = createCyclicWorkflowGraph({ maxIterations: 3 });
		const inputState = new AgentState();

		const result = await graph.invoke(inputState, 'process');
		expect(result).toBeDefined();
	});
});

describe('createHumanInTheLoopGraph', () => {
	it('should create graph with human approval points', () => {
		const graph = createHumanInTheLoopGraph();
		expect(graph).toBeDefined();
	});

	it('should wait for human input before continuing', async () => {
		let approvalReceived = false;

		const graph = createHumanInTheLoopGraph();

		const inputState = new AgentState();
		inputState.addMessage({ role: 'user', content: 'Generate report' });

		const result = await graph.invoke(inputState, 'agent');

		expect(result).toBeDefined();
	});

	it('should handle human rejection and retries', async () => {
		const graph = createHumanInTheLoopGraph();

		const inputState = new AgentState();
		inputState.addMessage({ role: 'user', content: 'Create proposal' });

		const result = await graph.invokeWithFeedback(inputState, 'agent', {
			approved: false,
			feedback: 'Needs more detail'
		});

		expect(result).toBeDefined();
	});
});
