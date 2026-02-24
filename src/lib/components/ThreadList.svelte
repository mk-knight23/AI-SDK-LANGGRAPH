<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { ThreadInfo } from '$lib/types';

	export let threads: ThreadInfo[] = [];
	export let selectedThreadId: string | null = null;

	const dispatch = createEventDispatcher();

	function handleSelect(threadId: string) {
		dispatch('select', threadId);
	}

	function handleDelete(threadId: string, event: MouseEvent) {
		event.stopPropagation();
		if (confirm('Delete this thread?')) {
			dispatch('delete', threadId);
		}
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	}
</script>

<div class="thread-list">
	{#if threads.length === 0}
		<div class="empty">
			<p>No threads yet</p>
			<small>Create a new thread to get started</small>
		</div>
	{:else}
		{#each threads as thread (thread.id)}
			<div
				class="thread-item"
				class:selected={thread.id === selectedThreadId}
				on:click={() => handleSelect(thread.id)}
				role="button"
				tabindex="0"
				on:keydown={(e) => e.key === 'Enter' && handleSelect(thread.id)}
			>
				<div class="thread-info">
					<span class="thread-id">{thread.id.slice(-8)}</span>
					<span class="thread-meta">{thread.messageCount} messages</span>
				</div>
				<div class="thread-actions">
					<span class="thread-time">{formatDate(thread.createdAt)}</span>
					<button
						class="btn-delete"
						on:click={(e) => handleDelete(thread.id, e)}
						title="Delete thread"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
							<path
								d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				</div>
			</div>
		{/each}
	{/if}
</div>

<style>
	.thread-list {
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		max-height: calc(100vh - 200px);
	}

	.empty {
		padding: 2rem;
		text-align: center;
		color: #71717a;
	}

	.empty p {
		margin: 0 0 0.5rem 0;
		font-weight: 500;
	}

	.empty small {
		font-size: 0.75rem;
	}

	.thread-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		cursor: pointer;
		transition: all 0.15s;
		border-left: 3px solid transparent;
	}

	.thread-item:hover {
		background: #3f3f46;
	}

	.thread-item.selected {
		background: #3f3f46;
		border-left-color: #60a5fa;
	}

	.thread-item:focus-visible {
		outline: 2px solid #60a5fa;
		outline-offset: -2px;
	}

	.thread-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
	}

	.thread-id {
		font-size: 0.85rem;
		font-weight: 500;
		color: #e4e4e7;
		font-family: monospace;
	}

	.thread-meta {
		font-size: 0.7rem;
		color: #a1a1aa;
	}

	.thread-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.thread-time {
		font-size: 0.7rem;
		color: #71717a;
	}

	.btn-delete {
		width: 24px;
		height: 24px;
		border: none;
		background: transparent;
		color: #71717a;
		cursor: pointer;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: all 0.15s;
	}

	.thread-item:hover .btn-delete {
		opacity: 1;
	}

	.btn-delete:hover {
		background: #ef4444;
		color: white;
	}
</style>
