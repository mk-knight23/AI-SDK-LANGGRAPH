/**
 * Venture Planning Graph
 * Stateful multi-agent workflow for venture planning with cyclic execution,
 * checkpointing, and human-in-the-loop approval gates
 */

import { AgentState, type AgentFunction } from "../state";
import { openai } from "../openai";
import type {
  VenturePlanState,
  VentureIdea,
  VentureStage,
  MarketAnalysis,
  FinancialProjections,
  RiskAssessment,
  InvestmentRecommendation,
} from "../types/venture";

// Stage ordering for the venture planning workflow
const STAGE_ORDER: VentureStage[] = [
  "idea_validation",
  "market_analysis",
  "financial_planning",
  "risk_assessment",
  "investment_advice",
  "completed",
];

/**
 * Initialize venture planning state from input
 */
export function initializeVentureState(
  ventureIdea: VentureIdea,
  messages: Array<{ role: string; content: string }> = [],
): AgentState {
  const state = new AgentState();

  // Add venture idea metadata
  state.setMetadata("ventureIdea", ventureIdea);
  state.setMetadata("stage", "idea_validation");
  state.setMetadata("approvalHistory", []);

  // Add initial messages
  state.addMessage({
    role: "system",
    content: `Venture planning initiated for: ${ventureIdea.title}\nIndustry: ${ventureIdea.industry}\nDescription: ${ventureIdea.description}\nTarget Market: ${ventureIdea.targetMarket}\nBusiness Model: ${ventureIdea.businessModel}`,
  });

  for (const msg of messages) {
    state.addMessage({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    });
  }

  state.setNextAgent("idea_validator");
  return state;
}

/**
 * Get next stage in the workflow
 */
export function getNextStage(currentStage: VentureStage): VentureStage | null {
  const index = STAGE_ORDER.indexOf(currentStage);
  if (index === -1 || index >= STAGE_ORDER.length - 1) {
    return "completed";
  }
  return STAGE_ORDER[index + 1];
}

/**
 * Get previous stage in the workflow (for revisions)
 */
export function getPreviousStage(
  currentStage: VentureStage,
): VentureStage | null {
  const index = STAGE_ORDER.indexOf(currentStage);
  if (index <= 0) {
    return null;
  }
  return STAGE_ORDER[index - 1];
}

/**
 * Idea Validator Agent - Validates the venture concept
 */
export const ideaValidatorAgent: AgentFunction = async (state: AgentState) => {
  const ventureIdea = state.getMetadata<VentureIdea>("ventureIdea");
  if (!ventureIdea) {
    state.addMessage({
      role: "system",
      content: "Error: No venture idea provided",
    });
    state.setNextAgent(null);
    return state;
  }

  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: `You are an Idea Validator agent. Your task is to:
1. Evaluate the feasibility and potential of the venture idea
2. Identify strengths and weaknesses
3. Suggest improvements or pivots
4. Rate the idea on a scale of 1-10
5. Decide whether to proceed to market analysis

Venture Idea:
- Title: ${ventureIdea.title}
- Description: ${ventureIdea.description}
- Industry: ${ventureIdea.industry}
- Target Market: ${ventureIdea.targetMarket}
- Business Model: ${ventureIdea.businessModel}

Provide a detailed analysis and conclude with one of:
- "PROCEED" if the idea is worth exploring further
- "REVISE" if the idea needs refinement before proceeding
- "REJECT" if the idea is fundamentally flawed`,
    },
  ];

  // Add conversation history
  for (const msg of state.messages.slice(-10)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.5,
    });

    const content = response.choices[0].message.content || "No response";
    state.addMessage({ role: "assistant", content });
    state.setMetadata("ideaValidation", content);

    // Determine next step based on response
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes("reject")) {
      state.setNextAgent(null); // End workflow
      state.setMetadata("stage", "completed");
    } else if (lowerContent.includes("revise")) {
      state.setNextAgent("idea_validator"); // Retry
      state.requestApproval(); // Need human input for revision
    } else {
      state.setNextAgent("market_analyzer");
      state.setMetadata("stage", "market_analysis");
    }

    return state;
  } catch (error) {
    state.addMessage({
      role: "system",
      content: `Error in Idea Validator: ${error instanceof Error ? error.message : String(error)}`,
    });
    state.setNextAgent(null);
    return state;
  }
};

/**
 * Market Analyzer Agent - Analyzes market potential
 */
export const marketAnalyzerAgent: AgentFunction = async (state: AgentState) => {
  const ventureIdea = state.getMetadata<VentureIdea>("ventureIdea");
  if (!ventureIdea) {
    state.addMessage({
      role: "system",
      content: "Error: No venture idea provided",
    });
    state.setNextAgent(null);
    return state;
  }

  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: `You are a Market Analyzer agent. Your task is to:
1. Estimate market size (TAM, SAM, SOM)
2. Analyze competitive landscape
3. Identify market growth trends
4. Highlight opportunities and threats
5. Provide market entry recommendations

Venture:
- Title: ${ventureIdea.title}
- Industry: ${ventureIdea.industry}
- Target Market: ${ventureIdea.targetMarket}

Provide detailed market analysis with specific numbers where possible.
Format your response with sections: Market Size, Competition, Growth Rate, Opportunities, Threats.`,
    },
  ];

  for (const msg of state.messages.slice(-10)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.4,
    });

    const content = response.choices[0].message.content || "No response";
    state.addMessage({ role: "assistant", content });
    state.setMetadata("marketAnalysis", content);

    state.setNextAgent("financial_planner");
    state.setMetadata("stage", "financial_planning");

    return state;
  } catch (error) {
    state.addMessage({
      role: "system",
      content: `Error in Market Analyzer: ${error instanceof Error ? error.message : String(error)}`,
    });
    state.setNextAgent(null);
    return state;
  }
};

/**
 * Financial Planner Agent - Creates financial projections
 */
export const financialPlannerAgent: AgentFunction = async (
  state: AgentState,
) => {
  const ventureIdea = state.getMetadata<VentureIdea>("ventureIdea");
  const marketAnalysis = state.getMetadata<string>("marketAnalysis");

  if (!ventureIdea) {
    state.addMessage({
      role: "system",
      content: "Error: No venture idea provided",
    });
    state.setNextAgent(null);
    return state;
  }

  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: `You are a Financial Planner agent. Your task is to:
1. Create 5-year financial projections
2. Estimate revenue, expenses, and profit
3. Calculate cash flow
4. Determine break-even point
5. Assess capital requirements

Venture:
- Title: ${ventureIdea.title}
- Business Model: ${ventureIdea.businessModel}

${marketAnalysis ? `\nMarket Analysis Context:\n${marketAnalysis.substring(0, 1000)}...` : ""}

Provide detailed projections for Years 1-5 in a structured format.
Include: Revenue, Expenses, Profit, Cash Flow for each year.
Calculate total revenue, expenses, and profit margin.`,
    },
  ];

  for (const msg of state.messages.slice(-15)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.3,
    });

    const content = response.choices[0].message.content || "No response";
    state.addMessage({ role: "assistant", content });
    state.setMetadata("financialProjections", content);

    state.setNextAgent("risk_assessor");
    state.setMetadata("stage", "risk_assessment");

    return state;
  } catch (error) {
    state.addMessage({
      role: "system",
      content: `Error in Financial Planner: ${error instanceof Error ? error.message : String(error)}`,
    });
    state.setNextAgent(null);
    return state;
  }
};

/**
 * Risk Assessor Agent - Evaluates risks
 */
export const riskAssessorAgent: AgentFunction = async (state: AgentState) => {
  const ventureIdea = state.getMetadata<VentureIdea>("ventureIdea");
  const financialProjections = state.getMetadata<string>(
    "financialProjections",
  );

  if (!ventureIdea) {
    state.addMessage({
      role: "system",
      content: "Error: No venture idea provided",
    });
    state.setNextAgent(null);
    return state;
  }

  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: `You are a Risk Assessor agent. Your task is to:
1. Identify key risks (market, operational, financial)
2. Assess probability and impact of each risk
3. Provide mitigation strategies
4. Rate overall risk level
5. Suggest risk mitigation measures

Venture:
- Title: ${ventureIdea.title}
- Industry: ${ventureIdea.industry}

${financialProjections ? `\nFinancial Context:\n${financialProjections.substring(0, 1000)}...` : ""}

Provide a comprehensive risk assessment.
Format each risk with: Name, Description, Probability (Low/Medium/High), Impact (Low/Medium/High), Mitigation.
Conclude with overall risk rating for: Market, Operational, Financial, and Overall.`,
    },
  ];

  for (const msg of state.messages.slice(-20)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.4,
    });

    const content = response.choices[0].message.content || "No response";
    state.addMessage({ role: "assistant", content });
    state.setMetadata("riskAssessment", content);

    state.setNextAgent("investment_advisor");
    state.setMetadata("stage", "investment_advice");

    return state;
  } catch (error) {
    state.addMessage({
      role: "system",
      content: `Error in Risk Assessor: ${error instanceof Error ? error.message : String(error)}`,
    });
    state.setNextAgent(null);
    return state;
  }
};

/**
 * Investment Advisor Agent - Provides investment recommendation
 */
export const investmentAdvisorAgent: AgentFunction = async (
  state: AgentState,
) => {
  const ventureIdea = state.getMetadata<VentureIdea>("ventureIdea");
  const ideaValidation = state.getMetadata<string>("ideaValidation");
  const marketAnalysis = state.getMetadata<string>("marketAnalysis");
  const financialProjections = state.getMetadata<string>(
    "financialProjections",
  );
  const riskAssessment = state.getMetadata<string>("riskAssessment");

  if (!ventureIdea) {
    state.addMessage({
      role: "system",
      content: "Error: No venture idea provided",
    });
    state.setNextAgent(null);
    return state;
  }

  const messages: Array<{ role: string; content: string }> = [
    {
      role: "system",
      content: `You are an Investment Advisor agent. Your task is to:
1. Synthesize all previous analysis
2. Provide an investment recommendation (INVEST/HOLD/PASS)
3. Give a confidence score (0-100)
4. Estimate ROI
5. List key strengths and concerns
6. Specify conditions for investment

Venture: ${ventureIdea.title}

Previous Analysis:
${ideaValidation ? `\n--- Idea Validation ---\n${ideaValidation.substring(0, 500)}...` : ""}
${marketAnalysis ? `\n--- Market Analysis ---\n${marketAnalysis.substring(0, 500)}...` : ""}
${financialProjections ? `\n--- Financial Projections ---\n${financialProjections.substring(0, 500)}...` : ""}
${riskAssessment ? `\n--- Risk Assessment ---\n${riskAssessment.substring(0, 500)}...` : ""}

Conclude with your investment recommendation and reasoning.`,
    },
  ];

  for (const msg of state.messages.slice(-25)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.3,
    });

    const content = response.choices[0].message.content || "No response";
    state.addMessage({ role: "assistant", content });
    state.setMetadata("investmentRecommendation", content);

    state.setNextAgent(null);
    state.setMetadata("stage", "completed");

    return state;
  } catch (error) {
    state.addMessage({
      role: "system",
      content: `Error in Investment Advisor: ${error instanceof Error ? error.message : String(error)}`,
    });
    state.setNextAgent(null);
    return state;
  }
};

/**
 * All venture planning agents
 */
export const ventureAgents: Record<string, AgentFunction> = {
  idea_validator: ideaValidatorAgent,
  market_analyzer: marketAnalyzerAgent,
  financial_planner: financialPlannerAgent,
  risk_assessor: riskAssessorAgent,
  investment_advisor: investmentAdvisorAgent,
};

/**
 * Get agent name for a given stage
 */
export function getAgentForStage(stage: VentureStage): string | null {
  switch (stage) {
    case "idea_validation":
      return "idea_validator";
    case "market_analysis":
      return "market_analyzer";
    case "financial_planning":
      return "financial_planner";
    case "risk_assessment":
      return "risk_assessor";
    case "investment_advice":
      return "investment_advisor";
    default:
      return null;
  }
}

/**
 * Routing function for venture planning workflow
 */
export function ventureRoutingFn(state: AgentState): string | null {
  const currentStage = state.getMetadata<VentureStage>("stage");
  const nextAgent = state.getNextAgent();

  // If next agent is already set, use it
  if (nextAgent) {
    return nextAgent;
  }

  // If waiting for approval, return __human__
  if (state.isWaitingForApproval()) {
    return "__human__";
  }

  // Get next stage
  const nextStage = currentStage
    ? getNextStage(currentStage)
    : "idea_validation";
  return getAgentForStage(nextStage);
}
