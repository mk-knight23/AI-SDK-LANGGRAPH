/**
 * Venture Planning API Endpoint
 * POST /api/venture/plan - Execute venture planning workflow
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { GraphExecutor } from '$lib/graph';
import {
	initializeVentureState,
	ventureAgents,
	getAgentForStage,
} from '$lib/graphs/venture-plan';
import type { VenturePlanResponse, VentureIdea } from '$lib/types/venture';
import { OPENAI_API_KEY } from '$env/static/private';

if (!OPENAI_API_KEY) {
	console.warn('OPENAI_API_KEY not set - venture planning will fail');
}

// Shared executor for venture planning
const ventureExecutor = new GraphExecutor(ventureAgents, {
	maxIterations: 20,
	humanInTheLoop: true,
});

interface VenturePlanRequest {
	threadId: string;
	ventureIdea: VentureIdea;
	messages?: Array<{ role: string; content: string }>;
	resumeFromCheckpoint?: string;
	startAgent?: string;
	options?: {
		checkpoint?: boolean;
		waitForHuman?: boolean;
		timeout?: number;
	};
}

export async function POST({ request }: RequestEvent) {
	try {
		const body: VenturePlanRequest = await request.json();

		// Validate required fields
		if (!body.threadId) {
			return json(
				{ success: false, error: 'threadId is required' },
				{ status: 400 }
			);
		}

		if (!body.ventureIdea) {
			return json(
				{ success: false, error: 'ventureIdea is required' },
				{ status: 400 }
			);
		}

		// Validate venture idea
		if (
			!body.ventureIdea.title ||
			!body.ventureIdea.description ||
			!body.ventureIdea.industry ||
			!body.ventureIdea.targetMarket ||
			!body.ventureIdea.businessModel
		) {
			return json(
				{
					success: false,
					error: 'ventureIdea must include title, description, industry, targetMarket, and businessModel',
				},
				{ status: 400 }
			);
		}

		let state;
		let startAgent = body.startAgent || 'idea_validator';

		// Resume from checkpoint if specified
		if (body.resumeFromCheckpoint) {
			state = ventureExecutor.checkpointManager.loadCheckpoint(
				body.threadId,
				body.resumeFromCheckpoint
			);
			if (!state) {
				return json(
					{ success: false, error: 'Checkpoint not found' },
					{ status: 404 }
				);
			}
			startAgent = state.getNextAgent() || startAgent;
		} else {
			// Initialize new state
			state = initializeVentureState(body.ventureIdea, body.messages || []);
		}

		// Create thread if new
		if (!body.resumeFromCheckpoint) {
			ventureExecutor.createThread(body.threadId, state);
		}

		// Execute graph
		const result = await ventureExecutor.invoke(state, startAgent, {
			threadId: body.threadId,
			checkpoint: body.options?.checkpoint ?? true,
			waitForHuman: body.options?.waitForHuman ?? true,
			timeout: body.options?.timeout || 60000,
		});

		// Get latest checkpoint ID
		const checkpoints = ventureExecutor.checkpointManager.getCheckpoints(body.threadId);
		const checkpointId = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].id : undefined;

		// Build response
		const response: VenturePlanResponse = {
			success: true,
			stage: result.getMetadata('stage') || 'idea_validation',
			venturePlan: {
				stage: result.getMetadata('stage') || 'idea_validation',
				ventureIdea: body.ventureIdea,
				messages: result.messages,
				nextAgent: result.getNextAgent(),
				pendingApproval: result.isWaitingForApproval(),
				approvalHistory: [],
			},
			nextAgent: result.getNextAgent(),
			pausedForApproval: result.isWaitingForApproval(),
			threadId: body.threadId,
			checkpointId,
		};

		return json(response);
	} catch (error) {
		console.error('Venture planning error:', error);
		return json(
			{
				success: false,
				error: 'Venture planning failed',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
}

// GET endpoint to check workflow status
export async function GET({ url }: RequestEvent) {
	try {
		const threadId = url.searchParams.get('threadId');

		if (!threadId) {
			return json(
				{ success: false, error: 'threadId is required' },
				{ status: 400 }
			);
		}

		const latestCheckpoint = ventureExecutor.checkpointManager.loadLatestCheckpoint(threadId);

		if (!latestCheckpoint) {
			return json(
				{ success: false, error: 'Thread not found' },
				{ status: 404 }
			);
		}

		const checkpoints = ventureExecutor.checkpointManager.getCheckpoints(threadId);

		return json({
			success: true,
			stage: latestCheckpoint.getMetadata('stage') || 'idea_validation',
			venturePlan: {
				stage: latestCheckpoint.getMetadata('stage') || 'idea_validation',
				messages: latestCheckpoint.messages,
				nextAgent: latestCheckpoint.getNextAgent(),
				pendingApproval: latestCheckpoint.isWaitingForApproval(),
				approvalHistory: [],
			},
			nextAgent: latestCheckpoint.getNextAgent(),
			pausedForApproval: latestCheckpoint.isWaitingForApproval(),
			threadId,
			checkpointCount: checkpoints.length,
			latestCheckpointId: checkpoints[checkpoints.length - 1].id,
		});
	} catch (error) {
		console.error('Status check error:', error);
		return json(
			{
				success: false,
				error: 'Status check failed',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
}
