/**
 * API endpoint for checkpoint management
 * GET /api/graph/checkpoint?threadId={id} - List checkpoints
 * POST /api/graph/checkpoint/restore - Restore from checkpoint
 * DELETE /api/graph/checkpoint - Delete thread
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { GraphExecutor } from '$lib/graph';
import { createResearchWorkflow } from '$lib/agents';

// Shared executor for checkpoint management
const researchAgents = createResearchWorkflow();
const executor = new GraphExecutor(researchAgents);

// GET - List checkpoints for a thread
export async function GET({ url }: RequestEvent) {
	const threadId = url.searchParams.get('threadId');

	if (!threadId) {
		return json({ error: 'threadId is required' }, { status: 400 });
	}

	const checkpoints = executor.checkpointManager.getCheckpoints(threadId);

	return json({
		threadId,
		checkpoints: checkpoints.map((cp) => ({
			id: cp.id,
			timestamp: cp.timestamp
		})),
		count: checkpoints.length
	});
}

// POST - Restore from checkpoint or submit human feedback
export async function POST({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const { threadId, checkpointId, action, feedback } = body;

		if (!threadId || !checkpointId) {
			return json({ error: 'threadId and checkpointId are required' }, { status: 400 });
		}

		if (action === 'restore') {
			// Restore and continue execution
			const forceAgent = body.forceAgent;
			const result = await executor.resumeFromCheckpoint(threadId, checkpointId, forceAgent);

			return json({
				messages: result.messages,
				nextAgent: result.getNextAgent()
			});
		}

		if (action === 'feedback') {
			// Submit human feedback
			const result = await executor.submitHumanFeedback(threadId, checkpointId, {
				approved: feedback.approved,
				message: feedback.message
			});

			return json({
				messages: result.messages,
				nextAgent: result.getNextAgent(),
				approvalCount: result.approvalCount
			});
		}

		return json({ error: 'Unknown action' }, { status: 400 });
	} catch (error) {
		return json(
			{
				error: 'Checkpoint operation failed',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}

// DELETE - Delete a thread
export async function DELETE({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const { threadId } = body;

		if (!threadId) {
			return json({ error: 'threadId is required' }, { status: 400 });
		}

		const deleted = executor.deleteThread(threadId);

		return json({ success: deleted });
	} catch (error) {
		return json(
			{
				error: 'Delete operation failed',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}
