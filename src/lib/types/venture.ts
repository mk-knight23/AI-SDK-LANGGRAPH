/**
 * Venture planning types and interfaces
 * Defines the state schema for venture planning workflows
 */

import type { Message } from "../state";

// Re-export Message for convenience
export type { Message };

export type VentureStage =
  | "idea_validation"
  | "market_analysis"
  | "financial_planning"
  | "risk_assessment"
  | "investment_advice"
  | "completed";

export type ApprovalDecision = "approved" | "rejected" | "needs_revision";

export interface VentureIdea {
  title: string;
  description: string;
  industry: string;
  targetMarket: string;
  businessModel: string;
}

export interface MarketAnalysis {
  tam: number; // Total Addressable Market
  sam: number; // Serviceable Addressable Market
  som: number; // Serviceable Obtainable Market
  competition: string;
  growthRate: number;
  opportunities: string[];
  threats: string[];
}

export interface FinancialProjections {
  year1: YearProjection;
  year2: YearProjection;
  year3: YearProjection;
  year4: YearProjection;
  year5: YearProjection;
  totalRevenue: number;
  totalExpenses: number;
  profitMargin: number;
}

export interface YearProjection {
  revenue: number;
  expenses: number;
  profit: number;
  cashFlow: number;
}

export interface RiskAssessment {
  risks: Risk[];
  marketRisk: "low" | "medium" | "high";
  operationalRisk: "low" | "medium" | "high";
  financialRisk: "low" | "medium" | "high";
  overallRisk: "low" | "medium" | "high";
}

export interface Risk {
  id: string;
  name: string;
  description: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  mitigation: string;
}

export interface InvestmentRecommendation {
  recommendation: "invest" | "hold" | "pass";
  confidence: number; // 0-100
  estimatedROI: number;
  timeHorizon: string;
  keyStrengths: string[];
  keyConcerns: string[];
  conditions: string[];
}

export interface VenturePlanState {
  stage: VentureStage;
  ventureIdea?: VentureIdea;
  marketAnalysis?: MarketAnalysis;
  financialProjections?: FinancialProjections;
  riskAssessment?: RiskAssessment;
  investmentRecommendation?: InvestmentRecommendation;
  approvalHistory: ApprovalRecord[];
  messages: Message[];
  nextAgent: string | null;
  pendingApproval: boolean;
}

export interface ApprovalRecord {
  stage: VentureStage;
  decision: ApprovalDecision;
  timestamp: number;
  feedback?: string;
}

export interface VenturePlanInput {
  ventureIdea: VentureIdea;
  messages?: Message[];
  existingState?: VenturePlanState;
}

export interface ApprovalRequest {
  threadId: string;
  stage: VentureStage;
  approved: boolean;
  feedback?: string;
  forceNextStage?: boolean;
}

export interface VenturePlanResponse {
  success: boolean;
  stage: VentureStage;
  venturePlan: VenturePlanState;
  nextAgent: string | null;
  pausedForApproval: boolean;
  threadId: string;
  checkpointId?: string;
  error?: string;
}

export interface WorkflowProgress {
  stage: VentureStage;
  percentage: number;
  currentAgent: string;
  completed: boolean;
  pausedForApproval: boolean;
}
