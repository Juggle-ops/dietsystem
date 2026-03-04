import { Injectable } from '@nestjs/common';
import { DecisionSnapshot, $Enums } from '@prisma/client';
import * as docx from 'docx';
import {
  buildHeaderFooter,
  buildStandardStyles,
  buildBarChartTable,
} from '../reports/report-utils';
import { PrismaService } from '../prisma/prisma.service';
import { RulesRegistryService } from '../rules/rules-registry.service';
import { RuleHit } from '../rules/rule.types';
import { StoreResolverService } from '../prisma/store-resolver.service';
import { DecisionOverviewQueryDto } from './dto/decisions.dto';

type DecisionSnapshotEntity = DecisionSnapshot;

type DecisionView = {
  id: string;
  decisionType: string;
  status: string;
  createdAt: string;
  appliedAt: string | null;
  appliedBy: string | null;
  primaryRecommendation: string | null;
  contextSummary: string | null;
  notes: string | null;
};

type DecisionOverview = {
  store: {
    id: string;
    code: string;
    name: string;
  };
  summary: {
    pending: number;
    applied: number;
    dismissed: number;
    lastDecisionAt: string | null;
  };
  decisions: DecisionView[];
  signals: string[];
  timeline: { id: string; event: string; timestamp: string }[];
  rules: RuleHit[];
};

export interface DecisionSimulationRequest {
  priceAdjustment: number;
  marketingBudget: number;
  staffCount: number;
  timeHorizon: number;
}

export type SimulationRisk = 'low' | 'medium' | 'high';

export interface DecisionScenario {
  scenario: string;
  revenue: number;
  cost: number;
  profit: number;
  customerCount: number;
  risk: SimulationRisk;
  confidence: number;
  details: Array<{ label: string; value: string }>;
}

export interface DecisionRecommendation {
  bestScenario: string;
  reasoning: string[];
  riskAssessment: string;
}

export interface DecisionSimulationMetrics {
  baselineRevenue: number;
  baselineCost: number;
  baselineProfit: number;
  expectedUplift: number;
  marginImpact: number;
  paybackPeriod: number;
}

export interface DecisionSimulationResult {
  scenarios: DecisionScenario[];
  recommendation: DecisionRecommendation;
  metrics: DecisionSimulationMetrics;
}

export interface DecisionReportPayload {
  inputParams?: DecisionSimulationRequest;
  scenarios: DecisionScenario[];
  recommendation: DecisionRecommendation;
  metrics?: DecisionSimulationMetrics;
}

type SimulationHistoryEntry = {
  id: number;
  timestamp: string;
  input: DecisionSimulationRequest;
  result: DecisionSimulationResult;
};


@Injectable()
export class DecisionsService {
  private readonly simulationHistory: SimulationHistoryEntry[] = [];
  private nextHistoryId = 1;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storeResolver: StoreResolverService,
    private readonly rulesRegistry: RulesRegistryService,
  ) {}

  async getOverview(
    query: DecisionOverviewQueryDto,
  ): Promise<DecisionOverview> {
    const store = await this.storeResolver.resolve(query.storeId);
    const decisionTypeFilter = query.decisionType
      ? (query.decisionType as $Enums.DecisionType)
      : undefined;
    const statusFilter = query.status
      ? (query.status as $Enums.DecisionStatus)
      : undefined;

    const snapshots = await this.prisma.decisionSnapshot.findMany({
      where: {
        storeId: store.id,
        ...(decisionTypeFilter ? { decisionType: decisionTypeFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const summary = this.buildSummary(snapshots);
    const decisions = snapshots.map((snapshot: DecisionSnapshotEntity) =>
      this.toDecisionView(snapshot),
    );
    const evaluationTime = new Date();
    const appliedSnapshots = snapshots.filter((snapshot) => snapshot.appliedAt);
    const lastAppliedAt =
      appliedSnapshots.length > 0
        ? appliedSnapshots
            .map((snapshot) => snapshot.appliedAt as Date)
            .sort((a, b) => b.getTime() - a.getTime())[0]
        : null;
    const ruleHits = this.rulesRegistry.evaluateDecisionOverview({
      storeId: store.id,
      evaluationTime,
      summary,
      lastAppliedAt,
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        status: snapshot.status,
        decisionType: snapshot.decisionType,
        createdAt: snapshot.createdAt,
        appliedAt: snapshot.appliedAt ?? null,
      })),
    });
    const signals = ruleHits.map((hit) => hit.summary);
    const timeline = this.buildTimeline(snapshots);

    return {
      store: {
        id: store.id,
        code: store.code,
        name: store.name,
      },
      summary,
      decisions,
      signals,
      timeline,
      rules: ruleHits,
    };
  }

  simulate(request: DecisionSimulationRequest): DecisionSimulationResult {
    const baselineRevenue = 128_000;
    const baselineCost = 78_000;
    const baselineProfit = baselineRevenue - baselineCost;
    const baselineCustomers = 2400;
    const currencyFormatter = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 0,
    });
    const formatCurrency = (value: number) =>
      `¥${currencyFormatter.format(Math.round(value))}`;

    const priceImpact = request.priceAdjustment / 100;
    const priceRevenue = baselineRevenue * (1 + priceImpact * 0.8);
    const priceCost = baselineCost * (1 - priceImpact * 0.25);
    const priceProfit = priceRevenue - priceCost;
    const priceCustomers = baselineCustomers * (1 - priceImpact * 0.6);
    const priceRisk: SimulationRisk =
      Math.abs(request.priceAdjustment) > 6
        ? 'high'
        : Math.abs(request.priceAdjustment) > 3
          ? 'medium'
          : 'low';
    const priceConfidence = Math.max(
      45,
      Math.min(90, 78 - Math.abs(request.priceAdjustment) * 3),
    );
    const priceScenario: DecisionScenario = {
      scenario: `价格调整 ${request.priceAdjustment >= 0 ? '+' : ''}${request.priceAdjustment}%`,
      revenue: Math.round(priceRevenue),
      cost: Math.round(priceCost),
      profit: Math.round(priceProfit),
      customerCount: Math.max(0, Math.round(priceCustomers)),
      risk: priceRisk,
      confidence: Math.round(priceConfidence),
      details: [
        {
          label: '客单价预估',
          value: formatCurrency(priceRevenue / Math.max(1, priceCustomers)),
        },
        {
          label: '价格弹性估计',
          value: `${(priceImpact * 80).toFixed(1)}%`,
        },
      ],
    };

    const marketingStep = request.marketingBudget / 10_000;
    const marketingRevenue = baselineRevenue * (1 + marketingStep * 0.9);
    const marketingCost = baselineCost + request.marketingBudget;
    const marketingProfit = marketingRevenue - marketingCost;
    const marketingCustomers = baselineCustomers * (1 + marketingStep * 0.8);
    const marketingRisk: SimulationRisk =
      request.marketingBudget > 8000 ? 'medium' : 'low';
    const marketingConfidence = Math.min(88, 65 + marketingStep * 12);
    const incrementalCustomers = marketingCustomers - baselineCustomers;
    const marketingScenario: DecisionScenario = {
      scenario: `营销预算 +${formatCurrency(request.marketingBudget)}`,
      revenue: Math.round(marketingRevenue),
      cost: Math.round(marketingCost),
      profit: Math.round(marketingProfit),
      customerCount: Math.round(marketingCustomers),
      risk: marketingRisk,
      confidence: Math.round(marketingConfidence),
      details: [
        {
          label: '新增投入',
          value: formatCurrency(request.marketingBudget),
        },
        {
          label: '获客成本',
          value:
            incrementalCustomers > 0
              ? formatCurrency(
                  request.marketingBudget / Math.max(incrementalCustomers, 1),
                )
              : '暂无',
        },
      ],
    };

    const staffBaseline = 8;
    const staffDelta = request.staffCount - staffBaseline;
    const staffingRevenue =
      baselineRevenue * (1 + Math.min(0.08, staffDelta * 0.05));
    const staffingCost = baselineCost * (1 + staffDelta * 0.06);
    const staffingProfit = staffingRevenue - staffingCost;
    const staffingCustomers =
      baselineCustomers * (1 + Math.min(0.1, staffDelta * 0.04));
    const staffingRisk: SimulationRisk =
      staffDelta <= -2 ? 'high' : staffDelta >= 2 ? 'medium' : 'low';
    const staffingConfidence = Math.max(
      40,
      Math.min(85, 72 - Math.abs(staffDelta) * 4),
    );
    const staffingScenario: DecisionScenario = {
      scenario: `人员配置 ${request.staffCount} 人`,
      revenue: Math.round(staffingRevenue),
      cost: Math.round(staffingCost),
      profit: Math.round(staffingProfit),
      customerCount: Math.round(staffingCustomers),
      risk: staffingRisk,
      confidence: Math.round(staffingConfidence),
      details: [
        {
          label: '人力变动',
          value: `${staffDelta >= 0 ? '+' : ''}${staffDelta} 人`,
        },
        {
          label: '服务承载力',
          value: `${Math.round((staffingCustomers / baselineCustomers) * 100)}%`,
        },
      ],
    };

    const scenarios = [priceScenario, marketingScenario, staffingScenario];
    const sorted = [...scenarios].sort((a, b) => b.profit - a.profit);
    const bestCandidate =
      sorted.find((scenario) => scenario.risk !== 'high') ?? sorted[0];

    const expectedUplift = bestCandidate.profit - baselineProfit;
    const marginImpact =
      bestCandidate.revenue > 0
        ? Number(
            (
              bestCandidate.profit / bestCandidate.revenue -
              baselineProfit / baselineRevenue
            ).toFixed(3),
          )
        : 0;
    const paybackPeriod =
      expectedUplift > 0
        ? Math.min(
            180,
            Math.max(
              14,
              Math.round(
                request.timeHorizon *
                  (baselineProfit / Math.max(expectedUplift, 1)),
              ),
            ),
          )
        : request.timeHorizon;

    const metrics: DecisionSimulationMetrics = {
      baselineRevenue,
      baselineCost,
      baselineProfit,
      expectedUplift: Math.round(expectedUplift),
      marginImpact,
      paybackPeriod,
    };

    const recommendation: DecisionRecommendation = {
      bestScenario: bestCandidate.scenario,
      reasoning: [
        `预计利润 ${formatCurrency(bestCandidate.profit)}，高于基线 ${formatCurrency(metrics.baselineProfit)}。`,
        `预计客流 ${bestCandidate.customerCount} 人，模型信心 ${bestCandidate.confidence}%。`,
      ],
      riskAssessment:
        bestCandidate.risk === 'low'
          ? '风险较低，可快速落地并持续跟踪关键指标。'
          : bestCandidate.risk === 'medium'
            ? '存在一定不确定性，建议设置预警阈值并准备备用方案。'
            : '风险偏高，建议先进行小范围试点或结合其他方案谨慎推进。',
    };

    const result: DecisionSimulationResult = {
      scenarios,
      recommendation,
      metrics,
    };
    this.simulationHistory.unshift({
      id: this.nextHistoryId++,
      timestamp: new Date().toISOString(),
      input: request,
      result,
    });
    if (this.simulationHistory.length > 50) {
      this.simulationHistory.splice(50);
    }
    return result;
  }
  getSimulationHistory(limit = 20) {
    return this.simulationHistory.slice(0, limit);
  }

  getHistoryItem(id: number) {
    return this.simulationHistory.find((entry) => entry.id === id) ?? null;
  }

  async generateReport(payload: DecisionReportPayload): Promise<Buffer> {
    const blocks: Array<docx.Paragraph | docx.Table> = [];

    blocks.push(
      new docx.Paragraph({
        text: '决策模拟报告',
        heading: docx.HeadingLevel.TITLE,
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 300 },
      }),
    );

    type HeadingLevelValue = (typeof docx.HeadingLevel)[keyof typeof docx.HeadingLevel];

    const createHeading = (
      text: string,
      level: HeadingLevelValue = docx.HeadingLevel.HEADING_1,
    ) =>
      new docx.Paragraph({
        text,
        heading: level,
        spacing: { before: 200, after: 120 },
      });

    const createTable = (headers: string[], rows: string[][]) =>
      new docx.Table({
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        rows: [
          new docx.TableRow({
            tableHeader: true,
            children: headers.map((header) =>
              new docx.TableCell({
                children: [
                  new docx.Paragraph({
                    children: [new docx.TextRun({ text: header, bold: true })],
                  }),
                ],
              }),
            ),
          }),
          ...rows.map((row) =>
            new docx.TableRow({
              children: row.map((cell) =>
                new docx.TableCell({
                  children: [new docx.Paragraph({ text: cell })],
                }),
              ),
            }),
          ),
        ],
      });

    const currencyFormatter = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 0,
    });
    const formatCurrency = (value?: number | null) => {
      if (value === null || value === undefined || Number.isNaN(value)) {
        return '暂无';
      }
      return `¥${currencyFormatter.format(Math.round(value))}`;
    };
    const formatPercent = (value?: number | null, decimals = 1) => {
      if (value === null || value === undefined || Number.isNaN(value)) {
        return '暂无';
      }
      return `${value.toFixed(decimals)}%`;
    };
    const formatCount = (value?: number | null, unit = '人') => {
      if (value === null || value === undefined || Number.isNaN(value)) {
        return '暂无';
      }
      return `${Math.max(0, Math.round(value))} ${unit}`;
    };

    if (payload.inputParams) {
      const { priceAdjustment, marketingBudget, staffCount, timeHorizon } =
        payload.inputParams;
      blocks.push(createHeading('输入参数'));
      blocks.push(
        new docx.Paragraph({
          text: `价格调整：${priceAdjustment >= 0 ? '+' : ''}${priceAdjustment}%`,
          bullet: { level: 0 },
        }),
      );
      blocks.push(
        new docx.Paragraph({
          text: `营销预算：${formatCurrency(marketingBudget)}`,
          bullet: { level: 0 },
        }),
      );
      blocks.push(
        new docx.Paragraph({
          text: `人员配置：${formatCount(staffCount)}`,
          bullet: { level: 0 },
        }),
      );
      blocks.push(
        new docx.Paragraph({
          text: `模拟周期：${
            timeHorizon !== undefined && timeHorizon !== null
              ? `${timeHorizon} 天`
              : '暂无'
          }`,
          bullet: { level: 0 },
        }),
      );
    }

    if (payload.scenarios?.length) {
      const riskLabels: Record<SimulationRisk, string> = {
        low: '低',
        medium: '中',
        high: '高',
      };

      blocks.push(createHeading('方案对比'));
      const rows = payload.scenarios.map((scenario) => [
        scenario.scenario,
        formatCurrency(scenario.revenue),
        formatCurrency(scenario.cost),
        formatCurrency(scenario.profit),
        formatCount(scenario.customerCount),
        riskLabels[scenario.risk] ?? scenario.risk,
        formatPercent(scenario.confidence, 0),
      ]);
      blocks.push(
        createTable(
          ['方案', '收入', '成本', '利润', '客流', '风险', '模型信心'],
          rows,
        ),
      );

      const profitSeries = payload.scenarios.map((scenario) => ({
        label: scenario.scenario,
        value:
          typeof scenario.profit === 'number' && Number.isFinite(scenario.profit)
            ? scenario.profit
            : 0,
      }));
      if (profitSeries.some((item) => item.value !== 0)) {
        blocks.push(createHeading('方案利润对比图', docx.HeadingLevel.HEADING_2));
        blocks.push(
          buildBarChartTable(profitSeries, { unit: '¥', decimals: 0 }),
        );
      }

      const customerSeries = payload.scenarios.map((scenario) => ({
        label: scenario.scenario,
        value:
          typeof scenario.customerCount === 'number' &&
          Number.isFinite(scenario.customerCount)
            ? Math.max(0, scenario.customerCount)
            : 0,
      }));
      if (customerSeries.some((item) => item.value > 0)) {
        blocks.push(createHeading('客流预测对比图', docx.HeadingLevel.HEADING_2));
        blocks.push(
          buildBarChartTable(customerSeries, { unit: '人', decimals: 0 }),
        );
      }

      payload.scenarios.forEach((scenario) => {
        if (!scenario.details?.length) {
          return;
        }
        blocks.push(
          createHeading(`${scenario.scenario} 关键假设`, docx.HeadingLevel.HEADING_2),
        );
        scenario.details.forEach((detail) =>
          blocks.push(
            new docx.Paragraph({
              text: `${detail.label}：${detail.value}`,
              bullet: { level: 1 },
            }),
          ),
        );
      });
    } else {
      blocks.push(
        new docx.Paragraph({
          text: '暂无可对比的决策方案。',
          style: 'SmallNote',
        }),
      );
    }

    if (payload.recommendation) {
      blocks.push(createHeading('推荐方案'));
      blocks.push(
        new docx.Paragraph({
          text: `推荐选择：${payload.recommendation.bestScenario}`,
        }),
      );
      (payload.recommendation.reasoning ?? []).forEach((reason) =>
        blocks.push(
          new docx.Paragraph({
            text: reason,
            bullet: { level: 0 },
          }),
        ),
      );
      blocks.push(
        new docx.Paragraph({
          text: payload.recommendation.riskAssessment,
          spacing: { before: 120 },
        }),
      );
    }

    if (payload.metrics) {
      const metrics = payload.metrics;
      blocks.push(createHeading('关键指标'));
      const metricParagraphs = [
        `基准收入：${formatCurrency(metrics.baselineRevenue)}`,
        `基准成本：${formatCurrency(metrics.baselineCost)}`,
        `基准利润：${formatCurrency(metrics.baselineProfit)}`,
        `预计利润增量：${formatCurrency(metrics.expectedUplift)}`,
        `毛利率影响：${formatPercent(
          typeof metrics.marginImpact === 'number'
            ? metrics.marginImpact * 100
            : null,
          1,
        )}`,
        `预计回收周期：${
          metrics.paybackPeriod !== null && metrics.paybackPeriod !== undefined
            ? `${metrics.paybackPeriod} 天`
            : '暂无'
        }`,
      ];
      metricParagraphs.forEach((line) =>
        blocks.push(
          new docx.Paragraph({
            text: line,
            bullet: { level: 0 },
          }),
        ),
      );

      blocks.push(createHeading('收入与成本对比图', docx.HeadingLevel.HEADING_2));
      blocks.push(
        buildBarChartTable(
          [
            { label: '基准收入', value: metrics.baselineRevenue ?? 0 },
            { label: '基准成本', value: metrics.baselineCost ?? 0 },
            { label: '利润增量', value: metrics.expectedUplift ?? 0 },
          ],
          { unit: '¥', decimals: 0 },
        ),
      );

      blocks.push(createHeading('毛利率变化图', docx.HeadingLevel.HEADING_2));
      blocks.push(
        buildBarChartTable(
          [
            {
              label: '毛利率变化',
              value:
                typeof metrics.marginImpact === 'number'
                  ? metrics.marginImpact * 100
                  : 0,
            },
          ],
          { unit: '%', maxValue: 100, decimals: 1 },
        ),
      );

      blocks.push(createHeading('回收周期图', docx.HeadingLevel.HEADING_2));
      blocks.push(
        buildBarChartTable(
          [
            {
              label: '回收周期',
              value: metrics.paybackPeriod ?? 0,
            },
          ],
          { unit: '天', decimals: 0 },
        ),
      );
    }

    const { header, footer } = buildHeaderFooter({
      systemName: 'HySmart Dining Cloud 智能餐饮',
      reportName: '决策模拟报告',
    });

    const doc = new docx.Document({
      styles: buildStandardStyles(),
      sections: [
        {
          properties: {},
          headers: { default: header },
          footers: { default: footer },
          children: blocks,
        },
      ],
    });

    return docx.Packer.toBuffer(doc);
  }
  private buildSummary(snapshots: DecisionSnapshotEntity[]) {
    let pending = 0;
    let applied = 0;
    let dismissed = 0;
    let lastDecisionAt: string | null = null;

    for (const snapshot of snapshots) {
      if (snapshot.status === 'PENDING') pending += 1;
      if (snapshot.status === 'APPLIED') applied += 1;
      if (snapshot.status === 'DISMISSED') dismissed += 1;
      if (
        !lastDecisionAt ||
        snapshot.createdAt.toISOString() > lastDecisionAt
      ) {
        lastDecisionAt = snapshot.createdAt.toISOString();
      }
    }

    return { pending, applied, dismissed, lastDecisionAt };
  }

  private toDecisionView(snapshot: DecisionSnapshotEntity): DecisionView {
    const recommendation = this.pickRecommendationHeadline(
      snapshot.recommendation,
    );
    const context = this.pickContextSummary(snapshot.context);

    return {
      id: snapshot.id,
      decisionType: snapshot.decisionType,
      status: snapshot.status,
      createdAt: snapshot.createdAt.toISOString(),
      appliedAt: snapshot.appliedAt ? snapshot.appliedAt.toISOString() : null,
      appliedBy: snapshot.appliedBy ?? null,
      primaryRecommendation: recommendation,
      contextSummary: context,
      notes: snapshot.notes ?? null,
    };
  }

  private pickRecommendationHeadline(recommendation: unknown) {
    if (!recommendation || typeof recommendation !== 'object') {
      return null;
    }
    const record = recommendation as Record<string, unknown>;
    const promoteEntries: ReadonlyArray<Record<string, unknown>> =
      Array.isArray(record['promote'])
        ? (record['promote'] as Array<Record<string, unknown>>)
        : [];
    if (promoteEntries.length > 0) {
      const firstCandidate = promoteEntries[0];
      const actionValue = firstCandidate?.['action'];
      if (typeof actionValue === 'string') {
        return actionValue;
      }
      if (actionValue !== undefined) {
        try {
          return JSON.stringify(actionValue);
        } catch {
          return '[non-string recommendation]';
        }
      }
    }
    if (typeof record['summary'] === 'string') {
      return record['summary'];
    }
    return null;
  }

  private pickContextSummary(context: unknown) {
    if (!context || typeof context !== 'object') {
      return null;
    }
    const record = context as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof record['timeWindow'] === 'string') {
      parts.push(`Window: ${record['timeWindow']}`);
    }
    if (typeof record['target'] === 'string') {
      parts.push(`Focus: ${record['target']}`);
    }
    if (Array.isArray(record['constraints']) && record['constraints'].length) {
      parts.push(
        `Constraints: ${(record['constraints'] as unknown[]).slice(0, 2).join(', ')}`,
      );
    }
    return parts.length ? parts.join(' | ') : null;
  }

  private buildTimeline(snapshots: DecisionSnapshotEntity[]) {
    const timeline: { id: string; event: string; timestamp: string }[] = [];
    for (const snapshot of snapshots) {
      timeline.push({
        id: snapshot.id,
        event: 'captured',
        timestamp: snapshot.createdAt.toISOString(),
      });
      if (snapshot.appliedAt) {
        timeline.push({
          id: snapshot.id,
          event: 'applied',
          timestamp: snapshot.appliedAt.toISOString(),
        });
      }
      if (snapshot.status === 'DISMISSED') {
        timeline.push({
          id: snapshot.id,
          event: 'dismissed',
          timestamp: snapshot.createdAt.toISOString(),
        });
      }
    }
    return timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}
