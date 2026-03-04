export type RuleDomain =
  | 'marketing'
  | 'cost'
  | 'inventory'
  | 'decisions'
  | 'predictions';

export type RuleSeverity = 'low' | 'medium' | 'high';

export interface RuleEvaluationContext {
  storeId: string;
  evaluationTime: Date;
}

export interface RuleHit<TDetail = Record<string, unknown>> {
  id: string;
  domain: RuleDomain;
  severity: RuleSeverity;
  summary: string;
  detail: TDetail;
  tags: string[];
  evaluatedAt: string;
  storeId: string;
  recommendations?: string[];
}

export interface RuleDefinition<TPayload, TDetail = Record<string, unknown>> {
  id: string;
  name: string;
  description: string;
  domain: RuleDomain;
  severity: RuleSeverity;
  tags: string[];
  evaluate(
    payload: TPayload,
    context: RuleEvaluationContext,
  ): RuleHit<TDetail> | null;
}
