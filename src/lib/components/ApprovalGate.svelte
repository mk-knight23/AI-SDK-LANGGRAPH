<script lang="ts">
	import type { VentureStage } from '$lib/types/venture';

	interface Props {
		stage: VentureStage;
		agentOutput: string;
		onApprove: (feedback?: string) => void;
		onReject: (feedback: string) => void;
		onForceProceed: () => void;
		loading?: boolean;
	}

	let { stage, agentOutput, onApprove, onReject, onForceProceed, loading = false }: Props = $props();

	let feedback = $state('');
	let showFeedback = $state(false);

	const stageNames: Record<VentureStage, string> = {
		idea_validation: 'Idea Validation',
		market_analysis: 'Market Analysis',
		financial_planning: 'Financial Planning',
		risk_assessment: 'Risk Assessment',
		investment_advice: 'Investment Advice',
		completed: 'Completed',
	};

	function handleApprove() {
		onApprove(feedback || undefined);
		feedback = '';
		showFeedback = false;
	}

	function handleReject() {
		if (!feedback.trim()) {
			alert('Please provide feedback for rejection');
			return;
		}
		onReject(feedback);
		feedback = '';
		showFeedback = false;
	}

	function handleForceProceed() {
		onForceProceed();
	}
</script>

<div class="approval-gate">
	<div class="approval-header">
		<h3>
			Approval Required: {stageNames[stage]}
		</h3>
		<p class="approval-description">
			Review the output below and decide whether to proceed to the next stage or request revisions.
		</p>
	</div>

	<div class="agent-output">
		<div class="output-header">
			<span>Output from {stageNames[stage]} Agent</span>
		</div>
		<div class="output-content">
			{agentOutput}
		</div>
	</div>

	<div class="approval-actions">
		{#if !showFeedback}
			<button
				class="btn btn-approve"
				disabled={loading}
				on:click={() => (showFeedback = true)}
			>
				{#if loading}
					<span class="spinner"></span>
				{/if}
				{loading ? 'Processing...' : 'Approve & Proceed'}
			</button>
			<button class="btn btn-reject" disabled={loading} on:click={() => (showFeedback = true)}>
				Request Revision
			</button>
		{:else}
			<div class="feedback-section">
				<div class="feedback-header">
					{feedback ? '' : 'Please provide feedback'}
				</div>
				<textarea
					class="feedback-input"
					placeholder="Describe what needs to be revised..."
					bind:value={feedback}
					disabled={loading}
				></textarea>
				<div class="feedback-actions">
					<button
						class="btn btn-approve"
						disabled={loading || !feedback.trim()}
						on:click={handleApprove}
					>
						{#if loading}
							<span class="spinner"></span>
						{/if}
						{loading ? 'Processing...' : 'Approve'}
					</button>
					<button
						class="btn btn-reject"
						disabled={loading || !feedback.trim()}
						on:click={handleReject}
					>
						Reject & Revise
					</button>
					<button class="btn btn-cancel" disabled={loading} on:click={() => (showFeedback = false)}>
						Cancel
					</button>
				</div>
				<button class="btn btn-force" disabled={loading} on:click={handleForceProceed}>
					Force Proceed (Skip Revision)
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.approval-gate {
		background: #1e1e24;
		border-radius: 12px;
		padding: 1.5rem;
		margin-top: 1.5rem;
		border: 2px solid #f59e0b;
	}

	.approval-header {
		margin-bottom: 1.5rem;
	}

	.approval-header h3 {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: #fcd34d;
	}

	.approval-description {
		color: #a1a1aa;
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.agent-output {
		background: #27272a;
		border-radius: 8px;
		overflow: hidden;
		margin-bottom: 1.5rem;
	}

	.output-header {
		padding: 0.75rem 1rem;
		background: #3f3f46;
		font-weight: 600;
		color: #e4e4e7;
		font-size: 0.875rem;
	}

	.output-content {
		padding: 1rem;
		color: #d4d4d8;
		white-space: pre-wrap;
		line-height: 1.6;
		max-height: 400px;
		overflow-y: auto;
	}

	.approval-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		border: none;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-approve {
		background: linear-gradient(135deg, #10b981, #059669);
		color: white;
	}

	.btn-approve:hover:not(:disabled) {
		background: linear-gradient(135deg, #059669, #047857);
		transform: translateY(-1px);
	}

	.btn-reject {
		background: linear-gradient(135deg, #ef4444, #dc2626);
		color: white;
	}

	.btn-reject:hover:not(:disabled) {
		background: linear-gradient(135deg, #dc2626, #b91c1c);
		transform: translateY(-1px);
	}

	.btn-cancel {
		background: #3f3f46;
		color: #e4e4e7;
	}

	.btn-cancel:hover:not(:disabled) {
		background: #52525b;
	}

	.btn-force {
		background: #6b7280;
		color: #e4e4e7;
		font-size: 0.8rem;
		padding: 0.5rem 1rem;
		margin-left: auto;
	}

	.btn-force:hover:not(:disabled) {
		background: #4b5563;
	}

	.feedback-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.feedback-header {
		font-size: 0.875rem;
		color: #a1a1aa;
	}

	.feedback-input {
		width: 100%;
		min-height: 120px;
		padding: 1rem;
		background: #27272a;
		border: 1px solid #3f3f46;
		border-radius: 8px;
		color: #e4e4e7;
		font-family: inherit;
		font-size: 0.9rem;
		resize: vertical;
	}

	.feedback-input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.feedback-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.feedback-actions {
		display: flex;
		gap: 0.75rem;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 768px) {
		.approval-actions {
			flex-direction: column;
		}

		.feedback-actions {
			flex-direction: column;
		}

		.btn {
			width: 100%;
			justify-content: center;
		}

		.btn-force {
			margin-left: 0;
		}
	}
</style>
