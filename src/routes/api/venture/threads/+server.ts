/**
 * Venture Planning Threads Endpoint
 * GET /api/venture/threads - List venture planning threads
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { GraphExecutor } from '$lib/graph';
import { ventureAgents } from '$lib/graphs/venture-plan';
import type { ThreadInfo } from '$lib/types';

// Shared executor for venture planning
const ventureExecutor = new GraphExecutor(ventureAgents, {
	maxIterations: 20,
	humanInTheLoop: true,
});

export async function GET({ request }: RequestEvent) {
	try {
		const allThreads = ventureExecutor.listThreads();
		const threads: ThreadInfo[] = [];

		// Get info for each thread
		for (const threadId of allThreads) {
			const checkpoints = ventureExecutor.checkpointManager.getCheckpoints(threadId);
			const latest = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : null;

			if (latest) {
				const state = ventureExecutor.checkpointManager.loadCheckpoint(threadId, latest.id);
				if (state) {
					threads.push({
						id: threadId,
						createdAt: latest.timestamp,
						messageCount: state.messages.length,
						updatedAt: latest.timestamp,
					});
				}
			}
		}

		// Sort by updated time (newest first)
		threads.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

		return json({
			success: true,
			threads,
			total: threads.length,
		});
	} catch (error) {
		console.error('Threads list error:', error);
		return json(
			{
				success: false,
				error: 'Failed to list threads',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
}

// DELETE endpoint to delete a thread
export async function DELETE({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const { threadId } = body;

		if (!threadId) {
			return json(
				{ success: false, error: 'threadId is required' },
				{ status: 400 }
			);
		}

		const deleted = ventureExecutor.deleteThread(threadId);

		if (deleted) {
			return json({
				success: true,
				message: 'Thread deleted successfully',
			});
		} else {
			return json(
				{ success: false, error: 'Thread not found' },
				{ status: 404 }
			);
		}
	} catch (error) {
		console.error('Thread deletion error:', error);
		return json(
			{
				success: false,
				error: 'Failed to delete thread',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
}
