/**
 * API endpoint for streaming LangGraph execution
 * POST /api/graph/stream - Stream graph execution events
 */

import { type RequestEvent } from '@sveltejs/kit';
import { GraphExecutor } from '$lib/graph';
import { AgentState, createResearchWorkflow } from '$lib/agents';

// Predefined workflow
const researchAgents = createResearchWorkflow();
const executor = new GraphExecutor(researchAgents, { maxIterations: 10 });

interface StreamRequest {
	threadId: string;
	startAgent: string;
	messages: Array<{ role: string; content: string }>;
	options?: {
		checkpoint?: boolean;
		timeout?: number;
	};
}

export async function POST({ request }: RequestEvent) {
	try {
		const body: StreamRequest = await request.json();

		// Validate required fields
		if (!body.threadId || !body.startAgent) {
			return new Response(
				JSON.stringify({ error: 'threadId and startAgent are required' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}

		// Create initial state
		const state = new AgentState();
		for (const msg of body.messages || []) {
			state.addMessage({
				role: msg.role as 'user' | 'assistant' | 'system',
				content: msg.content
			});
		}

		// Create streaming response
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			async start(controller) {
				try {
					for await (const event of executor.stream(state, body.startAgent, {
						threadId: body.threadId,
						checkpoint: body.options?.checkpoint ?? true,
						timeout: body.options?.timeout
					})) {
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
					}

					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
					controller.close();
				} catch (error) {
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({
								type: 'error',
								error: error instanceof Error ? error.message : String(error)
							})}\n\n`
						)
					);
					controller.close();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive'
			}
		});
	} catch (error) {
		return new Response(
			JSON.stringify({ error: 'Stream initialization failed' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
}
