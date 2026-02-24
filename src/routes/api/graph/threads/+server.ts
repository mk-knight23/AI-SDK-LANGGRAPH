/**
 * API endpoint for thread management
 * GET /api/graph/threads - List all threads
 * POST /api/graph/threads - Create a new thread
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { GraphExecutor } from '$lib/graph';
import { createResearchWorkflow } from '$lib/agents';

// Shared executor for thread management
const researchAgents = createResearchWorkflow();
const executor = new GraphExecutor(researchAgents);

// Thread metadata storage (in production, use a database)
const threadMetadata = new Map<string, { createdAt: number; updatedAt: number; messageCount: number }>();

export async function GET() {
	const threads = Array.from(threadMetadata.entries()).map(([id, meta]) => ({
		id,
		createdAt: meta.createdAt,
		updatedAt: meta.updatedAt,
		messageCount: meta.messageCount
	}));

	// Sort by most recently updated
	threads.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));

	return json({ threads });
}

export async function POST({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const threadId = body.threadId || `thread-${Date.now()}`;

		if (!threadMetadata.has(threadId)) {
			threadMetadata.set(threadId, {
				createdAt: Date.now(),
				updatedAt: Date.now(),
				messageCount: 0
			});
		}

		const thread = threadMetadata.get(threadId)!;

		return json({
			id: threadId,
			createdAt: thread.createdAt,
			updatedAt: thread.updatedAt,
			messageCount: thread.messageCount
		});
	} catch (error) {
		return json({ error: 'Failed to create thread' }, { status: 500 });
	}
}
