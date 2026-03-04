import { Injectable } from '@nestjs/common';
import { RuleDefinition, RuleHit } from './rule.types';

type ChannelMixEntry = { channel: string; share: number };

export interface MarketingOverviewRulePayload {
  storeId: string;
  evaluationTime: Date;
  activeCount: number;
  upcomingCount: number;
  completedCount: number;
  channelMix: ChannelMixEntry[];
  investableBudget: number;
  cancelledBudget: number;
  averageExpectedLift: number | null;
  averageActualLift: number | null;
}

export interface CostOverviewRulePayload {
  storeId: string;
  evaluationTime: Date;
  totalCost: number;
  revenue: number | null;
  grossMargin: number | null;
  laborRatio: number;
  marketingRatio: number;
  netProfit: number | null;
  expectedFootTraffic: number | null;
  actualFootTraffic: number | null;
  cogsVariance: number | null;
}

export interface InventoryOverviewRulePayload {
  storeId: string;
  evaluationTime: Date;
  summary: {
    totalSkus: number;
    criticalSkus: number;
    lowStockSkus: number;
    healthySkus: number;
    recommendedRestockUnits: number;
  };
  items: Array<{
    id: string;
    sku: string;
    status: 'critical' | 'low' | 'normal';
    currentStock: number;
    reorderPoint: number;
    safetyStock: number;
    restockAmount: number | null;
    daysCover: number | null;
  }>;
  forecastReference: {
    targetDate: string;
    modelVersion?: string | null;
  } | null;
}

export interface DecisionOverviewRulePayload {
  storeId: string;
  evaluationTime: Date;
  summary: {
    pending: number;
    applied: number;
    dismissed: number;
    lastDecisionAt: string | null;
  };
  lastAppliedAt: Date | null;
  snapshots: Array<{
    id: string;
    status: string;
    decisionType: string;
    createdAt: Date;
    appliedAt: Date | null;
  }>;
}

export interface SalesForecastRulePayload {
  storeId: string;
  evaluationTime: Date;
  targetDate: string;
  generatedAt: Date;
  horizon: string;
  summary: {
    totalDemand: number;
    expectedShortage: number;
    criticalCount: number;
    itemCount: number;
  };
  items: Array<{
    sku: string;
    status: 'healthy' | 'watch' | 'critical';
    restockRecommendation: number | null;
  }>;
}

export interface TrafficForecastRulePayload {
  storeId: string;
  evaluationTime: Date;
  targetDate: string;
  generatedAt: Date;
  horizon: string;
  points: Array<{
    time: string;
    customers: number;
    lower?: number | null;
    upper?: number | null;
  }>;
}

export interface MenuAdjustmentRulePayload {
  storeId: string;
  evaluationTime: Date;
  promote: Array<{ ingredient: string; restock: number | null }>;
  review: Array<{ ingredient: string }>;
  suppress: Array<{ ingredient: string }>;
  scoredItems: Array<{
    ingredient: string;
    demand: number;
    stock: number;
    score: number;
  }>;
}

export interface MarketingRecommendationRulePayload {
  storeId: string;
  evaluationTime: Date;
  primaryGoal: string | null;
  priorities: Array<{ title: string; category: string }>;
  channelMix: Array<{ channel: string; share: number }>;
  investableBudget: number;
  cancelledBudget: number;
  underperformingCount: number;
  upcomingCount: number;
  expiringCount: number;
  overridesApplied: number;
}

@Injectable()
export class RulesRegistryService {
  private readonly marketingOverviewRules: Array<
    RuleDefinition<MarketingOverviewRulePayload>
  > = [
    {
      id: 'marketing.no-active-campaigns',
      name: 'Active Campaign Coverage',
      description:
        'Raise awareness when no campaign is running even though future launches exist.',
      domain: 'marketing',
      severity: 'medium',
      tags: ['coverage', 'continuity'],
      evaluate(payload, context) {
        if (payload.activeCount === 0 && payload.upcomingCount > 0) {
          const hit: RuleHit = {
            id: 'marketing.no-active-campaigns',
            domain: 'marketing',
            severity: 'medium',
            summary:
              'No active campaigns detected, upcoming initiatives are queued but inactive.',
            detail: {
              activeCount: payload.activeCount,
              upcomingCount: payload.upcomingCount,
            },
            tags: ['coverage', 'continuity'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Review launch-readiness checklist with the regional marketing lead.',
            ],
          };
          return hit;
        }
        return null;
      },
    },
    {
      id: 'marketing.channel-concentration',
      name: 'Channel Mix Concentration',
      description:
        'Warn when a single channel owns the majority of active spend without diversification.',
      domain: 'marketing',
      severity: 'high',
      tags: ['portfolio', 'risk'],
      evaluate(payload, context) {
        const lead = payload.channelMix[0];
        if (lead && lead.share >= 65) {
          return {
            id: 'marketing.channel-concentration',
            domain: 'marketing',
            severity: 'high',
            summary: `Channel ${lead.channel} owns ${lead.share}% of active spend; diversify allocations to avoid overexposure.`,
            detail: {
              leadChannel: lead.channel,
              share: lead.share,
            },
            tags: ['portfolio', 'risk'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Shift 5-10% of spend toward secondary channels to validate acquisition efficiency.',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'marketing.cancellation-drag',
      name: 'Cancellation Drag',
      description:
        'Identify when cancelled budgets erode more than a quarter of investable spend.',
      domain: 'marketing',
      severity: 'medium',
      tags: ['execution', 'finance'],
      evaluate(payload, context) {
        if (
          payload.investableBudget > 0 &&
          payload.cancelledBudget > payload.investableBudget * 0.25
        ) {
          return {
            id: 'marketing.cancellation-drag',
            domain: 'marketing',
            severity: 'medium',
            summary:
              'Cancelled budgets exceeded 25% of active investment; sync with finance on pipeline stability.',
            detail: {
              investableBudget: payload.investableBudget,
              cancelledBudget: payload.cancelledBudget,
            },
            tags: ['execution', 'finance'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Schedule a go/no-go review to tighten launch dependencies.',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'marketing.lift-gap',
      name: 'Actual vs Expected Lift Gap',
      description:
        'Flag when realized lift underperforms expectations by more than 20%.',
      domain: 'marketing',
      severity: 'medium',
      tags: ['performance'],
      evaluate(payload, context) {
        if (
          payload.averageActualLift !== null &&
          payload.averageExpectedLift !== null &&
          payload.averageExpectedLift > 0 &&
          payload.averageActualLift < payload.averageExpectedLift * 0.8
        ) {
          return {
            id: 'marketing.lift-gap',
            domain: 'marketing',
            severity: 'medium',
            summary:
              'Actual lift trails expectations by over 20%, consider optimizing creatives or targeting.',
            detail: {
              averageActualLift: payload.averageActualLift,
              averageExpectedLift: payload.averageExpectedLift,
            },
            tags: ['performance'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Audit creative fatigue and refresh targeting for underperforming cohorts.',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'marketing.completed-insights',
      name: 'Completed Campaign Insights',
      description:
        'Encourage teams to leverage completed campaign data when it is available.',
      domain: 'marketing',
      severity: 'low',
      tags: ['learning'],
      evaluate(payload, context) {
        if (payload.investableBudget > 0 && payload.completedCount > 0) {
          return {
            id: 'marketing.completed-insights',
            domain: 'marketing',
            severity: 'low',
            summary:
              'Completed campaign data available for benchmarking; feed learnings into the next sprint.',
            detail: {
              completedCount: payload.completedCount,
            },
            tags: ['learning'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Review post-mortems and fold insights into upcoming briefs.',
            ],
          };
        }
        return null;
      },
    },
  ];

  private readonly costOverviewRules: Array<
    RuleDefinition<CostOverviewRulePayload>
  > = [
    {
      id: 'cost.margin-erosion',
      name: 'Gross Margin Erosion',
      description:
        'Detects when gross margin drops below the target guardrail for the selected window.',
      domain: 'cost',
      severity: 'high',
      tags: ['margin', 'finance'],
      evaluate(payload, context) {
        if (payload.grossMargin !== null && payload.grossMargin < 0.58) {
          return {
            id: 'cost.margin-erosion',
            domain: 'cost',
            severity: 'high',
            summary:
              'Gross margin dipped below 58%, review ingredient cost spikes and discount strategy.',
            detail: {
              grossMargin: payload.grossMargin,
            },
            tags: ['margin', 'finance'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Audit vendor pricing and promotional discounts with finance.',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cost.labor-overrun',
      name: 'Labor Share Overrun',
      description:
        'Highlights when labor ratio exceeds operational thresholds for the period.',
      domain: 'cost',
      severity: 'medium',
      tags: ['labor', 'operations'],
      evaluate(payload, context) {
        if (payload.laborRatio > 0.28) {
          return {
            id: 'cost.labor-overrun',
            domain: 'cost',
            severity: 'medium',
            summary:
              'Labor share exceeded 28% of total cost; validate staffing plan against actual traffic.',
            detail: {
              laborRatio: payload.laborRatio,
            },
            tags: ['labor', 'operations'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Realign staffing roster with forecasted foot traffic and shift mix.',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cost.marketing-inefficiency',
      name: 'Marketing Spend Inefficiency',
      description:
        'Flags marketing spend that outweighs revenue contribution within the review window.',
      domain: 'cost',
      severity: 'medium',
      tags: ['marketing', 'finance'],
      evaluate(payload, context) {
        if (
          payload.marketingRatio > 0.2 &&
          (payload.revenue === null ||
            payload.revenue < payload.totalCost * 1.1)
        ) {
          return {
            id: 'cost.marketing-inefficiency',
            domain: 'cost',
            severity: 'medium',
            summary:
              'Marketing spend crossed 20% of cost without a matching revenue lift; revisit channel mix with growth.',
            detail: {
              marketingRatio: payload.marketingRatio,
              revenue: payload.revenue,
              totalCost: payload.totalCost,
            },
            tags: ['marketing', 'finance'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Prioritise performance channels or trim underperforming flights before next cycle.',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cost.net-loss',
      name: 'Net Profit Loss',
      description:
        'Surfaces when the latest snapshot reports a negative net profit.',
      domain: 'cost',
      severity: 'medium',
      tags: ['finance'],
      evaluate(payload, context) {
        if (payload.netProfit !== null && payload.netProfit < 0) {
          return {
            id: 'cost.net-loss',
            domain: 'cost',
            severity: 'medium',
            summary: 'Net profit turned negative in the latest snapshot.',
            detail: {
              netProfit: payload.netProfit,
            },
            tags: ['finance'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Escalate to finance for cash-flow review and short-term cost containment.',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cost.traffic-drop',
      name: 'Traffic Gap',
      description:
        'Alerts when actual guest traffic falls materially below forecast.',
      domain: 'cost',
      severity: 'medium',
      tags: ['demand', 'operations'],
      evaluate(payload, context) {
        if (
          payload.expectedFootTraffic !== null &&
          payload.actualFootTraffic !== null &&
          payload.actualFootTraffic < payload.expectedFootTraffic * 0.9
        ) {
          return {
            id: 'cost.traffic-drop',
            domain: 'cost',
            severity: 'medium',
            summary:
              'Foot traffic fell more than 10% below forecast; coordinate promos with staffing and reservations.',
            detail: {
              expectedFootTraffic: payload.expectedFootTraffic,
              actualFootTraffic: payload.actualFootTraffic,
            },
            tags: ['demand', 'operations'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Trigger targeted campaigns and adjust labor scheduling to stabilise throughput.',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'cost.cogs-variance',
      name: 'Ingredient Cost Variance',
      description:
        'Detects elevated COGS variance indicating supplier or operational issues.',
      domain: 'cost',
      severity: 'medium',
      tags: ['cogs', 'supply'],
      evaluate(payload, context) {
        if (payload.cogsVariance !== null && payload.cogsVariance > 0.12) {
          return {
            id: 'cost.cogs-variance',
            domain: 'cost',
            severity: 'medium',
            summary:
              'Ingredient variance exceeded 12%; audit supplier pricing and prep waste before next inventory cycle.',
            detail: {
              cogsVariance: payload.cogsVariance,
            },
            tags: ['cogs', 'supply'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Review supplier invoices and prep process to reduce waste.',
            ],
          };
        }
        return null;
      },
    },
  ];

  private readonly inventoryOverviewRules: Array<
    RuleDefinition<InventoryOverviewRulePayload>
  > = [
    {
      id: 'inventory.critical-stock',
      name: 'Critical Stock Alert',
      description:
        'Highlights SKUs that have fallen beneath critical thresholds.',
      domain: 'inventory',
      severity: 'high',
      tags: ['stock', 'critical'],
      evaluate(payload, context) {
        const criticalItems = payload.items.filter(
          (item) => item.status === 'critical',
        );
        if (criticalItems.length === 0) {
          return null;
        }
        return {
          id: 'inventory.critical-stock',
          domain: 'inventory',
          severity: 'high',
          summary: `${criticalItems.length} SKU(s) breached critical stock levels; initiate emergency replenishment.`,
          detail: {
            items: criticalItems.map((item) => ({
              sku: item.sku,
              currentStock: item.currentStock,
              reorderPoint: item.reorderPoint,
              safetyStock: item.safetyStock,
            })),
          },
          tags: ['stock', 'critical'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Trigger supplier expedite and validate on-hand counts before service periods.',
          ],
        };
      },
    },
    {
      id: 'inventory.low-stock-trend',
      name: 'Low Stock Trend',
      description:
        'Captures items approaching reorder points to aid proactive purchasing.',
      domain: 'inventory',
      severity: 'medium',
      tags: ['stock', 'monitor'],
      evaluate(payload, context) {
        const lowItems = payload.items.filter((item) => item.status === 'low');
        if (lowItems.length === 0) {
          return null;
        }
        return {
          id: 'inventory.low-stock-trend',
          domain: 'inventory',
          severity: 'medium',
          summary: `${lowItems.length} SKU(s) are trending toward low stock; align reorder with demand plan.`,
          detail: {
            items: lowItems.map((item) => ({
              sku: item.sku,
              currentStock: item.currentStock,
              reorderPoint: item.reorderPoint,
              restockAmount: item.restockAmount,
            })),
          },
          tags: ['stock', 'monitor'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Bundle upcoming purchase orders to optimise freight and supplier lead times.',
          ],
        };
      },
    },
    {
      id: 'inventory.restock-capacity',
      name: 'Restock Capacity Watch',
      description:
        'Signals when recommended restock units exceed operational norms.',
      domain: 'inventory',
      severity: 'medium',
      tags: ['operations', 'restock'],
      evaluate(payload, context) {
        if (payload.summary.recommendedRestockUnits <= 0) {
          return null;
        }
        if (
          payload.summary.recommendedRestockUnits <=
          payload.summary.totalSkus * 5
        ) {
          return null;
        }
        return {
          id: 'inventory.restock-capacity',
          domain: 'inventory',
          severity: 'medium',
          summary:
            'Recommended restock volume is elevated; confirm storage and receiving capacity.',
          detail: {
            recommendedRestockUnits: payload.summary.recommendedRestockUnits,
            totalSkus: payload.summary.totalSkus,
          },
          tags: ['operations', 'restock'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Coordinate with back-of-house to stage incremental deliveries and prevent congestion.',
          ],
        };
      },
    },
    {
      id: 'inventory.forecast-staleness',
      name: 'Forecast Staleness',
      description:
        'Checks whether the forecast reference is missing or outdated versus horizon expectations.',
      domain: 'inventory',
      severity: 'medium',
      tags: ['forecast', 'data-quality'],
      evaluate(payload, context) {
        if (!payload.forecastReference) {
          return {
            id: 'inventory.forecast-staleness',
            domain: 'inventory',
            severity: 'medium',
            summary:
              'No forecast snapshot available; predictive reorder alignment may drift.',
            detail: {},
            tags: ['forecast', 'data-quality'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Trigger analytics pipeline to refresh demand forecast for inventory alignment.',
            ],
          };
        }
        const targetDate = new Date(payload.forecastReference.targetDate);
        const diffDays = Math.abs(
          (context.evaluationTime.getTime() - targetDate.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        if (diffDays > 7) {
          return {
            id: 'inventory.forecast-staleness',
            domain: 'inventory',
            severity: 'medium',
            summary:
              'Forecast snapshot is older than seven days; refresh to avoid demand misalignment.',
            detail: {
              targetDate: payload.forecastReference.targetDate,
              modelVersion: payload.forecastReference.modelVersion ?? null,
            },
            tags: ['forecast', 'data-quality'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Kick off forecast regeneration and reconcile with sales planners.',
            ],
          };
        }
        return null;
      },
    },
  ];

  private readonly decisionOverviewRules: Array<
    RuleDefinition<DecisionOverviewRulePayload>
  > = [
    {
      id: 'decisions.pending-backlog',
      name: 'Pending Decision Backlog',
      description:
        'Flags when pending decisions accumulate beyond manageable thresholds.',
      domain: 'decisions',
      severity: 'high',
      tags: ['workflow', 'governance'],
      evaluate(payload, context) {
        if (payload.summary.pending > 3) {
          return {
            id: 'decisions.pending-backlog',
            domain: 'decisions',
            severity: 'high',
            summary:
              'Pending decisions exceed three items; align cross-functional review to avoid execution delays.',
            detail: {
              pending: payload.summary.pending,
            },
            tags: ['workflow', 'governance'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Schedule a governance stand-up to clear the backlog and unblock execution.',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'decisions.stale-application',
      name: 'Stale Decision Application',
      description:
        'Notifies when the most recent applied decision is older than the freshness guardrail.',
      domain: 'decisions',
      severity: 'medium',
      tags: ['workflow', 'cadence'],
      evaluate(payload, context) {
        if (!payload.lastAppliedAt) {
          return {
            id: 'decisions.stale-application',
            domain: 'decisions',
            severity: 'medium',
            summary: 'No applied decisions found for the selected window.',
            detail: {},
            tags: ['workflow', 'cadence'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Verify execution ownership and confirm the decision framework is being actioned.',
            ],
          };
        }
        const diffHours =
          (context.evaluationTime.getTime() - payload.lastAppliedAt.getTime()) /
          (1000 * 60 * 60);
        if (diffHours > 72) {
          return {
            id: 'decisions.stale-application',
            domain: 'decisions',
            severity: 'medium',
            summary:
              'Last applied decision is older than 72 hours; consider refreshing the playbook.',
            detail: {
              lastAppliedAt: payload.lastAppliedAt.toISOString(),
            },
            tags: ['workflow', 'cadence'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Review recent decision queue and accelerate approvals for critical items.',
            ],
          };
        }
        return null;
      },
    },
    {
      id: 'decisions.dismissed-surge',
      name: 'Dismissed Decision Surge',
      description:
        'Raises awareness when dismissed decisions outpace applied outcomes, hinting at process friction.',
      domain: 'decisions',
      severity: 'medium',
      tags: ['governance', 'process'],
      evaluate(payload, context) {
        if (payload.summary.dismissed >= payload.summary.applied + 2) {
          return {
            id: 'decisions.dismissed-surge',
            domain: 'decisions',
            severity: 'medium',
            summary:
              'Dismissed decisions outnumber applied outcomes; inspect criteria and approval thresholds.',
            detail: {
              dismissed: payload.summary.dismissed,
              applied: payload.summary.applied,
            },
            tags: ['governance', 'process'],
            evaluatedAt: context.evaluationTime.toISOString(),
            storeId: context.storeId,
            recommendations: [
              'Revisit decision criteria with stakeholders to reconcile risk appetite and execution capacity.',
            ],
          };
        }
        return null;
      },
    },
  ];

  private readonly salesForecastRules: Array<
    RuleDefinition<SalesForecastRulePayload>
  > = [
    {
      id: 'predictions.sales.shortage-escalation',
      name: 'Sales Forecast Shortage Escalation',
      description:
        'Escalates when projected shortages exceed the tolerance window for critical SKUs.',
      domain: 'predictions',
      severity: 'high',
      tags: ['forecast', 'supply'],
      evaluate(payload, context) {
        const shortageThreshold = Math.max(
          10,
          payload.summary.totalDemand * 0.15,
        );
        if (payload.summary.expectedShortage <= shortageThreshold) {
          return null;
        }
        const shortage = Number(payload.summary.expectedShortage.toFixed(1));
        const criticalSkus = payload.items
          .filter((item) => item.status === 'critical')
          .map((item) => item.sku);
        return {
          id: 'predictions.sales.shortage-escalation',
          domain: 'predictions',
          severity: 'high',
          summary: `Forecast indicates ${shortage} unit gap across ${criticalSkus.length || payload.summary.criticalCount} critical SKU(s); align replenishment before ${payload.targetDate}.`,
          detail: {
            expectedShortage: shortage,
            criticalSkus,
            horizon: payload.horizon,
          },
          tags: ['forecast', 'supply'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Coordinate with procurement and prep leaders to stage expedited replenishment for forecasted gaps.',
          ],
        };
      },
    },
    {
      id: 'predictions.sales.critical-density',
      name: 'Critical SKU Density',
      description:
        'Highlights when critical status concentrates across the forecasted ingredient slate.',
      domain: 'predictions',
      severity: 'medium',
      tags: ['menu', 'risk'],
      evaluate(payload, context) {
        if (payload.summary.itemCount === 0) {
          return null;
        }
        const ratio = payload.summary.criticalCount / payload.summary.itemCount;
        if (ratio < 0.2) {
          return null;
        }
        return {
          id: 'predictions.sales.critical-density',
          domain: 'predictions',
          severity: 'medium',
          summary: `${payload.summary.criticalCount} of ${payload.summary.itemCount} forecasted ingredients flag as critical; plan menu fallbacks before service execution.`,
          detail: {
            criticalCount: payload.summary.criticalCount,
            totalTracked: payload.summary.itemCount,
            ratio,
          },
          tags: ['menu', 'risk'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Review substitution options with culinary to avoid guest experience gaps while restocks land.',
          ],
        };
      },
    },
    {
      id: 'predictions.sales.snapshot-staleness',
      name: 'Forecast Snapshot Staleness',
      description:
        'Ensures sales forecasts are refreshed within the accepted recency threshold.',
      domain: 'predictions',
      severity: 'medium',
      tags: ['data-quality', 'cadence'],
      evaluate(payload, context) {
        const diffHours =
          (context.evaluationTime.getTime() - payload.generatedAt.getTime()) /
          (1000 * 60 * 60);
        if (diffHours <= 24) {
          return null;
        }
        return {
          id: 'predictions.sales.snapshot-staleness',
          domain: 'predictions',
          severity: 'medium',
          summary: `Sales forecast snapshot is ${Math.round(diffHours)} hours old; refresh the model before committing labor or purchasing plans.`,
          detail: {
            generatedAt: payload.generatedAt.toISOString(),
            horizon: payload.horizon,
          },
          tags: ['data-quality', 'cadence'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Trigger the forecast pipeline and validate inputs (traffic, promos, pricing) before the next standup.',
          ],
        };
      },
    },
  ];

  private readonly trafficForecastRules: Array<
    RuleDefinition<TrafficForecastRulePayload>
  > = [
    {
      id: 'predictions.traffic.low-resolution',
      name: 'Traffic Forecast Resolution',
      description:
        'Flags when traffic forecasts lack sufficient intraday data points.',
      domain: 'predictions',
      severity: 'medium',
      tags: ['staffing', 'forecast'],
      evaluate(payload, context) {
        if (payload.points.length >= 8) {
          return null;
        }
        return {
          id: 'predictions.traffic.low-resolution',
          domain: 'predictions',
          severity: 'medium',
          summary: `Traffic forecast only covers ${payload.points.length} time slot(s); capture finer granularity before staffing handoffs.`,
          detail: {
            horizon: payload.horizon,
            pointsTracked: payload.points.length,
          },
          tags: ['staffing', 'forecast'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Request an hourly forecast export from analytics to align labor scheduling with demand peaks.',
          ],
        };
      },
    },
    {
      id: 'predictions.traffic.variance-spike',
      name: 'Traffic Variance Spike',
      description:
        'Surfaces volatility in predicted footfall to prompt contingency planning.',
      domain: 'predictions',
      severity: 'medium',
      tags: ['volatility', 'operations'],
      evaluate(payload, context) {
        if (payload.points.length < 3) {
          return null;
        }
        const customers = payload.points.map((point) => point.customers);
        const max = Math.max(...customers);
        const min = Math.min(...customers);
        if (max === min) {
          return null;
        }
        const average =
          customers.reduce((total, value) => total + value, 0) /
          customers.length;
        if (average === 0) {
          return null;
        }
        const spanRatio = (max - min) / average;
        if (spanRatio < 0.45) {
          return null;
        }
        return {
          id: 'predictions.traffic.variance-spike',
          domain: 'predictions',
          severity: 'medium',
          summary: `Traffic outlook swings by ${(spanRatio * 100).toFixed(0)}% of average demand; stage flexible labor to absorb peaks.`,
          detail: {
            max,
            min,
            average,
          },
          tags: ['volatility', 'operations'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Pre-brief shift leads on contingency plans (call-ins, cross-training) for the projected spikes.',
          ],
        };
      },
    },
    {
      id: 'predictions.traffic.snapshot-staleness',
      name: 'Traffic Snapshot Staleness',
      description:
        'Ensures traffic forecasts are refreshed against the operational cadence.',
      domain: 'predictions',
      severity: 'medium',
      tags: ['data-quality', 'cadence'],
      evaluate(payload, context) {
        const diffHours =
          (context.evaluationTime.getTime() - payload.generatedAt.getTime()) /
          (1000 * 60 * 60);
        if (diffHours <= 12) {
          return null;
        }
        return {
          id: 'predictions.traffic.snapshot-staleness',
          domain: 'predictions',
          severity: 'medium',
          summary: `Traffic forecast snapshot is ${Math.round(diffHours)} hours old; refresh before publishing staffing guidance.`,
          detail: {
            generatedAt: payload.generatedAt.toISOString(),
            horizon: payload.horizon,
          },
          tags: ['data-quality', 'cadence'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Re-run traffic modeling with the latest booking and walk-in signals to stabilize coverage plans.',
          ],
        };
      },
    },
  ];

  private readonly menuAdjustmentRules: Array<
    RuleDefinition<MenuAdjustmentRulePayload>
  > = [
    {
      id: 'predictions.menu.restock-alert',
      name: 'Menu Restock Alert',
      description:
        'Flags when recommended promotions require supplemental inventory cover.',
      domain: 'predictions',
      severity: 'medium',
      tags: ['menu', 'inventory'],
      evaluate(payload, context) {
        const restockPromote = payload.promote.filter(
          (item) => (item.restock ?? 0) > 0,
        );
        if (restockPromote.length === 0) {
          return null;
        }
        const totalRestock = restockPromote.reduce(
          (sum, item) => sum + (item.restock ?? 0),
          0,
        );
        return {
          id: 'predictions.menu.restock-alert',
          domain: 'predictions',
          severity: 'medium',
          summary: `${restockPromote.length} promoted item(s) require ${totalRestock.toFixed(1)} units of restock to sustain menu pushes.`,
          detail: {
            restockPromote: restockPromote.map((item) => ({
              ingredient: item.ingredient,
              restock: item.restock,
            })),
          },
          tags: ['menu', 'inventory'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Confirm prep and procurement can cover promotion-driven uplift before publishing menu changes.',
          ],
        };
      },
    },
    {
      id: 'predictions.menu.conflicting-signals',
      name: 'Menu Recommendation Conflicts',
      description:
        'Highlights when an ingredient lands in both promote and suppress lists, signalling scoring contention.',
      domain: 'predictions',
      severity: 'medium',
      tags: ['menu', 'governance'],
      evaluate(payload, context) {
        const conflicts = payload.promote
          .map((item) => item.ingredient)
          .filter((ingredient) =>
            payload.suppress.some((entry) => entry.ingredient === ingredient),
          );
        if (conflicts.length === 0) {
          return null;
        }
        return {
          id: 'predictions.menu.conflicting-signals',
          domain: 'predictions',
          severity: 'medium',
          summary: `Menu recommendations conflict for ${conflicts.join(', ')}; reconcile scoring inputs before briefing culinary.`,
          detail: {
            conflicts,
          },
          tags: ['menu', 'governance'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Review margin, risk, and stock overrides to resolve the scoring tie before sharing guidance.',
          ],
        };
      },
    },
    {
      id: 'predictions.menu.narrow-coverage',
      name: 'Menu Coverage Narrow',
      description:
        'Prompts teams to widen analytics coverage when too few items are scored.',
      domain: 'predictions',
      severity: 'low',
      tags: ['analytics', 'menu'],
      evaluate(payload, context) {
        if (payload.scoredItems.length >= 5) {
          return null;
        }
        return {
          id: 'predictions.menu.narrow-coverage',
          domain: 'predictions',
          severity: 'low',
          summary: `Only ${payload.scoredItems.length} item(s) evaluated for menu adjustments; broaden data capture for balanced recommendations.`,
          detail: {
            scoredItems: payload.scoredItems,
          },
          tags: ['analytics', 'menu'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Augment the forecast input set with top-selling dishes to enrich menu balancing decisions.',
          ],
        };
      },
    },
  ];

  private readonly marketingRecommendationRules: Array<
    RuleDefinition<MarketingRecommendationRulePayload>
  > = [
    {
      id: 'marketing.recommendations.goal-revenue',
      name: 'Revenue Goal Alignment',
      description:
        'Surfaces when revenue expansion is the declared focus for the upcoming cycle.',
      domain: 'marketing',
      severity: 'medium',
      tags: ['strategy', 'growth'],
      evaluate(payload, context) {
        if (payload.primaryGoal !== 'revenue') {
          return null;
        }
        return {
          id: 'marketing.recommendations.goal-revenue',
          domain: 'marketing',
          severity: 'medium',
          summary:
            'Revenue growth is the stated priority; bias channel mix toward proven conversion engines.',
          detail: {
            primaryGoal: payload.primaryGoal,
            topPriority: payload.priorities[0]?.title ?? null,
          },
          tags: ['strategy', 'growth'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Lock alignment with finance on ROI thresholds and fast-track reallocations into highest converting channels.',
          ],
        };
      },
    },
    {
      id: 'marketing.recommendations.underperformance',
      name: 'Underperforming Campaign Focus',
      description:
        'Signals when multiple active campaigns trail their expected lift.',
      domain: 'marketing',
      severity: 'medium',
      tags: ['performance', 'optimization'],
      evaluate(payload, context) {
        if (payload.underperformingCount === 0) {
          return null;
        }
        return {
          id: 'marketing.recommendations.underperformance',
          domain: 'marketing',
          severity: 'medium',
          summary: `${payload.underperformingCount} active campaign(s) are under the lift threshold; prioritize recovery sprints.`,
          detail: {
            underperformingCount: payload.underperformingCount,
            plannedPriorities: payload.priorities.map(
              (priority) => priority.title,
            ),
          },
          tags: ['performance', 'optimization'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Stand up a daily check-in with channel owners to re-baseline targeting, creatives, and spend caps.',
          ],
        };
      },
    },
    {
      id: 'marketing.recommendations.pipeline-gap',
      name: 'Campaign Pipeline Gap',
      description:
        'Highlights when no future-ready initiatives are staged in the pipeline.',
      domain: 'marketing',
      severity: 'medium',
      tags: ['pipeline', 'continuity'],
      evaluate(payload, context) {
        if (payload.upcomingCount > 0) {
          return null;
        }
        return {
          id: 'marketing.recommendations.pipeline-gap',
          domain: 'marketing',
          severity: 'medium',
          summary:
            'No upcoming campaigns detected; secure the next launch window to maintain demand coverage.',
          detail: {
            upcomingCount: payload.upcomingCount,
            expiringCount: payload.expiringCount,
          },
          tags: ['pipeline', 'continuity'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Book the next creative sprint and align ops on inventory readiness within the next planning cycle.',
          ],
        };
      },
    },
    {
      id: 'marketing.recommendations.cancellation-surge',
      name: 'Cancellation Surge',
      description:
        'Warns when cancelled spend erodes the active investment envelope.',
      domain: 'marketing',
      severity: 'medium',
      tags: ['governance', 'risk'],
      evaluate(payload, context) {
        if (payload.investableBudget <= 0) {
          return null;
        }
        const cancelledRatio =
          payload.cancelledBudget / payload.investableBudget;
        if (cancelledRatio < 0.35) {
          return null;
        }
        return {
          id: 'marketing.recommendations.cancellation-surge',
          domain: 'marketing',
          severity: 'medium',
          summary: `Cancelled spend has consumed ${(cancelledRatio * 100).toFixed(0)}% of the investable budget; address launch-readiness blockers.`,
          detail: {
            cancelledBudget: payload.cancelledBudget,
            investableBudget: payload.investableBudget,
          },
          tags: ['governance', 'risk'],
          evaluatedAt: context.evaluationTime.toISOString(),
          storeId: context.storeId,
          recommendations: [
            'Institute a pre-launch go/no-go checklist with operations and legal to prevent avoidable cancellations.',
          ],
        };
      },
    },
  ];

  evaluateMarketingOverview(payload: MarketingOverviewRulePayload): RuleHit[] {
    const context = {
      storeId: payload.storeId,
      evaluationTime: payload.evaluationTime,
    };
    return this.marketingOverviewRules
      .map((rule) => rule.evaluate(payload, context))
      .filter((hit): hit is RuleHit => Boolean(hit));
  }

  evaluateCostOverview(payload: CostOverviewRulePayload): RuleHit[] {
    const context = {
      storeId: payload.storeId,
      evaluationTime: payload.evaluationTime,
    };
    return this.costOverviewRules
      .map((rule) => rule.evaluate(payload, context))
      .filter((hit): hit is RuleHit => Boolean(hit));
  }

  evaluateInventoryOverview(payload: InventoryOverviewRulePayload): RuleHit[] {
    const context = {
      storeId: payload.storeId,
      evaluationTime: payload.evaluationTime,
    };
    return this.inventoryOverviewRules
      .map((rule) => rule.evaluate(payload, context))
      .filter((hit): hit is RuleHit => Boolean(hit));
  }

  evaluateDecisionOverview(payload: DecisionOverviewRulePayload): RuleHit[] {
    const context = {
      storeId: payload.storeId,
      evaluationTime: payload.evaluationTime,
    };
    return this.decisionOverviewRules
      .map((rule) => rule.evaluate(payload, context))
      .filter((hit): hit is RuleHit => Boolean(hit));
  }

  evaluateSalesForecast(payload: SalesForecastRulePayload): RuleHit[] {
    const context = {
      storeId: payload.storeId,
      evaluationTime: payload.evaluationTime,
    };
    return this.salesForecastRules
      .map((rule) => rule.evaluate(payload, context))
      .filter((hit): hit is RuleHit => Boolean(hit));
  }

  evaluateTrafficForecast(payload: TrafficForecastRulePayload): RuleHit[] {
    const context = {
      storeId: payload.storeId,
      evaluationTime: payload.evaluationTime,
    };
    return this.trafficForecastRules
      .map((rule) => rule.evaluate(payload, context))
      .filter((hit): hit is RuleHit => Boolean(hit));
  }

  evaluateMenuAdjustments(payload: MenuAdjustmentRulePayload): RuleHit[] {
    const context = {
      storeId: payload.storeId,
      evaluationTime: payload.evaluationTime,
    };
    return this.menuAdjustmentRules
      .map((rule) => rule.evaluate(payload, context))
      .filter((hit): hit is RuleHit => Boolean(hit));
  }

  evaluateMarketingRecommendations(
    payload: MarketingRecommendationRulePayload,
  ): RuleHit[] {
    const context = {
      storeId: payload.storeId,
      evaluationTime: payload.evaluationTime,
    };
    return this.marketingRecommendationRules
      .map((rule) => rule.evaluate(payload, context))
      .filter((hit): hit is RuleHit => Boolean(hit));
  }
}
