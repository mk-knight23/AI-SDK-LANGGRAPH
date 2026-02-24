/**
 * Venture Planning Streaming Endpoint
 * POST /api/venture/stream - Stream venture planning events
 */

import { type RequestEvent } from '@sveltejs/kit';
import { GraphExecutor } from '$lib/graph';
import {
	initializeVentureState,
	ventureAgents,
} from '$lib/graphs/venture-plan';
import type { VentureIdea } from '$lib/types/venture';

// Shared executor for venture planning
const ventureExecutor = new GraphExecutor(ventureAgents, {
	maxIterations: 20,
	humanInTheLoop: true,
});

interface VentureStreamRequest {
	threadId: string;
	ventureIdea: VentureIdea;
	messages?: Array<{ role: string; content: string }>;
	resumeFromCheckpoint?: string;
	startAgent?: string;
	options?: {
		checkpoint?: boolean;
		timeout?: number;
	};
}

export async function POST({ request }: RequestEvent) {
	try {
		const body: VentureStreamRequest = await request.json();

		// Validate required fields
		if (!body.threadId || !body.ventureIdea) {
			return new Response(
				JSON.stringify({ error: 'threadId and ventureIdea are required' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
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
				return new Response(
					JSON.stringify({ error: 'Checkpoint not found' }),
					{ status: 404, headers: { 'Content-Type': 'application/json' } }
				);
			}
			startAgent = state.getNextAgent() || startAgent;
		} else {
			// Initialize new state
			state = initializeVentureState(body.ventureIdea, body.messages || []);
			ventureExecutor.createThread(body.threadId, state);
		}

		// Create streaming response
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				try {
					for await (const event of ventureExecutor.stream(state, startAgent, {
						threadId: body.threadId,
						checkpoint: body.options?.checkpoint ?? true,
						timeout: body.options?.timeout || 60000,
					})) {
						// Add stage information to event
						const enhancedEvent = {
							...event,
							stage: state.getMetadata('stage') || 'idea_validation',
							pendingApproval: state.isWaitingForApproval(),
						};
						controller.enqueue(
							encoder.encode(`data: ${JSON.stringify(enhancedEvent)}\n\n`)
						);
					}

					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
					controller.close();
				} catch (error) {
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({
								type: 'error',
								error: error instanceof Error ? error.message : String(error),
							})}\n\n`
						)
					);
					controller.close();
				}
			},
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			},
		});
	} catch (error) {
		return new Response(
			JSON.stringify({ error: 'Stream initialization failed' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}
