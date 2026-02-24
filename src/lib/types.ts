/**
 * Shared TypeScript types for LangGraph application
 */

export interface Message {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp?: number;
}

export interface StreamEvent {
	type: 'agent_start' | 'agent_complete' | 'message' | 'error' | 'complete';
	agentName?: string;
	message?: Message;
	error?: string;
	timestamp: number;
}

export interface ThreadInfo {
	id: string;
	createdAt: number;
	messageCount: number;
	updatedAt?: number;
}

export interface CheckpointInfo {
	id: string;
	threadId: string;
	timestamp: number;
}

export interface GraphExecutionResult {
	messages: Message[];
	nextAgent: string | null;
	threadId: string;
	checkpointId?: string;
	pausedForHuman?: boolean;
}

export interface WorkflowConfig {
	name: string;
	description: string;
	agents: string[];
	entryPoint: string;
}

export interface AgentStatus {
	name: string;
	status: 'idle' | 'running' | 'completed' | 'error';
	startTime?: number;
	endTime?: number;
}
