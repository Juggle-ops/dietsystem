import { Injectable } from '@nestjs/common';
import { CostSnapshot } from '@prisma/client';
import * as docx from 'docx';
import {
  buildHeaderFooter,
  buildStandardStyles,
  buildBarChartTable,
} from '../reports/report-utils';
import { PrismaService } from '../prisma/prisma.service';
import {
  toNumber,
  toOptionalNumber,
  roundNumber,
} from '../common/metrics/number-utils';
import { RulesRegistryService } from '../rules/rules-registry.service';
import { RuleHit } from '../rules/rule.types';
import { StoreResolverService } from '../prisma/store-resolver.service';
import { CostOverviewQueryDto } from './dto/cost.dto';

type CostSnapshotEntity = CostSnapshot;

type CostBreakdownItem = {
  category: 'cogs' | 'labor' | 'marketing' | 'utilities' | 'other';
  amount: number;
  ratio: number;
};

type CostTrendPoint = {
  date: string;
  totalCost: number;
  revenue: number | null;
  grossMargin: number | null;
  footTraffic: number | null;
};

type CostOverview = {
  store: {
    id: string;
    code: string;
    name: string;
  };
  latest: {
    capturedDate: string;
    totalCost: number;
    revenue: number | null;
    grossMargin: number | null;
    costPerGuest: number | null;
    variance?: Record<string, unknown> | null;
  } | null;
  breakdown: CostBreakdownItem[];
  trend: CostTrendPoint[];
  signals: string[];
  rules: RuleHit[];
};

export interface CostReportPayload {
  summary?: {
    totalSaved?: number;
    avgEfficiency?: number;
    wasteRate?: number;
    forecastAccuracy?: number;
  };
  monthlyCostData?: Array<{ month: string; predicted: number; actual: number; saved: number }>;
  categoryDistribution?: Array<{ name: string; value: number; color?: string }>;
  weeklyTrendData?: Array<{ day: string; cost: number; waste: number; efficiency: number }>;
  supplierPerformance?: Array<{ name: string; cost: number; quality: number; delivery: number }>;
}

@Injectable()
export class CostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeResolver: StoreResolverService,
    private readonly rulesRegistry: RulesRegistryService,
  ) {}

  async getOverview(query: CostOverviewQueryDto): Promise<CostOverview> {
    const store = await this.storeResolver.resolve(query.storeId);
    const windowDays = query.windowDays ?? 30;
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);

    const snapshots: CostSnapshotEntity[] =
      await this.prisma.costSnapshot.findMany({
        where: {
          storeId: store.id,
          capturedDate: { gte: windowStart },
        },
        orderBy: { capturedDate: 'desc' },
      });

    const latest: CostSnapshotEntity | null = snapshots[0] ?? null;
    const breakdown = this.buildBreakdown(latest);
    const trend = this.buildTrend(snapshots);

    const evaluationTime = latest?.capturedDate ?? new Date();
    const revenue = latest ? toOptionalNumber(latest.revenue) : null;
    const grossMargin = latest ? this.computeGrossMargin(latest) : null;
    const totalCost = latest ? this.totalCost(latest) : 0;
    const laborRatio =
      breakdown.find((item) => item.category === 'labor')?.ratio ?? 0;
    const marketingRatio =
      breakdown.find((item) => item.category === 'marketing')?.ratio ?? 0;
    const metadata = latest ? this.ensureRecord(latest.metadata) : null;
    const netProfit =
      typeof metadata?.netProfit === 'number' ? metadata.netProfit : null;
    const expectedFootTraffic =
      typeof metadata?.expectedFootTraffic === 'number'
        ? metadata.expectedFootTraffic
        : null;
    const actualFootTraffic =
      latest && typeof latest.footTraffic === 'number'
        ? latest.footTraffic
        : null;
    const variance = this.ensureRecord(metadata?.variance);
    const cogsVariance =
      typeof variance?.cogs === 'number' ? variance.cogs : null;

    const ruleHits = latest
      ? this.rulesRegistry.evaluateCostOverview({
          storeId: store.id,
          evaluationTime,
          totalCost,
          revenue,
          grossMargin,
          laborRatio,
          marketingRatio,
          netProfit,
          expectedFootTraffic,
          actualFootTraffic,
          cogsVariance,
        })
      : [];
    const signals = ruleHits.map((hit) => hit.summary);

    return {
      store: {
        id: store.id,
        code: store.code,
        name: store.name,
      },
      latest: latest
        ? {
            capturedDate: latest.capturedDate.toISOString(),
            totalCost: roundNumber(totalCost, 2),
            revenue,
            grossMargin,
            costPerGuest: this.computeCostPerGuest(latest),
            variance: this.ensureRecord(
              this.ensureRecord(latest.metadata)?.variance,
            ),
          }
        : null,
      breakdown,
      trend,
      signals,
      rules: ruleHits,
    };
  }

  private buildBreakdown(
    snapshot: CostSnapshotEntity | null,
  ): CostBreakdownItem[] {
    if (!snapshot) return [];
    const total = this.totalCost(snapshot);
    if (total === 0) {
      return [];
    }
    const categories: CostBreakdownItem[] = [
      { category: 'cogs', amount: toNumber(snapshot.cogs), ratio: 0 },
      {
        category: 'labor',
        amount: toNumber(snapshot.laborCost),
        ratio: 0,
      },
      {
        category: 'marketing',
        amount: toNumber(snapshot.marketingSpend),
        ratio: 0,
      },
      {
        category: 'utilities',
        amount: toNumber(snapshot.utilities),
        ratio: 0,
      },
      {
        category: 'other',
        amount: toNumber(snapshot.otherCost),
        ratio: 0,
      },
    ];
    return categories.map((item) => ({
      ...item,
      ratio: roundNumber(item.amount / total, 4),
    }));
  }

  private buildTrend(snapshots: CostSnapshotEntity[]): CostTrendPoint[] {
    const sorted = [...snapshots].sort(
      (a, b) => a.capturedDate.getTime() - b.capturedDate.getTime(),
    );
    return sorted.map((snapshot) => {
      const totalCost = this.totalCost(snapshot);
      const revenue = toOptionalNumber(snapshot.revenue);
      const grossMargin =
        revenue === null
          ? null
          : roundNumber((revenue - totalCost) / revenue, 4);
      return {
        date: snapshot.capturedDate.toISOString(),
        totalCost: roundNumber(totalCost, 2),
        revenue,
        grossMargin,
        footTraffic: snapshot.footTraffic ?? null,
      };
    });
  }

  async generateReport(payload: CostReportPayload): Promise<Buffer> {
    const blocks: Array<docx.Paragraph | docx.Table> = [
      new docx.Paragraph({
        text: '成本分析报告',
        heading: docx.HeadingLevel.TITLE,
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 300 },
      }),
    ];

    const createHeading = (text: string) =>
      new docx.Paragraph({
        text,
        heading: docx.HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 120 },
      });

    const createTable = (headers: string[], rows: (string | number)[][]) =>
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
                  children: [new docx.Paragraph(String(cell))],
                }),
              ),
            }),
          ),
        ],
      });

    const currencyFormatter = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 0,
    });

    const formatCurrency = (value: number | null | undefined) => {
      if (value === null || value === undefined || Number.isNaN(value)) {
        return '—';
      }
      return `¥${currencyFormatter.format(Math.round(value))}`;
    };

    const summary = payload.summary ?? {};
    const summaryLines: string[] = [];
    if (typeof summary.totalSaved === 'number') {
      summaryLines.push(`累计节省成本：${formatCurrency(summary.totalSaved)}`);
    }
    if (typeof summary.avgEfficiency === 'number') {
      summaryLines.push(`平均采购效率：${summary.avgEfficiency.toFixed(1)}%`);
    }
    if (typeof summary.wasteRate === 'number') {
      summaryLines.push(`浪费率：${summary.wasteRate.toFixed(1)}%`);
    }
    if (typeof summary.forecastAccuracy === 'number') {
      summaryLines.push(
        `预测准确率：${summary.forecastAccuracy.toFixed(1)}%`,
      );
    }
    if (summaryLines.length) {
      blocks.push(createHeading('成本分析摘要'));
      summaryLines.forEach((line) =>
        blocks.push(
          new docx.Paragraph({
            text: line,
            bullet: { level: 0 },
          }),
        ),
      );
    }

    if (payload.monthlyCostData?.length) {
      blocks.push(createHeading('月度成本对比'));
      const rows = payload.monthlyCostData.map((item) => [
        item.month,
        formatCurrency(item.actual),
        formatCurrency(item.predicted),
        formatCurrency(item.saved),
      ]);
      blocks.push(createTable(['月份', '实际支出', '智能预测', '节省'], rows));
      blocks.push(createHeading('月度实际成本图'));
      blocks.push(
        buildBarChartTable(
          payload.monthlyCostData.map((item) => ({
            label: item.month,
            value:
              typeof item.actual === 'number' && Number.isFinite(item.actual)
                ? Math.max(0, item.actual)
                : 0,
          })),
          { unit: '¥', decimals: 0 },
        ),
      );
    }

    if (payload.categoryDistribution?.length) {
      blocks.push(createHeading('品类分布'));
      const total = payload.categoryDistribution.reduce(
        (sum, item) => sum + (item.value ?? 0),
        0,
      );
      const rows = payload.categoryDistribution.map((item) => [
        item.name,
        formatCurrency(item.value),
        total > 0
          ? `${((item.value / total) * 100).toFixed(1)}%`
          : '—',
      ]);
      blocks.push(createTable(['品类', '金额', '占比'], rows));
      blocks.push(createHeading('品类成本结构图'));
      blocks.push(
        buildBarChartTable(
          payload.categoryDistribution.map((item) => ({
            label: item.name,
            value:
              typeof item.value === 'number' && Number.isFinite(item.value)
                ? Math.max(0, item.value)
                : 0,
          })),
          { unit: '¥', decimals: 0 },
        ),
      );
    }

    if (payload.weeklyTrendData?.length) {
      blocks.push(createHeading('近7日趋势'));
      const rows = payload.weeklyTrendData.map((item) => [
        item.day,
        formatCurrency(item.cost),
        formatCurrency(item.waste),
        typeof item.efficiency === 'number'
          ? `${item.efficiency.toFixed(1)}%`
          : '—',
      ]);
      blocks.push(createTable(['日期', '总成本', '浪费', '效率'], rows));
      blocks.push(createHeading('近7日成本趋势图'));
      blocks.push(
        buildBarChartTable(
          payload.weeklyTrendData.map((item) => ({
            label: item.day,
            value:
              typeof item.cost === 'number' && Number.isFinite(item.cost)
                ? Math.max(0, item.cost)
                : 0,
          })),
          { unit: '¥', decimals: 0 },
        ),
      );
      blocks.push(createHeading('近7日效率趋势图'));
      blocks.push(
        buildBarChartTable(
          payload.weeklyTrendData.map((item) => ({
            label: item.day,
            value:
              typeof item.efficiency === 'number' && Number.isFinite(item.efficiency)
                ? Math.max(0, Math.min(item.efficiency, 100))
                : 0,
          })),
          { unit: '%', maxValue: 100, decimals: 1 },
        ),
      );
    }

    if (payload.supplierPerformance?.length) {
      blocks.push(createHeading('供应商表现'));
      const rows = payload.supplierPerformance.map((item) => [
        item.name,
        formatCurrency(item.cost),
        typeof item.quality === 'number' ? item.quality.toFixed(0) : '—',
        typeof item.delivery === 'number' ? item.delivery.toFixed(0) : '—',
      ]);
      blocks.push(createTable(['供应商', '采购金额', '质量评分', '交付评分'], rows));
      blocks.push(createHeading('供应商采购对比图'));
      blocks.push(
        buildBarChartTable(
          payload.supplierPerformance.map((item) => ({
            label: item.name,
            value:
              typeof item.cost === 'number' && Number.isFinite(item.cost)
                ? Math.max(0, item.cost)
                : 0,
          })),
          { unit: '¥', decimals: 0 },
        ),
      );
    }
    const { header, footer } = buildHeaderFooter({
      systemName: 'HySmart Dining Cloud 智能餐饮',
      reportName: '成本分析报告',
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

  private totalCost(snapshot: CostSnapshotEntity) {
    return (
      toNumber(snapshot.cogs) +
      toNumber(snapshot.laborCost) +
      toNumber(snapshot.marketingSpend) +
      toNumber(snapshot.utilities) +
      toNumber(snapshot.otherCost)
    );
  }

  private computeGrossMargin(snapshot: CostSnapshotEntity) {
    const revenue = toOptionalNumber(snapshot.revenue);
    if (revenue === null || revenue === 0) {
      return null;
    }
    const totalCost = this.totalCost(snapshot);
    return roundNumber((revenue - totalCost) / revenue, 4);
  }

  private computeCostPerGuest(snapshot: CostSnapshotEntity) {
    if (!snapshot.footTraffic || snapshot.footTraffic <= 0) {
      return null;
    }
    return roundNumber(this.totalCost(snapshot) / snapshot.footTraffic, 2);
  }

  private ensureRecord(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }
}
