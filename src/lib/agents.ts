/**
 * Pre-built agents for common LangGraph workflows
 * Includes research, writing, and critic agents using OpenAI
 */

import { AgentState, type AgentFunction } from "./state";
import { openai } from "./openai";

// Re-export AgentState for convenience
export type { AgentFunction } from "./state";
export { AgentState };

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  temperature?: number;
  model?: string;
}

/**
 * Create an LLM-powered agent
 */
export function createLLMAgent(config: AgentConfig): AgentFunction {
  return async (state: AgentState) => {
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: config.systemPrompt },
    ];

    // Add conversation history
    for (const msg of state.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    try {
      const response = await openai.chat.completions.create({
        model: config.model || "gpt-4o-mini",
        messages,
        temperature: config.temperature || 0.7,
      });

      const content = response.choices[0].message.content || "No response";
      state.addMessage({ role: "assistant", content });

      return state;
    } catch (error) {
      state.addMessage({
        role: "system",
        content: `Error in ${config.name}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return state;
    }
  };
}

/**
 * Research agent - gathers information on a topic
 */
export const researcherAgent: AgentFunction = createLLMAgent({
  name: "researcher",
  systemPrompt: `You are a research agent. Your task is to:
1. Analyze the user's query and identify key topics
2. Provide comprehensive information on those topics
3. Cite sources and provide references where applicable
4. Organize information in a clear, structured manner

After your research, pass control to the writer agent by setting nextAgent to 'writer'.`,
  temperature: 0.5,
});

/**
 * Writer agent - creates content based on research
 */
export const writerAgent: AgentFunction = createLLMAgent({
  name: "writer",
  systemPrompt: `You are a content writer agent. Your task is to:
1. Review the research information provided
2. Create engaging, well-structured content
3. Ensure clarity and flow
4. Use appropriate tone for the target audience

After writing, pass control to the critic agent by setting nextAgent to 'critic'.`,
  temperature: 0.7,
});

/**
 * Critic agent - reviews and provides feedback
 */
export const criticAgent: AgentFunction = createLLMAgent({
  name: "critic",
  systemPrompt: `You are a critic agent. Your task is to:
1. Review the content for quality, accuracy, and clarity
2. Identify areas for improvement
3. Provide specific, actionable feedback
4. Decide whether the content is ready for publication

If the content needs improvement, set nextAgent to 'writer' to request revisions.
If the content is satisfactory, set nextAgent to null to complete the workflow.`,
  temperature: 0.3,
});

/**
 * Summarizer agent - creates concise summaries
 */
export const summarizerAgent: AgentFunction = createLLMAgent({
  name: "summarizer",
  systemPrompt: `You are a summarizer agent. Your task is to:
1. Read through all previous messages
2. Extract key points and insights
3. Create a concise, accurate summary
4. Highlight any action items or decisions made

After summarizing, set nextAgent to null to complete the workflow.`,
  temperature: 0.4,
});

/**
 * Code reviewer agent - reviews code for quality
 */
export function codeReviewerAgent(language: string): AgentFunction {
  return createLLMAgent({
    name: "code-reviewer",
    systemPrompt: `You are a code reviewer specializing in ${language}. Your task is to:
1. Analyze the provided code for bugs, security issues, and performance problems
2. Check adherence to best practices and coding standards
3. Suggest improvements with specific examples
4. Provide an overall assessment (1-10 scale)

Format your response as structured feedback.`,
    temperature: 0.3,
  });
}

/**
 * Test generator agent - creates unit tests
 */
export function testGeneratorAgent(language: string): AgentFunction {
  return createLLMAgent({
    name: "test-generator",
    systemPrompt: `You are a test generator specializing in ${language}. Your task is to:
1. Analyze the provided code
2. Generate comprehensive unit tests
3. Include edge cases and error scenarios
4. Use the appropriate testing framework for ${language}

Provide only the test code without explanations.`,
    temperature: 0.4,
  });
}

/**
 * Documentation agent - generates documentation
 */
export function documentationAgent(
  format: "markdown" | "html" | "javadoc" = "markdown",
): AgentFunction {
  const formatInstructions = {
    markdown:
      "Use Markdown formatting with headers, code blocks, and bullet points.",
    html: "Use HTML5 semantic tags with proper structure.",
    javadoc:
      "Use Javadoc-style comments with @param, @return, and @throws tags.",
  };

  return createLLMAgent({
    name: "documentation",
    systemPrompt: `You are a documentation generator. Your task is to:
1. Analyze the provided code or description
2. Generate clear, comprehensive documentation
3. ${formatInstructions[format]}
4. Include usage examples where applicable

After documentation, set nextAgent to null to complete.`,
    temperature: 0.5,
  });
}

/**
 * Create a custom agent with a specific role
 */
export function createCustomAgent(
  name: string,
  role: string,
  task: string,
  nextAgent: string | null = null,
  temperature: number = 0.7,
): AgentFunction {
  return createLLMAgent({
    name,
    systemPrompt: `You are a ${role}. Your task is to: ${task}

${nextAgent ? `After completing your task, set nextAgent to '${nextAgent}'.` : "After completing your task, set nextAgent to null to complete the workflow."}`,
    temperature,
  });
}

/**
 * Routing function for research-write-critic workflow
 */
export function researchRoutingFn(state: AgentState): string | null {
  const lastMessage = state.messages[state.messages.length - 1];

  if (lastMessage.role === "assistant") {
    const content = lastMessage.content.toLowerCase();

    // Check if critic approved
    if (
      content.includes("approved") ||
      content.includes("satisfactory") ||
      content.includes("ready")
    ) {
      return null; // End workflow
    }

    // Check if critic requested revision
    if (
      content.includes("improve") ||
      content.includes("revise") ||
      content.includes("needs work")
    ) {
      return "writer"; // Send back to writer
    }
  }

  // Default flow: researcher -> writer -> critic
  const lastAgent = state.getMetadata<string>("lastAgent");
  if (lastAgent === "researcher") return "writer";
  if (lastAgent === "writer") return "critic";

  return null;
}

/**
 * Multi-agent workflow factory
 */
export function createResearchWorkflow() {
  const agents: Record<string, AgentFunction> = {
    researcher: async (state: AgentState) => {
      const result = await researcherAgent(state);
      result.setNextAgent("writer");
      result.setMetadata("lastAgent", "researcher");
      return result;
    },
    writer: async (state: AgentState) => {
      const result = await writerAgent(state);
      result.setNextAgent("critic");
      result.setMetadata("lastAgent", "writer");
      return result;
    },
    critic: async (state: AgentState) => {
      const result = await criticAgent(state);
      const next = researchRoutingFn(result);
      result.setNextAgent(next);
      result.setMetadata("lastAgent", "critic");
      return result;
    },
  };

  return agents;
}

/**
 * Code review workflow factory
 */
export function createCodeReviewWorkflow(language: string) {
  const agents: Record<string, AgentFunction> = {
    reviewer: async (state: AgentState) => {
      const result = await codeReviewerAgent(language)(state);
      result.setNextAgent("test-generator");
      return result;
    },
    "test-generator": async (state: AgentState) => {
      const result = await testGeneratorAgent(language)(state);
      result.setNextAgent("documentation");
      return result;
    },
    documentation: async (state: AgentState) => {
      const result = await documentationAgent("markdown")(state);
      result.setNextAgent(null);
      return result;
    },
  };

  return agents;
}
