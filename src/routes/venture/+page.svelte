<script lang="ts">
	import { onMount } from 'svelte';
	import VentureWorkflow from '$lib/components/VentureWorkflow.svelte';
	import ApprovalGate from '$lib/components/ApprovalGate.svelte';
	import type { VentureIdea, VentureStage, Message } from '$lib/types/venture';

	interface Thread {
		id: string;
		createdAt: number;
		messageCount: number;
		updatedAt?: number;
	}

	let threads: Thread[] = $state([]);
	let selectedThreadId: string | null = $state(null);
	let loading = $state(true);
	let executing = $state(false);
	let streaming = $state(false);

	// Form state
	let ventureTitle = $state('');
	let ventureDescription = $state('');
	let ventureIndustry = $state('');
	let targetMarket = $state('');
	let businessModel = $state('');

	// Workflow state
	let currentStage: VentureStage = $state('idea_validation');
	let currentAgent = $state('idea_validator');
	let pausedForApproval = $state(false);
	let messages: Message[] = $state([]);
	let lastAgentOutput = $state('');
	let checkpointId = $state<string | undefined>();

	onMount(async () => {
		await loadThreads();
		loading = false;
	});

	async function loadThreads() {
		try {
			const response = await fetch('/api/venture/threads');
			if (response.ok) {
				const data = await response.json();
				threads = data.threads || [];
			}
		} catch (error) {
			console.error('Failed to load threads:', error);
		}
	}

	function handleNewThread() {
		selectedThreadId = `venture-${Date.now()}`;
		resetForm();
	}

	function resetForm() {
		ventureTitle = '';
		ventureDescription = '';
		ventureIndustry = '';
		targetMarket = '';
		businessModel = '';
		messages = [];
		currentStage = 'idea_validation';
		currentAgent = 'idea_validator';
		pausedForApproval = false;
		lastAgentOutput = '';
		checkpointId = undefined;
	}

	async function startVenturePlanning() {
		if (!ventureTitle || !ventureDescription || !ventureIndustry) {
			alert('Please fill in all required fields');
			return;
		}

		executing = true;
		streaming = true;

		const ventureIdea: VentureIdea = {
			title: ventureTitle,
			description: ventureDescription,
			industry: ventureIndustry,
			targetMarket: targetMarket || 'General market',
			businessModel: businessModel || 'To be determined',
		};

		try {
			const response = await fetch('/api/venture/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					threadId: selectedThreadId,
					ventureIdea,
					options: { checkpoint: true, timeout: 60000 },
				}),
			});

			if (!response.ok) {
				throw new Error('Failed to start venture planning');
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			if (reader) {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value);
					const lines = chunk.split('\n');

					for (const line of lines) {
						if (line.startsWith('data: ')) {
							const data = line.slice(6);
							if (data === '[DONE]') {
								streaming = false;
								break;
							}

							try {
								const event = JSON.parse(data);
								handleStreamEvent(event);
							} catch (e) {
								// Ignore parse errors
							}
						}
					}
				}
			}

			// Load final state
			await loadWorkflowStatus();
		} catch (error) {
			console.error('Venture planning error:', error);
			alert('Failed to start venture planning: ' + (error as Error).message);
		} finally {
			executing = false;
			streaming = false;
			await loadThreads();
		}
	}

	function handleStreamEvent(event: any) {
		if (event.type === 'message' && event.message) {
			messages = [...messages, event.message];
			// Update last output for the current agent
			lastAgentOutput = event.message.content;
		}

		if (event.stage) {
			currentStage = event.stage;
		}

		if (event.agentName) {
			currentAgent = event.agentName;
		}

		if (event.pendingApproval !== undefined) {
			pausedForApproval = event.pendingApproval;
		}

		if (event.type === 'complete') {
			streaming = false;
		}
	}

	async function loadWorkflowStatus() {
		if (!selectedThreadId) return;

		try {
			const response = await fetch(`/api/venture/plan?threadId=${selectedThreadId}`);
			if (response.ok) {
				const data = await response.json();
				if (data.success) {
					currentStage = data.stage;
					pausedForApproval = data.pausedForApproval;
					messages = data.venturePlan.messages;
					currentAgent = data.nextAgent || '';
					checkpointId = data.checkpointId;

					// Get last message as output
					if (messages.length > 0) {
						lastAgentOutput = messages[messages.length - 1].content;
					}
				}
			}
		} catch (error) {
			console.error('Failed to load status:', error);
		}
	}

	async function handleApprove(feedback?: string) {
		if (!selectedThreadId) return;

		executing = true;

		try {
			const response = await fetch('/api/venture/approve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					threadId: selectedThreadId,
					stage: currentStage,
					approved: true,
					feedback,
				}),
			});

			const data = await response.json();
			if (data.success) {
				currentStage = data.stage;
				pausedForApproval = data.pausedForApproval;
				messages = data.venturePlan.messages;
				currentAgent = data.nextAgent || '';
				checkpointId = data.checkpointId;

				if (messages.length > 0) {
					lastAgentOutput = messages[messages.length - 1].content;
				}

				// Continue streaming if not paused
				if (!pausedForApproval && data.nextAgent) {
					await continueWorkflow();
				}
			} else {
				alert('Approval failed: ' + data.error);
			}
		} catch (error) {
			console.error('Approval error:', error);
			alert('Failed to submit approval');
		} finally {
			executing = false;
		}
	}

	async function handleReject(feedback: string) {
		if (!selectedThreadId) return;

		executing = true;

		try {
			const response = await fetch('/api/venture/approve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					threadId: selectedThreadId,
					stage: currentStage,
					approved: false,
					feedback,
				}),
			});

			const data = await response.json();
			if (data.success) {
				currentStage = data.stage;
				pausedForApproval = data.pausedForApproval;
				messages = data.venturePlan.messages;
				currentAgent = data.nextAgent || '';
				checkpointId = data.checkpointId;

				if (messages.length > 0) {
					lastAgentOutput = messages[messages.length - 1].content;
				}

				// Continue workflow to previous stage
				if (data.nextAgent && !pausedForApproval) {
					await continueWorkflow();
				}
			} else {
				alert('Rejection failed: ' + data.error);
			}
		} catch (error) {
			console.error('Rejection error:', error);
			alert('Failed to submit rejection');
		} finally {
			executing = false;
		}
	}

	async function handleForceProceed() {
		if (!selectedThreadId) return;

		executing = true;

		try {
			const response = await fetch('/api/venture/approve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					threadId: selectedThreadId,
					stage: currentStage,
					approved: false,
					feedback: 'Forced to proceed',
					forceNextStage: true,
				}),
			});

			const data = await response.json();
			if (data.success) {
				currentStage = data.stage;
				pausedForApproval = data.pausedForApproval;
				messages = data.venturePlan.messages;
				currentAgent = data.nextAgent || '';
				checkpointId = data.checkpointId;

				if (messages.length > 0) {
					lastAgentOutput = messages[messages.length - 1].content;
				}

				// Continue workflow
				if (!pausedForApproval && data.nextAgent) {
					await continueWorkflow();
				}
			} else {
				alert('Force proceed failed: ' + data.error);
			}
		} catch (error) {
			console.error('Force proceed error:', error);
			alert('Failed to force proceed');
		} finally {
			executing = false;
		}
	}

	async function continueWorkflow() {
		if (!selectedThreadId || !checkpointId) return;

		streaming = true;

		try {
			const response = await fetch('/api/venture/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					threadId: selectedThreadId,
					resumeFromCheckpoint: checkpointId,
					options: { checkpoint: true, timeout: 60000 },
				}),
			});

			if (!response.ok) {
				throw new Error('Failed to continue workflow');
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			if (reader) {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value);
					const lines = chunk.split('\n');

					for (const line of lines) {
						if (line.startsWith('data: ')) {
							const data = line.slice(6);
							if (data === '[DONE]') {
								streaming = false;
								break;
							}

							try {
								const event = JSON.parse(data);
								handleStreamEvent(event);
							} catch (e) {
								// Ignore parse errors
							}
						}
					}
				}
			}

			// Load final state
			await loadWorkflowStatus();
		} catch (error) {
			console.error('Workflow continuation error:', error);
		} finally {
			streaming = false;
		}
	}

	async function deleteThread(threadId: string) {
		if (!confirm('Are you sure you want to delete this thread?')) return;

		try {
			await fetch('/api/venture/threads', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ threadId }),
			});
			threads = threads.filter((t) => t.id !== threadId);
			if (selectedThreadId === threadId) {
				selectedThreadId = null;
				resetForm();
			}
		} catch (error) {
			console.error('Failed to delete thread:', error);
		}
	}

	function selectThread(threadId: string) {
		selectedThreadId = threadId;
		loadWorkflowStatus();
	}
</script>

<div class="venture-planner">
	<header class="planner-header">
		<h1>Venture Planning Agent</h1>
		<p>
			AI-powered venture analysis with multi-agent workflow and human approval gates
		</p>
	</header>

	<main class="planner-main">
		<aside class="planner-sidebar">
			<div class="sidebar-header">
				<h2>Venture Threads</h2>
				<button class="btn-new" on:click={handleNewThread} title="New Venture">
					<span>+</span>
				</button>
			</div>

			<div class="threads-list">
				{#each threads as thread (thread.id)}
					<div
						class="thread-item {selectedThreadId === thread.id ? 'selected' : ''}"
						on:click={() => selectThread(thread.id)}
					>
						<div class="thread-info">
							<div class="thread-id">{thread.id}</div>
							<div class="thread-meta">
								{new Date(thread.createdAt).toLocaleDateString()}
								• {thread.messageCount} messages
							</div>
						</div>
						<button class="btn-delete" on:click|stopPropagation={() => deleteThread(thread.id)}>
							×
						</button>
					</div>
				{/each}
				{#if threads.length === 0}
					<div class="empty-threads">No venture threads yet</div>
				{/if}
			</div>
		</aside>

		<section class="planner-content">
			{#if selectedThreadId}
				<div class="workspace">
					<VentureWorkflow
						currentStage={currentStage}
						currentAgent={currentAgent}
						pausedForApproval={pausedForApproval}
					/>

					{#if messages.length === 0}
						<div class="venture-form">
							<h2>New Venture Analysis</h2>
							<form on:submit|preventDefault={startVenturePlanning}>
								<div class="form-group">
									<label for="title">Venture Title *</label>
									<input
										type="text"
										id="title"
										bind:value={ventureTitle}
										placeholder="e.g., AI-Powered Personal Finance App"
										disabled={executing}
									/>
								</div>

								<div class="form-group">
									<label for="description">Description *</label>
									<textarea
										id="description"
										bind:value={ventureDescription}
										placeholder="Describe your venture idea in detail..."
										disabled={executing}
									></textarea>
								</div>

								<div class="form-row">
									<div class="form-group">
										<label for="industry">Industry *</label>
										<input
											type="text"
											id="industry"
											bind:value={ventureIndustry}
											placeholder="e.g., Fintech"
											disabled={executing}
										/>
									</div>

									<div class="form-group">
										<label for="targetMarket">Target Market</label>
										<input
											type="text"
											id="targetMarket"
											bind:value={targetMarket}
											placeholder="e.g., Young professionals"
											disabled={executing}
										/>
									</div>
								</div>

								<div class="form-group">
									<label for="businessModel">Business Model</label>
									<textarea
										id="businessModel"
										bind:value={businessModel}
										placeholder="How will this venture make money?"
										disabled={executing}
									></textarea>
								</div>

								<button type="submit" class="btn btn-primary" disabled={executing}>
									{#if executing}
										<span class="spinner"></span>
										{streaming ? 'Analyzing...' : 'Processing...'}
									{:else}
										{pausedForApproval ? 'Resume Analysis' : 'Start Analysis'}
									{/if}
								</button>
							</form>
						</div>
					{:else}
						<div class="messages-container">
							<h2>Analysis Progress</h2>
							<div class="messages-list">
								{#each messages as message}
									<div class="message {message.role}">
										<div class="message-role">{message.role}</div>
										<div class="message-content">{message.content}</div>
									</div>
								{/each}
							</div>

							{#if pausedForApproval && lastAgentOutput}
								<ApprovalGate
									stage={currentStage}
									agentOutput={lastAgentOutput}
									onApprove={handleApprove}
									onReject={handleReject}
									onForceProceed={handleForceProceed}
									loading={executing}
								/>
							{/if}

							{#if currentStage === 'completed'}
								<div class="completion-banner">
									<h3>Venture Analysis Complete!</h3>
									<p>Your venture planning workflow has finished successfully.</p>
									<button class="btn btn-primary" on:click={resetForm}>
										Start New Analysis
									</button>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{:else}
				<div class="empty-state">
					<div class="empty-icon">🚀</div>
					<h3>Start a New Venture Analysis</h3>
					<p>
						Select an existing thread or click the + button to begin analyzing a new venture
						idea.
					</p>
				</div>
			{/if}
		</section>
	</main>
</div>

<style>
	.venture-planner {
		min-height: 100vh;
		background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
		color: #e4e4e7;
	}

	.planner-header {
		padding: 2rem;
		text-align: center;
		border-bottom: 1px solid #3f3f46;
		background: rgba(0, 0, 0, 0.2);
	}

	.planner-header h1 {
		font-size: 2rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		background: linear-gradient(90deg, #3b82f6, #8b5cf6);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.planner-header p {
		color: #a1a1aa;
		font-size: 0.9rem;
	}

	.planner-main {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 1.5rem;
		max-width: 1800px;
		margin: 0 auto;
		padding: 1.5rem;
		min-height: calc(100vh - 150px);
	}

	.planner-sidebar {
		background: #1e1e24;
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
		background: #27272a;
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
		background: #3b82f6;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		transition: all 0.2s;
	}

	.btn-new:hover {
		background: #2563eb;
		transform: scale(1.05);
	}

	.threads-list {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.thread-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.thread-item:hover {
		background: #27272a;
	}

	.thread-item.selected {
		background: #3b82f6;
	}

	.thread-info {
		flex: 1;
		min-width: 0;
	}

	.thread-id {
		font-weight: 600;
		color: #e4e4e7;
		font-size: 0.875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.thread-meta {
		font-size: 0.75rem;
		color: #a1a1aa;
		margin-top: 0.25rem;
	}

	.btn-delete {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		border: none;
		background: transparent;
		color: #ef4444;
		cursor: pointer;
		font-size: 1.25rem;
		line-height: 1;
		opacity: 0.6;
		transition: all 0.2s;
	}

	.btn-delete:hover {
		opacity: 1;
		background: rgba(239, 68, 68, 0.1);
	}

	.empty-threads {
		padding: 2rem;
		text-align: center;
		color: #71717a;
		font-size: 0.875rem;
	}

	.planner-content {
		background: #1e1e24;
		border-radius: 12px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.workspace {
		flex: 1;
		padding: 1.5rem;
		overflow-y: auto;
	}

	.venture-form {
		max-width: 800px;
		margin: 0 auto;
	}

	.venture-form h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 2rem;
		color: #e4e4e7;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: #a1a1aa;
		font-size: 0.875rem;
	}

	.form-group input,
	.form-group textarea {
		width: 100%;
		padding: 0.75rem 1rem;
		background: #27272a;
		border: 1px solid #3f3f46;
		border-radius: 8px;
		color: #e4e4e7;
		font-family: inherit;
		font-size: 0.9rem;
		transition: all 0.2s;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.form-group input:disabled,
	.form-group textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.form-group textarea {
		min-height: 120px;
		resize: vertical;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		border: none;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: linear-gradient(135deg, #3b82f6, #8b5cf6);
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: linear-gradient(135deg, #2563eb, #7c3aed);
		transform: translateY(-1px);
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

	.messages-container h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 1.5rem;
		color: #e4e4e7;
	}

	.messages-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.message {
		padding: 1rem;
		border-radius: 8px;
		background: #27272a;
	}

	.message.user {
		background: #1e3a5f;
	}

	.message.assistant {
		background: #1a1f2e;
		border-left: 3px solid #3b82f6;
	}

	.message.system {
		background: #1f1f1f;
		opacity: 0.8;
	}

	.message-role {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		margin-bottom: 0.5rem;
		color: #a1a1aa;
	}

	.message-content {
		white-space: pre-wrap;
		line-height: 1.6;
		color: #d4d4d8;
	}

	.completion-banner {
		text-align: center;
		padding: 3rem;
		background: linear-gradient(135deg, #065f46, #064e3b);
		border-radius: 12px;
	}

	.completion-banner h3 {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: #6ee7b7;
	}

	.completion-banner p {
		color: #a7f3d0;
		margin-bottom: 1.5rem;
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

	.empty-icon {
		font-size: 4rem;
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

	@media (max-width: 1024px) {
		.planner-main {
			grid-template-columns: 1fr;
		}

		.planner-sidebar {
			max-height: 250px;
		}

		.form-row {
			grid-template-columns: 1fr;
		}
	}
</style>
