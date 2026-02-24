/**
 * Venture Planning Approval Endpoint
 * POST /api/venture/approve - Submit human approval for next stage
 */

import { json, type RequestEvent } from '@sveltejs/kit';
import { GraphExecutor } from '$lib/graph';
import { ventureAgents } from '$lib/graphs/venture-plan';
import type { ApprovalRequest, VenturePlanResponse } from '$lib/types/venture';

// Shared executor for venture planning
const ventureExecutor = new GraphExecutor(ventureAgents, {
	maxIterations: 20,
	humanInTheLoop: true,
});

export async function POST({ request }: RequestEvent) {
	try {
		const body: ApprovalRequest = await request.json();

		// Validate required fields
		if (!body.threadId) {
			return json(
				{ success: false, error: 'threadId is required' },
				{ status: 400 }
			);
		}

		if (typeof body.approved !== 'boolean') {
			return json(
				{ success: false, error: 'approved boolean is required' },
				{ status: 400 }
			);
		}

		// Get current checkpoint
		const checkpoints = ventureExecutor.checkpointManager.getCheckpoints(body.threadId);
		if (checkpoints.length === 0) {
			return json(
				{ success: false, error: 'No checkpoints found for thread' },
				{ status: 404 }
			);
		}

		const currentCheckpointId = checkpoints[checkpoints.length - 1].id;
		const state = ventureExecutor.checkpointManager.loadCheckpoint(
			body.threadId,
			currentCheckpointId
		);

		if (!state) {
			return json(
				{ success: false, error: 'Failed to load checkpoint' },
				{ status: 500 }
			);
		}

		// Handle approval
		const approvalHistory = state.getMetadata<any[]>('approvalHistory') || [];
		approvalHistory.push({
			stage: body.stage,
			decision: body.approved ? 'approved' : 'rejected',
			timestamp: Date.now(),
			feedback: body.feedback,
		});
		state.setMetadata('approvalHistory', approvalHistory);

		// If feedback provided, add as user message
		if (body.feedback) {
			state.addMessage({
				role: 'user',
				content: body.feedback,
				timestamp: Date.now(),
			});
		}

		// Determine next action
		if (body.approved) {
			// Approved - continue to next agent
			state.approve(true, body.feedback);
			const nextAgent = state.getNextAgent();
			if (!nextAgent || nextAgent === '__human__') {
				// No next agent, workflow complete
				state.setMetadata('stage', 'completed');

				// Save final state
				ventureExecutor.checkpointManager.saveCheckpoint(body.threadId, state);

				return json({
					success: true,
					stage: 'completed',
					venturePlan: {
						stage: 'completed',
						messages: state.messages,
						nextAgent: null,
						pendingApproval: false,
						approvalHistory,
					},
					nextAgent: null,
					pausedForApproval: false,
					threadId: body.threadId,
					checkpointId: currentCheckpointId,
				} as VenturePlanResponse);
			}

			// Continue workflow
			const result = await ventureExecutor.invoke(state, nextAgent, {
				threadId: body.threadId,
				checkpoint: true,
				waitForHuman: true,
				timeout: 60000,
			});

			const newCheckpoints = ventureExecutor.checkpointManager.getCheckpoints(body.threadId);
			const newCheckpointId = newCheckpoints[newCheckpoints.length - 1].id;

			return json({
				success: true,
				stage: result.getMetadata('stage') || 'idea_validation',
				venturePlan: {
					stage: result.getMetadata('stage') || 'idea_validation',
					messages: result.messages,
					nextAgent: result.getNextAgent(),
					pendingApproval: result.isWaitingForApproval(),
					approvalHistory,
				},
				nextAgent: result.getNextAgent(),
				pausedForApproval: result.isWaitingForApproval(),
				threadId: body.threadId,
				checkpointId: newCheckpointId,
			} as VenturePlanResponse);
		} else {
			// Rejected - either go back or force next stage
			if (body.forceNextStage) {
				// Force continue to next stage anyway
				state.approve(true, 'Forced to proceed despite rejection');
			} else {
				// Go back to previous stage for revision
				const currentStage = state.getMetadata<string>('stage');
				if (currentStage === 'idea_validation') {
					// Can't go back from idea validation
					state.approve(false, body.feedback);
					state.setMetadata('stage', 'completed');
					state.setNextAgent(null);
				} else {
					// Add rejection feedback and return to previous stage
					state.addMessage({
						role: 'system',
						content: `Stage '${currentStage}' rejected. Returning for revision based on feedback: ${body.feedback || 'No feedback provided'}`,
					});

					// Set next agent to previous stage
					const stageToAgent: Record<string, string> = {
						market_analysis: 'idea_validator',
						financial_planning: 'market_analyzer',
						risk_assessment: 'financial_planner',
						investment_advice: 'risk_assessor',
					};

					const prevAgent = stageToAgent[currentStage!] || 'idea_validator';
					const stageMapping: Record<string, string> = {
						idea_validator: 'idea_validation',
						market_analyzer: 'market_analysis',
						financial_planner: 'financial_planning',
						risk_assessor: 'risk_assessment',
						investment_advisor: 'investment_advice',
					};

					state.setMetadata('stage', stageMapping[prevAgent] || 'idea_validation');
					state.setNextAgent(prevAgent);
					state.setMetadata('pendingApproval', false);
				}
			}

			// Save state
			ventureExecutor.checkpointManager.saveCheckpoint(body.threadId, state);

			const newCheckpoints = ventureExecutor.checkpointManager.getCheckpoints(body.threadId);
			const newCheckpointId = newCheckpoints[newCheckpoints.length - 1].id;

			return json({
				success: true,
				stage: state.getMetadata('stage') || 'idea_validation',
				venturePlan: {
					stage: state.getMetadata('stage') || 'idea_validation',
					messages: state.messages,
					nextAgent: state.getNextAgent(),
					pendingApproval: state.isWaitingForApproval(),
					approvalHistory,
				},
				nextAgent: state.getNextAgent(),
				pausedForApproval: state.isWaitingForApproval(),
				threadId: body.threadId,
				checkpointId: newCheckpointId,
			} as VenturePlanResponse);
		}
	} catch (error) {
		console.error('Approval submission error:', error);
		return json(
			{
				success: false,
				error: 'Approval submission failed',
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
}
