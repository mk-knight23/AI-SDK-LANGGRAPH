<script lang="ts">
	import { onMount } from 'svelte';
	import GraphExecutor from '$lib/components/GraphExecutor.svelte';
	import ThreadList from '$lib/components/ThreadList.svelte';
	import type { ThreadInfo } from '$lib/types';

	let threads: ThreadInfo[] = [];
	let selectedThreadId: string | null = null;
	let loading = true;

	onMount(async () => {
		await loadThreads();
		loading = false;
	});

	async function loadThreads() {
		try {
			const response = await fetch('/api/graph/threads');
			if (response.ok) {
				const data = await response.json();
				threads = data.threads || [];
			}
		} catch (error) {
			console.error('Failed to load threads:', error);
		}
	}

	function handleThreadSelect(threadId: string) {
		selectedThreadId = threadId;
	}

	function handleNewThread() {
		selectedThreadId = `thread-${Date.now()}`;
		threads = [
			...threads,
			{ id: selectedThreadId, createdAt: Date.now(), messageCount: 0 }
		];
	}

	async function handleThreadDelete(threadId: string) {
		try {
			await fetch('/api/graph/checkpoint', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ threadId })
			});
			threads = threads.filter((t) => t.id !== threadId);
			if (selectedThreadId === threadId) {
				selectedThreadId = null;
			}
		} catch (error) {
			console.error('Failed to delete thread:', error);
		}
	}
</script>

<div class="app-container">
	<header class="app-header">
		<h1>LangGraph Multi-Agent Workflows</h1>
		<p>Stateful agent orchestration with checkpointing and human-in-the-loop</p>
	</header>

	<main class="app-main">
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading...</p>
			</div>
		{:else}
			<div class="workspace">
				<aside class="sidebar">
					<div class="sidebar-header">
						<h2>Threads</h2>
						<button class="btn-new" on:click={handleNewThread} title="New Thread">
							<span>+</span>
						</button>
					</div>

					<ThreadList
						threads={threads}
						selectedThreadId={selectedThreadId}
						on:select={(e) => handleThreadSelect(e.detail)}
						on:delete={(e) => handleThreadDelete(e.detail)}
					/>
				</aside>

				<section class="main-content">
					{#if selectedThreadId}
						<GraphExecutor threadId={selectedThreadId} />
					{:else}
						<div class="empty-state">
							<svg
								width="64"
								height="64"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
								/>
							</svg>
							<h3>Select a thread or create a new one</h3>
							<p>LangGraph enables stateful multi-agent workflows with cyclic execution</p>
						</div>
					{/if}
				</section>
			</div>
		{/if}
	</main>
</div>

<style>
	.app-container {
		min-height: 100vh;
		background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
		color: #e4e4e7;
	}

	.app-header {
		padding: 2rem;
		text-align: center;
		border-bottom: 1px solid #3f3f46;
	}

	.app-header h1 {
		font-size: 2rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		background: linear-gradient(90deg, #60a5fa, #a78bfa);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.app-header p {
		color: #a1a1aa;
		font-size: 0.9rem;
	}

	.app-main {
		max-width: 1600px;
		margin: 0 auto;
		padding: 1rem;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		gap: 1rem;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #3f3f46;
		border-top-color: #60a5fa;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.workspace {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: 1rem;
		min-height: 70vh;
	}

	.sidebar {
		background: #27272a;
		border-radius: 12px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		border-bottom: 1px solid #3f3f46;
	}

	.sidebar-header h2 {
		font-size: 0.9rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #a1a1aa;
	}

	.btn-new {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: none;
		background: #3f3f46;
		color: #e4e4e7;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		transition: all 0.2s;
	}

	.btn-new:hover {
		background: #52525b;
		transform: scale(1.05);
	}

	.main-content {
		background: #27272a;
		border-radius: 12px;
		overflow: hidden;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		gap: 1rem;
		color: #71717a;
	}

	.empty-state svg {
		width: 64px;
		height: 64px;
		opacity: 0.5;
	}

	.empty-state h3 {
		font-size: 1.25rem;
		font-weight: 600;
		color: #a1a1aa;
	}

	.empty-state p {
		max-width: 400px;
		text-align: center;
		line-height: 1.6;
	}

	@media (max-width: 768px) {
		.workspace {
			grid-template-columns: 1fr;
		}

		.sidebar {
			max-height: 200px;
		}
	}
</style>
