<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Message, StreamEvent, AgentStatus } from '$lib/types';

	export let threadId: string;

	let messages: Message[] = [];
	let input = '';
	let loading = false;
	let streaming = false;
	let agentStatuses: Record<string, AgentStatus> = {};
	let error: string | null = null;
	let checkpointId: string | null = null;
	let pausedForHuman = false;

	let abortController: AbortController | null = null;

	onMount(() => {
		// Load any existing checkpoints
		loadCheckpointHistory();
	});

	onDestroy(() => {
		abortController?.abort();
	});

	async function loadCheckpointHistory() {
		try {
			const response = await fetch(`/api/graph/checkpoint?threadId=${threadId}`);
			if (response.ok) {
				const data = await response.json();
				if (data.checkpoints && data.checkpoints.length > 0) {
					// Load latest checkpoint
					await restoreCheckpoint(data.checkpoints[data.checkpoints.length - 1].id);
				}
			}
		} catch (e) {
			console.error('Failed to load checkpoints:', e);
		}
	}

	async function restoreCheckpoint(checkpointId: string) {
		try {
			loading = true;
			const response = await fetch('/api/graph/checkpoint', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					threadId,
					checkpointId,
					action: 'restore'
				})
			});

			if (response.ok) {
				const data = await response.json();
				messages = data.messages || [];
				checkpointId = data.checkpointId;
			}
		} catch (e) {
			console.error('Failed to restore checkpoint:', e);
		} finally {
			loading = false;
		}
	}

	async function execute() {
		if (!input.trim() || loading) return;

		const userMessage: Message = { role: 'user', content: input, timestamp: Date.now() };
		messages = [...messages, userMessage];
		input = '';
		error = null;

		await streamExecution();
	}

	async function streamExecution() {
		streaming = true;
		abortController = new AbortController();

		try {
			const response = await fetch('/api/graph/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					threadId,
					startAgent: 'researcher',
					messages: messages.map((m) => ({ role: m.role, content: m.content })),
					options: { checkpoint: true }
				}),
				signal: abortController.signal
			});

			if (!response.ok) {
				throw new Error('Stream request failed');
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			if (!reader) throw new Error('No response body');

			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') {
							streaming = false;
							break;
						}

						try {
							const event: StreamEvent = JSON.parse(data);
							handleStreamEvent(event);
						} catch (e) {
							console.error('Failed to parse event:', e);
						}
					}
				}
			}
		} catch (e) {
			if (e instanceof Error && e.name !== 'AbortError') {
				error = e.message;
			}
		} finally {
			streaming = false;
			abortController = null;
		}
	}

	function handleStreamEvent(event: StreamEvent) {
		switch (event.type) {
			case 'agent_start':
				agentStatuses = {
					...agentStatuses,
					[event.agentName || 'unknown']: {
						name: event.agentName || 'unknown',
						status: 'running',
						startTime: event.timestamp
					}
				};
				break;

			case 'agent_complete':
				if (event.agentName && agentStatuses[event.agentName]) {
					agentStatuses = {
						...agentStatuses,
						[event.agentName]: {
							...agentStatuses[event.agentName],
							status: 'completed',
							endTime: event.timestamp
						}
					};
				}
				break;

			case 'message':
				if (event.message) {
					messages = [...messages, event.message];
				}
				break;

			case 'error':
				error = event.error || 'Unknown error';
				break;

			case 'complete':
				streaming = false;
				break;
		}
	}

	function stopExecution() {
		abortController?.abort();
		streaming = false;
	}

	function retry() {
		error = null;
		streamExecution();
	}

	function getAgentStatusColor(status: AgentStatus['status']): string {
		switch (status) {
			case 'running':
				return '#60a5fa';
			case 'completed':
				return '#4ade80';
			case 'error':
				return '#ef4444';
			default:
				return '#71717a';
		}
	}

	function formatTimestamp(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString();
	}
</script>

<div class="executor">
	<!-- Agent Status Bar -->
	{#if Object.keys(agentStatuses).length > 0}
		<div class="agent-status-bar">
			{#each Object.values(agentStatuses) as agent}
				<div class="agent-status" style="--status-color: {getAgentStatusColor(agent.status)}">
					<span class="agent-name">{agent.name}</span>
					<span class="agent-status-indicator {agent.status}"></span>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Messages -->
	<div class="messages-container">
		{#if messages.length === 0}
			<div class="empty-messages">
				<p>Start a conversation with the multi-agent system</p>
				<small>Try asking for research on a topic, code review, or content creation</small>
			</div>
		{:else}
			{#each messages as message (message.timestamp)}
				<div class="message {message.role}">
					<div class="message-header">
						<span class="message-role">{message.role}</span>
						{#if message.timestamp}
							<span class="message-time">{formatTimestamp(message.timestamp)}</span>
						{/if}
					</div>
					<div class="message-content">{message.content}</div>
				</div>
			{/each}
		{/if}

		{#if streaming}
			<div class="message assistant streaming">
				<div class="message-header">
					<span class="message-role">assistant</span>
				</div>
				<div class="message-content">
					<span class="typing-indicator">Thinking<span>.</span><span>.</span><span>.</span></span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Error Display -->
	{#if error}
		<div class="error-banner">
			<span class="error-icon">⚠</span>
			<span class="error-message">{error}</span>
			<button class="btn-retry" on:click={retry}>Retry</button>
		</div>
	{/if}

	<!-- Input Area -->
	<div class="input-area">
		{#if pausedForHuman}
			<div class="human-input-required">
				<p>⚠ This action requires human approval</p>
				<div class="approval-buttons">
					<button class="btn-approve" on:click={() => (pausedForHuman = false)}>Approve</button>
					<button class="btn-reject" on:click={() => (pausedForHuman = false)}>Reject</button>
				</div>
			</div>
		{:else}
			<form on:submit|preventDefault={execute}>
				<div class="input-wrapper">
					<textarea
						bind:value={input}
						disabled={loading || streaming}
						placeholder="Enter your message..."
						rows="1"
						on:keydown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								execute();
							}
						}}
					></textarea>
					{#if streaming}
						<button type="button" class="btn-stop" on:click={stopExecution}>Stop</button>
					{:else}
						<button type="submit" class="btn-send" disabled={!input.trim() || loading}>
							Send
						</button>
					{/if}
				</div>
			</form>
		{/if}
	</div>
</div>

<style>
	.executor {
		display: flex;
		flex-direction: column;
		height: 100%;
		max-height: 70vh;
	}

	.agent-status-bar {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: #1f1f22;
		border-bottom: 1px solid #3f3f46;
		flex-wrap: wrap;
	}

	.agent-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.75rem;
		background: #27272a;
		border-radius: 999px;
		font-size: 0.75rem;
	}

	.agent-name {
		color: #a1a1aa;
	}

	.agent-status-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--status-color);
	}

	.agent-status-indicator.running {
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.messages-container {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.empty-messages {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #71717a;
		text-align: center;
		gap: 0.5rem;
	}

	.empty-messages small {
		font-size: 0.8rem;
	}

	.message {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-width: 80%;
		animation: slideIn 0.2s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.message.user {
		align-self: flex-end;
	}

	.message.assistant,
	.message.system {
		align-self: flex-start;
	}

	.message-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: #71717a;
	}

	.message-role {
		text-transform: uppercase;
		font-weight: 600;
		letter-spacing: 0.05em;
	}

	.message.user .message-role {
		color: #60a5fa;
	}

	.message.assistant .message-role {
		color: #a78bfa;
	}

	.message-content {
		padding: 0.75rem 1rem;
		border-radius: 12px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.message.user .message-content {
		background: #2563eb;
		color: white;
		border-bottom-right-radius: 4px;
	}

	.message.assistant .message-content {
		background: #3f3f46;
		color: #e4e4e7;
		border-bottom-left-radius: 4px;
	}

	.message.system .message-content {
		background: #27272a;
		color: #a1a1aa;
		border: 1px solid #3f3f46;
		font-size: 0.85rem;
	}

	.message.streaming .message-content {
		background: #3f3f46;
	}

	.typing-indicator {
		display: flex;
		gap: 0.25rem;
	}

	.typing-indicator span {
		animation: bounce 1.4s infinite ease-in-out;
	}

	.typing-indicator span:nth-child(1) {
		animation-delay: 0s;
	}

	.typing-indicator span:nth-child(2) {
		animation-delay: 0.2s;
	}

	.typing-indicator span:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes bounce {
		0%,
		80%,
		100% {
			transform: translateY(0);
		}
		40% {
			transform: translateY(-5px);
		}
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: #7f1d1d;
		border-top: 1px solid #991b1b;
	}

	.error-icon {
		font-size: 1.25rem;
	}

	.error-message {
		flex: 1;
		font-size: 0.85rem;
	}

	.btn-retry {
		padding: 0.5rem 1rem;
		background: #991b1b;
		border: none;
		border-radius: 6px;
		color: white;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.input-area {
		padding: 1rem;
		border-top: 1px solid #3f3f46;
		background: #1f1f22;
	}

	.input-wrapper {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
	}

	textarea {
		flex: 1;
		padding: 0.75rem 1rem;
		background: #27272a;
		border: 1px solid #3f3f46;
		border-radius: 12px;
		color: #e4e4e7;
		font-family: inherit;
		font-size: 0.9rem;
		resize: none;
		min-height: 44px;
		max-height: 120px;
		transition: border-color 0.15s;
	}

	textarea:focus {
		outline: none;
		border-color: #60a5fa;
	}

	textarea:disabled {
		opacity: 0.5;
	}

	.btn-send,
	.btn-stop {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-send {
		background: #2563eb;
		color: white;
	}

	.btn-send:hover:not(:disabled) {
		background: #3b82f6;
	}

	.btn-send:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-stop {
		background: #dc2626;
		color: white;
	}

	.btn-stop:hover {
		background: #ef4444;
	}

	.human-input-required {
		text-align: center;
		padding: 1rem;
	}

	.human-input-required p {
		margin: 0 0 1rem 0;
		color: #fbbf24;
	}

	.approval-buttons {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}

	.btn-approve,
	.btn-reject {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 500;
	}

	.btn-approve {
		background: #22c55e;
		color: white;
	}

	.btn-reject {
		background: #ef4444;
		color: white;
	}
</style>
