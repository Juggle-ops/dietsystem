import { Injectable } from '@nestjs/common';
import * as docx from 'docx';
import { MarketingCampaign, $Enums } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  toNumber,
  toOptionalNumber,
  roundNumber,
} from '../common/metrics/number-utils';
import { hasPassed, isUpcoming } from '../common/time/time-utils';
import { RulesRegistryService } from '../rules/rules-registry.service';
import { RuleHit } from '../rules/rule.types';
import { StoreResolverService } from '../prisma/store-resolver.service';
import {
  MarketingOverviewQueryDto,
  MarketingRecommendationRequestDto,
  MarketingCampaignOverrideDto,
} from './dto/marketing.dto';
import {
  buildCover,
  buildHeaderFooter,
  buildStandardStyles,
  bodyCell,
  shadedHeaderCell,
  buildBarChartTable,
} from '../reports/report-utils';

type MarketingCampaignEntity = MarketingCampaign;

type CampaignView = {
  id: string;
  name: string;
  objective: string | null;
  channel: string;
  status: $Enums.CampaignStatus;
  startDate: string;
  endDate: string | null;
  budget: number;
  expectedLift: number | null;
  actualLift: number | null;
  tags: string[];
};

type MarketingOverview = {
  store: {
    id: string;
    code: string;
    name: string;
  };
  summary: {
    activeCount: number;
    totalBudget: number;
    averageExpectedLift: number | null;
    averageActualLift: number | null;
    channelMix: { channel: string; share: number }[];
  };
  campaigns: {
    active: CampaignView[];
    upcoming: CampaignView[];
    completed: CampaignView[];
  };
  highlights: string[];
  rules: RuleHit[];
};

type MarketingRecommendation = {
  title: string;
  rationale: string;
  impactScore: number;
  actions: string[];
  category: 'optimize' | 'scale' | 'protect';
};

type MarketingRecommendationResponse = {
  storeId: string;
  generatedAt: string;
  priorities: MarketingRecommendation[];
  notes: string[];
  signals: string[];
  rules: RuleHit[];
};

export interface MarketingReportPayload {
  storeId?: string;
  generatedAt?: string;
  period?: string;
  periodLabel?: string;
  priorities?: Array<{
    title: string;
    rationale?: string;
    impactScore?: number;
    actions?: string[];
    category?: string;
  }>;
  notes?: string[];
  signals?: string[];
  campaigns?: Array<{
    name?: string;
    status?: string;
    type?: string;
    startDate?: string;
    endDate?: string | null;
    target?: string;
    reach?: number;
    engagement?: number;
    conversion?: number;
    revenue?: number;
  }>;
  sentiment?: Array<{
    date: string;
    positive?: number;
    neutral?: number;
    negative?: number;
  }>;
  customerSegments?: Array<{ name?: string; value?: number; color?: string }>;
  summaryMetrics?: {
    projectedRevenue?: number;
    averageEngagement?: number;
    activeCampaigns?: number;
    plannedCampaigns?: number;
  };
}

const CAMPAIGN_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const satisfies Record<$Enums.CampaignStatus, $Enums.CampaignStatus>;

@Injectable()
export class MarketingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeResolver: StoreResolverService,
    private readonly rulesRegistry: RulesRegistryService,
  ) {}

  async getOverview(
    query: MarketingOverviewQueryDto,
  ): Promise<MarketingOverview> {
    const store = await this.storeResolver.resolve(query.storeId);
    const campaigns: MarketingCampaignEntity[] =
      await this.prisma.marketingCampaign.findMany({
        where: {
          storeId: store.id,
          status: query.status,
        },
        orderBy: [{ startDate: 'desc' }],
      });

    const activeNow: CampaignView[] = [];
    const upcoming: CampaignView[] = [];
    const completed: CampaignView[] = [];
    const now = new Date();
    const channelLedger = new Map<
      string,
      { total: number; active: number; cancelled: number }
    >();
    let investableBudget = 0;
    let totalActiveBudget = 0;
    let cancelledBudget = 0;
    const expectedLiftValues: number[] = [];
    const actualLiftValues: number[] = [];
    let expectedSum = 0;
    let actualSum = 0;

    for (const campaign of campaigns) {
      const view = this.toCampaignView(campaign);
      const bucket = this.classifyCampaign(campaign, now);
      const budgetAmount = toNumber(campaign.budget);

      if (bucket === 'active') {
        activeNow.push(view);
        totalActiveBudget += budgetAmount;
      } else if (bucket === 'completed') {
        completed.push(view);
      } else {
        upcoming.push(view);
      }

      if (campaign.status === CAMPAIGN_STATUS.CANCELLED) {
        cancelledBudget += budgetAmount;
      } else {
        investableBudget += budgetAmount;
      }

      const expectedLift = toOptionalNumber(campaign.expectedLift);
      if (expectedLift !== null) {
        expectedLiftValues.push(expectedLift);
        expectedSum += expectedLift;
      }
      const actualLift = toOptionalNumber(campaign.actualLift);
      if (actualLift !== null) {
        actualLiftValues.push(actualLift);
        actualSum += actualLift;
      }

      const ledger = channelLedger.get(campaign.channel) ?? {
        total: 0,
        active: 0,
        cancelled: 0,
      };
      ledger.total += budgetAmount;
      if (bucket === 'active') {
        ledger.active += budgetAmount;
      }
      if (campaign.status === CAMPAIGN_STATUS.CANCELLED) {
        ledger.cancelled += budgetAmount;
      }
      channelLedger.set(campaign.channel, ledger);
    }

    const baselineBudget =
      totalActiveBudget > 0 ? totalActiveBudget : investableBudget;
    const channelMix = Array.from(channelLedger.entries())
      .map(([channel, stats]) => {
        const numerator = totalActiveBudget > 0 ? stats.active : stats.total;
        const share = baselineBudget
          ? roundNumber((numerator / baselineBudget) * 100, 1)
          : 0;
        return { channel, share };
      })
      .sort((a, b) => b.share - a.share);

    const averageExpected =
      expectedLiftValues.length === 0
        ? null
        : expectedSum / expectedLiftValues.length;
    const averageActual =
      actualLiftValues.length === 0
        ? null
        : actualSum / actualLiftValues.length;

    const ruleHits = this.rulesRegistry.evaluateMarketingOverview({
      storeId: store.id,
      evaluationTime: now,
      activeCount: activeNow.length,
      upcomingCount: upcoming.length,
      completedCount: completed.length,
      channelMix,
      investableBudget,
      cancelledBudget,
      averageExpectedLift: averageExpected,
      averageActualLift: averageActual,
    });

    const highlights = ruleHits.map((hit) => hit.summary);

    return {
      store: {
        id: store.id,
        code: store.code,
        name: store.name,
      },
      summary: {
        activeCount: activeNow.length,
        totalBudget: roundNumber(baselineBudget, 2),
        averageExpectedLift:
          averageExpected === null ? null : roundNumber(averageExpected, 2),
        averageActualLift:
          averageActual === null ? null : roundNumber(averageActual, 2),
        channelMix,
      },
      campaigns: {
        active: activeNow,
        upcoming,
        completed,
      },
      highlights,
      rules: ruleHits,
    };
  }

  async generateRecommendations(
    request: MarketingRecommendationRequestDto,
  ): Promise<MarketingRecommendationResponse> {
    const store = await this.storeResolver.resolve(request.storeId);
    const campaigns: MarketingCampaignEntity[] =
      await this.prisma.marketingCampaign.findMany({
        where: { storeId: store.id },
        orderBy: [{ updatedAt: 'desc' }],
      });

    const overridesById = new Map(
      (request.overrides ?? []).map((override) => [override.id, override]),
    );

    const priorities: MarketingRecommendation[] = [];
    const notes: string[] = [];
    const now = new Date();

    const {
      ledger: channelLedger,
      investableBudget,
      activeBudget,
      cancelledBudget,
    } = this.summarizeChannelSpend(campaigns, now, overridesById);

    const baselineBudget = activeBudget > 0 ? activeBudget : investableBudget;
    const channelMix =
      baselineBudget > 0
        ? Array.from(channelLedger.entries())
            .map(([channel, stats]) => {
              const numerator = activeBudget > 0 ? stats.active : stats.total;
              const share = baselineBudget
                ? roundNumber((numerator / baselineBudget) * 100, 1)
                : 0;
              return { channel, share };
            })
            .sort((a, b) => b.share - a.share)
        : [];

    const underperforming = campaigns.filter((campaign) => {
      const override = overridesById.get(campaign.id);
      const actual =
        override?.actualLift ?? toOptionalNumber(campaign.actualLift);
      const expected = toOptionalNumber(campaign.expectedLift);
      if (actual === null || expected === null) {
        return false;
      }
      const statusOverride = override?.status as
        | $Enums.CampaignStatus
        | undefined;
      const bucket = this.classifyCampaign(campaign, now, statusOverride);
      return bucket === 'active' && actual < expected * 0.75;
    });

    if (underperforming.length > 0) {
      const denominator = Math.max(1, campaigns.length);
      priorities.push({
        title: 'Optimize Low Performing Campaigns',
        rationale: `Detected ${underperforming.length} campaign(s) performing below 75% of expected lift.`,
        impactScore: roundNumber(
          Math.min(1, underperforming.length / denominator) * 0.8 + 0.2,
          2,
        ),
        actions: [
          'Revisit targeting on weaker cohorts and tighten geographic scope.',
          'Refresh creatives or adjust offer positioning to align with current promotions.',
          'Schedule interim checkpoints with regional marketing owners to validate adoption.',
        ],
        category: 'optimize',
      });
    }

    const upcoming = campaigns.filter((campaign) => {
      const override = overridesById.get(campaign.id);
      const statusOverride = override?.status as
        | $Enums.CampaignStatus
        | undefined;
      const bucket = this.classifyCampaign(campaign, now, statusOverride);
      const status = statusOverride ?? campaign.status;
      return status !== CAMPAIGN_STATUS.CANCELLED && bucket === 'upcoming';
    });
    if (upcoming.length === 0) {
      priorities.push({
        title: 'Schedule Next Wave Campaign',
        rationale:
          'No upcoming initiatives detected. Maintaining a rolling 4-week plan helps sustain awareness and traffic.',
        impactScore: 0.65,
        actions: [
          'Align next campaign brief with inventory availability and seasonal menu.',
          'Dedicate at least 15% of the quarterly budget to experimentation.',
        ],
        category: 'scale',
      });
    }

    const expiring = campaigns.filter((campaign) => {
      if (!campaign.endDate) return false;
      const override = overridesById.get(campaign.id);
      const status =
        (override?.status as $Enums.CampaignStatus | undefined) ??
        campaign.status;
      if (status !== CAMPAIGN_STATUS.ACTIVE) {
        return false;
      }
      const diff = campaign.endDate.getTime() - now.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 3;
    });
    if (expiring.length > 0) {
      priorities.push({
        title: 'Prepare Sunset Playbook',
        rationale: `${expiring.length} campaign(s) will expire within three days. Capture post-campaign insights and hand off to retention.`,
        impactScore: 0.55,
        actions: [
          'Trigger exit surveys or coupon codes to extend engagement.',
          'Archive performance snapshots and share with analytics for regression fits.',
        ],
        category: 'protect',
      });
    }

    if (channelMix.length && channelMix[0].share >= 70) {
      const lead = channelMix[0];
      priorities.push({
        title: 'Balance Channel Portfolio',
        rationale: `${lead.channel} currently represents ${lead.share}% of active spend; concentration heightens performance risk if demand softens.`,
        impactScore: 0.62,
        actions: [
          'Redirect 5-10% of the active budget into the next-best channel to validate acquisition efficiency.',
          'Set weekly performance guardrails with paid media partners before scaling the dominant channel further.',
        ],
        category: 'protect',
      });
    }

    if (investableBudget > 0 && cancelledBudget > investableBudget * 0.35) {
      priorities.push({
        title: 'Stabilize Campaign Pipeline',
        rationale:
          'Cancelled spend has exceeded 35% of the investable budget this cycle; address launch-readiness gaps before funding new pushes.',
        impactScore: 0.58,
        actions: [
          'Hold a weekly go/no-go review with finance and operations to verify inventory and staffing readiness.',
          'Refresh the pre-launch QA checklist so creative, pricing, and channel tracking are signed off together.',
        ],
        category: 'protect',
      });
    }

    const preferences = request.preferences;
    if (preferences?.primaryGoal === 'revenue') {
      priorities.unshift({
        title: 'Reallocate Budget to High ROI Channels',
        rationale:
          'Revenue focus selected; rebalancing spend toward channels with proven conversion is recommended.',
        impactScore: 0.78,
        actions: [
          'Shift 10-15% budget from awareness-only channels to top converting digital placements.',
          'Bundle high-margin items into next push to amplify basket size.',
        ],
        category: 'scale',
      });
    } else if (preferences?.primaryGoal === 'retention') {
      priorities.unshift({
        title: 'Launch Loyalty Reactivation Sequence',
        rationale:
          'Retention priority detected; leverage CRM to reduce churn on mid-tier members.',
        impactScore: 0.74,
        actions: [
          'Deploy segmented messaging to members with 30-45 day inactivity.',
          'Offer experiential perks (chef table preview) instead of pure discounts to protect margins.',
        ],
        category: 'protect',
      });
    }

    if (preferences?.budgetDelta) {
      notes.push(
        `Budget delta input: ${roundNumber(preferences.budgetDelta, 0)}. Ensure finance sign-off before reallocating.`,
      );
    }
    if (preferences?.desiredLift) {
      notes.push(
        `Desired incremental lift: ${roundNumber(preferences.desiredLift * 100, 1)}%. Model scenarios with analytics before committing.`,
      );
    }

    if (channelMix.length) {
      const lead = channelMix[0];
      notes.push(
        `Channel mix lead: ${lead.channel} at ${lead.share}% of active budget.`,
      );
    }
    if (cancelledBudget > 0) {
      notes.push(
        `Cancelled budget total: ${roundNumber(cancelledBudget, 2)} against ${roundNumber(investableBudget, 2)} in active plans.`,
      );
    }

    if (priorities.length === 0) {
      priorities.push({
        title: 'Maintain Baseline Marketing Rhythm',
        rationale:
          'No immediate risks detected. Continue monitoring campaign telemetry and weekly ROI cadence.',
        impactScore: 0.45,
        actions: [
          'Share latest funnel metrics with operations and finance stakeholders.',
        ],
        category: 'protect',
      });
    }

    const responseTimestamp = new Date();
    const ruleHits = this.rulesRegistry.evaluateMarketingRecommendations({
      storeId: store.id,
      evaluationTime: responseTimestamp,
      primaryGoal: preferences?.primaryGoal ?? null,
      priorities: priorities.map((priority) => ({
        title: priority.title,
        category: priority.category,
      })),
      channelMix,
      investableBudget,
      cancelledBudget,
      underperformingCount: underperforming.length,
      upcomingCount: upcoming.length,
      expiringCount: expiring.length,
      overridesApplied: overridesById.size,
    });
    const signals = ruleHits.map((hit) => hit.summary);

    return {
      storeId: store.id,
      generatedAt: responseTimestamp.toISOString(),
      priorities,
      notes,
      signals,
      rules: ruleHits,
    };
  }

  async generateReport(payload: MarketingReportPayload): Promise<Buffer> {
    const evaluationTime = payload.generatedAt
      ? new Date(payload.generatedAt)
      : new Date();
    const { header, footer } = buildHeaderFooter({
      systemName: 'HySmart Dining Cloud 智能餐饮',
      reportName: '营销洞察报告',
    });

    const currencyFormatter = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    const percentFormatter = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

    const toCurrency = (value?: number | null) =>
      typeof value === 'number' && Number.isFinite(value)
        ? `¥${currencyFormatter.format(Math.round(value))}`
        : '暂无';
    const toPercent = (value?: number | null) =>
      typeof value === 'number' && Number.isFinite(value)
        ? `${percentFormatter.format(value)}%`
        : '暂无';
    const toDateLabel = (input?: string | null) => {
      if (!input) {
        return '暂无';
      }
      const date = new Date(input);
      if (Number.isNaN(date.getTime())) {
        return input;
      }
      return date.toLocaleDateString('zh-CN');
    };
    const formatWindow = (start?: string | null, end?: string | null) => {
      const startLabel = toDateLabel(start);
      const endLabel = toDateLabel(end);
      if (startLabel === '暂无' && endLabel === '暂无') {
        return '暂无';
      }
      if (endLabel === '暂无') {
        return startLabel;
      }
      if (startLabel === '暂无') {
        return endLabel;
      }
      return `${startLabel} - ${endLabel}`;
    };
    const resolveStatus = (status?: string | null) => {
      switch ((status ?? '').toUpperCase()) {
        case 'ACTIVE':
          return '进行中';
        case 'PLANNED':
        case 'UPCOMING':
          return '待上线';
        case 'COMPLETED':
          return '已结束';
        case 'CANCELLED':
          return '已取消';
        default:
          return status ?? '暂无';
      }
    };

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
    const buildBullet = (text: string, level = 0) =>
      new docx.Paragraph({
        text,
        bullet: { level },
        spacing: { before: 40, after: 40 },
      });
    const buildTable = (headers: string[], rows: string[][]) =>
      new docx.Table({
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        rows: [
          new docx.TableRow({
            tableHeader: true,
            children: headers.map((headerText) => shadedHeaderCell(headerText)),
          }),
          ...rows.map(
            (cells) =>
              new docx.TableRow({
                children: cells.map((cell) => bodyCell(cell)),
              }),
          ),
        ],
      });

    const subtitleParts: string[] = [];
    if (payload.periodLabel) {
      subtitleParts.push(payload.periodLabel);
    }
    subtitleParts.push(
      evaluationTime.toLocaleString('zh-CN', { hour12: false }),
    );

    const coverHighlights =
      payload.notes && payload.notes.length
        ? payload.notes.slice(0, 3)
        : payload.signals?.slice(0, 3) ?? [];

    const sections: Array<docx.Paragraph | docx.Table> = [
      ...buildCover(
        '智能营销洞察报告',
        subtitleParts.join(' · '),
        coverHighlights,
      ),
    ];

    const summaryMetrics = payload.summaryMetrics ?? {};
    const summaryLines: string[] = [];
    if (typeof summaryMetrics.projectedRevenue === 'number') {
      summaryLines.push(
        `预计营销贡献收入：${toCurrency(summaryMetrics.projectedRevenue)}`,
      );
    }
    if (typeof summaryMetrics.averageEngagement === 'number') {
      summaryLines.push(
        `平均互动率：${toPercent(summaryMetrics.averageEngagement)}`,
      );
    }
    if (typeof summaryMetrics.activeCampaigns === 'number') {
      summaryLines.push(
        `当前进行中的活动：${summaryMetrics.activeCampaigns} 项`,
      );
    }
    if (typeof summaryMetrics.plannedCampaigns === 'number') {
      summaryLines.push(
        `待上线活动：${summaryMetrics.plannedCampaigns} 项`,
      );
    }
    if (summaryLines.length) {
      sections.push(createHeading('运营概览'));
      summaryLines.forEach((line) => sections.push(buildBullet(line)));
    }

    if (payload.signals?.length) {
      sections.push(createHeading('监测到的业务信号'));
      payload.signals.forEach((signal) =>
        sections.push(buildBullet(signal && signal.trim() ? signal : '暂无')),
      );
    }

    if (payload.notes?.length) {
      sections.push(createHeading('执行备注'));
      payload.notes.forEach((note) =>
        sections.push(buildBullet(note && note.trim() ? note : '暂无')),
      );
    }

    if (payload.priorities?.length) {
      sections.push(createHeading('AI 优先级建议'));
      payload.priorities.forEach((priority, index) => {
        const priorityTitle =
          (index + 1).toString() + '. ' + (priority.title ?? '未命名建议');
        sections.push(
          createHeading(priorityTitle, docx.HeadingLevel.HEADING_2),
        );
        if (priority.rationale) {
          sections.push(new docx.Paragraph({ text: priority.rationale }));
        }
        const meta: string[] = [];
        if (typeof priority.impactScore === 'number') {
          const scoreText = percentFormatter.format(
            Math.min(priority.impactScore, 1) * 100,
          );
          meta.push('影响力评分：' + scoreText + '分');
        }
        if (priority.category) {
          meta.push('策略方向：' + priority.category);
        }
        if (meta.length > 0) {
          sections.push(
            new docx.Paragraph({
              text: meta.join(' · '),
              style: 'SmallNote',
            }),
          );
        }
        if (priority.actions?.length) {
          priority.actions
            .filter(
              (action): action is string =>
                typeof action === 'string' && action.trim().length > 0,
            )
            .forEach((action) => sections.push(buildBullet(action, 1)));
        }
      });
    }

    if (payload.campaigns?.length) {
      sections.push(createHeading('重点活动表现'));
      const campaignRows = payload.campaigns.map((campaign) => {
        const reachText =
          typeof campaign.reach === 'number' && Number.isFinite(campaign.reach)
            ? Math.max(0, Math.round(campaign.reach)).toLocaleString('zh-CN')
            : '暂无';
        return [
          campaign.name ?? '未命名',
          resolveStatus(campaign.status),
          formatWindow(campaign.startDate ?? undefined, campaign.endDate ?? undefined),
          campaign.target ?? '未填写',
          reachText,
          toPercent(campaign.engagement),
          toPercent(campaign.conversion),
          toCurrency(campaign.revenue),
        ];
      });
      sections.push(
        buildTable(
          ['活动', '状态', '档期', '客群', '触达', '互动率', '转化率', '贡献收入'],
          campaignRows,
        ),
      );

      const revenueSeries = payload.campaigns.map((campaign) => ({
        label: campaign.name ?? '未命名活动',
        value: toNumber(campaign.revenue ?? 0),
      }));
      if (revenueSeries.some((item) => item.value > 0)) {
        sections.push(createHeading('活动营收对比图', docx.HeadingLevel.HEADING_2));
        sections.push(buildBarChartTable(revenueSeries, { unit: '¥', decimals: 0 }));
      }
    } else {
      sections.push(
        new docx.Paragraph({ text: '暂无重点活动数据。', style: 'SmallNote' }),
      );
    }

    if (payload.sentiment?.length) {
      sections.push(createHeading('情绪脉搏'));
      const sentimentRows = payload.sentiment.map((item) => [
        item.date ?? '—',
        toPercent(item.positive),
        toPercent(item.neutral),
        toPercent(item.negative),
      ]);
      sections.push(buildTable(['日期', '正向', '中性', '负向'], sentimentRows));
      sections.push(createHeading('正向情绪趋势图', docx.HeadingLevel.HEADING_2));
      sections.push(
        buildBarChartTable(
          payload.sentiment.map((item) => ({
            label: item.date ?? '未知',
            value:
              typeof item.positive === 'number' && Number.isFinite(item.positive)
                ? Math.max(0, Math.min(item.positive, 100))
                : 0,
          })),
          { unit: '%', maxValue: 100, decimals: 1 },
        ),
      );
    }

    if (payload.customerSegments?.length) {
      sections.push(createHeading('客群构成'));
      const segments = (payload.customerSegments ?? []).filter(
        (segment) => segment?.name,
      );
      segments.forEach((segment) => {
        sections.push(
          buildBullet(
            `${segment?.name ?? '未命名客群'}：${toPercent(segment?.value)}`,
          ),
        );
      });
      if (segments.length > 0) {
        sections.push(createHeading('客群贡献图', docx.HeadingLevel.HEADING_2));
        sections.push(
          buildBarChartTable(
            segments.map((segment) => ({
              label: segment?.name ?? '未命名客群',
              value:
                typeof segment?.value === 'number'
                  ? Math.max(0, Math.min(segment.value, 100))
                  : 0,
            })),
            { unit: '%', maxValue: 100, decimals: 1 },
          ),
        );
      }
    }

    const document = new docx.Document({
      styles: buildStandardStyles(),
      sections: [
        {
          headers: { default: header },
          footers: { default: footer },
          children: sections,
        },
      ],
    });

    return docx.Packer.toBuffer(document);
  }
  private classifyCampaign(
    campaign: MarketingCampaignEntity,
    now: Date,
    statusOverride?: $Enums.CampaignStatus,
  ): 'active' | 'upcoming' | 'completed' {
    // Ops often backfill status updates; rely on schedule windows to reduce false positives.
    const status = statusOverride ?? campaign.status;
    if (status === CAMPAIGN_STATUS.CANCELLED) {
      return 'completed';
    }
    if (status === CAMPAIGN_STATUS.COMPLETED) {
      return 'completed';
    }

    const endHasPassed = hasPassed(campaign.endDate, now);
    const startsInFuture = isUpcoming(campaign.startDate, now);

    if (status === CAMPAIGN_STATUS.ACTIVE) {
      if (endHasPassed) {
        return 'completed';
      }
      if (startsInFuture) {
        return 'upcoming';
      }
      return 'active';
    }

    if (endHasPassed) {
      return 'completed';
    }
    if (startsInFuture) {
      return 'upcoming';
    }
    return status === CAMPAIGN_STATUS.DRAFT ? 'upcoming' : 'active';
  }

  private summarizeChannelSpend(
    campaigns: MarketingCampaignEntity[],
    now: Date,
    overrides?: Map<string, MarketingCampaignOverrideDto>,
  ) {
    const ledger = new Map<
      string,
      { total: number; active: number; cancelled: number }
    >();
    let investableBudget = 0;
    let activeBudget = 0;
    let cancelledBudget = 0;

    for (const campaign of campaigns) {
      const overrideStatus = overrides?.get(campaign.id)?.status as
        | $Enums.CampaignStatus
        | undefined;
      const bucket = this.classifyCampaign(campaign, now, overrideStatus);
      const resolvedStatus = overrideStatus ?? campaign.status;
      const budgetAmount = toNumber(campaign.budget);

      if (resolvedStatus === CAMPAIGN_STATUS.CANCELLED) {
        cancelledBudget += budgetAmount;
      } else {
        investableBudget += budgetAmount;
      }
      if (bucket === 'active') {
        activeBudget += budgetAmount;
      }

      const stats = ledger.get(campaign.channel) ?? {
        total: 0,
        active: 0,
        cancelled: 0,
      };
      stats.total += budgetAmount;
      if (bucket === 'active') {
        stats.active += budgetAmount;
      }
      if (resolvedStatus === CAMPAIGN_STATUS.CANCELLED) {
        stats.cancelled += budgetAmount;
      }
      ledger.set(campaign.channel, stats);
    }

    return { ledger, investableBudget, activeBudget, cancelledBudget };
  }

  private toCampaignView(campaign: MarketingCampaignEntity): CampaignView {
    return {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective ?? null,
      channel: campaign.channel,
      status: campaign.status,
      startDate: campaign.startDate.toISOString(),
      endDate: campaign.endDate ? campaign.endDate.toISOString() : null,
      budget: roundNumber(toNumber(campaign.budget), 2),
      expectedLift: toOptionalNumber(campaign.expectedLift),
      actualLift: toOptionalNumber(campaign.actualLift),
      tags: campaign.tags,
    };
  }
}
