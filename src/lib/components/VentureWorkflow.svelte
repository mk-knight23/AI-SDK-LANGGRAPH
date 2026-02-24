<script lang="ts">
	import type { VentureStage } from '$lib/types/venture';

	export let currentStage: VentureStage;
	export let currentAgent: string;
	export let pausedForApproval: boolean;
</script>

<div class="workflow-status">
	<div class="status-item">
		<span class="status-label">Stage:</span>
		<span class="status-value">{currentStage}</span>
	</div>
	<div class="status-item">
		<span class="status-label">Agent:</span>
		<span class="status-value">{currentAgent}</span>
	</div>
	{#if pausedForApproval}
		<div class="status-item paused">
			<span class="status-label">Status:</span>
			<span class="status-value">Waiting for approval</span>
		</div>
	{/if}
</div>

<style>
	.workflow-status {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: #f5f5f5;
		border-radius: 8px;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.status-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-item.paused {
		background: #fff3cd;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		border-left: 4px solid #ffc107;
	}

	.status-label {
		font-weight: 600;
		color: #666;
	}

	.status-value {
		color: #333;
		font-weight: 500;
	}
</style>
