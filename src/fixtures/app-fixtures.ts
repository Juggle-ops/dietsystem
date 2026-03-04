import { $Enums } from '@prisma/client';

type StoreFixture = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  locale: string;
  currency: string;
  address: string;
  managerName: string;
  contactPhone: string;
  openedAt: Date;
  isActive: boolean;
  metadata: null;
  createdAt: Date;
  updatedAt: Date;
};

export type AppFixtureBundle = ReturnType<typeof buildAppFixtures>;

export function buildAppFixtures() {
  const store = createStoreFixture();
  const inventoryItems = createInventoryFixtures(store.id);
  const predictionSnapshot = createPredictionFixture(store.id);
  const decisionSnapshots = createDecisionFixtures(store.id);
  const costSnapshots = createCostFixtures(store.id);
  const marketingCampaigns = createMarketingFixtures(store.id);

  return {
    store,
    inventoryItems,
    predictionSnapshot,
    decisionSnapshots,
    costSnapshots,
    marketingCampaigns,
  };
}

function createStoreFixture(): StoreFixture {
  const now = new Date();
  return {
    id: 'store-1',
    code: 'SH001',
    name: 'Shanghai Flagship',
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
    currency: 'CNY',
    address: 'No. 68 Yincheng Middle Road, Pudong',
    managerName: 'Li Xiang',
    contactPhone: '+86-21-88886666',
    openedAt: new Date('2023-05-20T00:00:00.000Z'),
    isActive: true,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createInventoryFixtures(storeId: string) {
  return [
    {
      id: 'store-1-BEEF',
      storeId,
      sku: 'ING-0001',
      name: 'Premium Beef Brisket',
      nameEn: 'Premium Beef',
      category: 'protein',
      unit: 'kg',
      currentStock: 5,
      reorderPoint: 18,
      safetyStock: 14,
      leadTimeDays: 2,
      supplier: 'East China Meat Cooperative',
      shelfLifeDays: 5,
      lastDeliveryAt: new Date('2025-03-02T01:00:00.000Z'),
      metadata: { margin: 0.62 },
      createdAt: new Date('2025-02-01T00:00:00.000Z'),
      updatedAt: new Date('2025-03-03T06:00:00.000Z'),
    },
    {
      id: 'store-1-LETTUCE',
      storeId,
      sku: 'ING-0002',
      name: 'Local Hydroponic Lettuce',
      nameEn: 'Local Lettuce',
      category: 'produce',
      unit: 'kg',
      currentStock: 9,
      reorderPoint: 10,
      safetyStock: 8,
      leadTimeDays: 1,
      supplier: 'Pudong Produce Hub',
      shelfLifeDays: 3,
      lastDeliveryAt: new Date('2025-03-04T03:00:00.000Z'),
      metadata: { margin: 0.35, spoilageRisk: 0.25 },
      createdAt: new Date('2025-02-05T00:00:00.000Z'),
      updatedAt: new Date('2025-03-04T03:00:00.000Z'),
    },
  ];
}

function createPredictionFixture(storeId: string) {
  return {
    id: 'snapshot-1',
    storeId,
    targetDate: new Date('2025-03-05T00:00:00.000Z'),
    horizon: 'daily',
    modelVersion: 'v1.4.2',
    generatedAt: new Date('2025-03-20T22:30:00.000Z'),
    generatedBy: 'forecast-engine',
    payload: {
      ingredientForecast: [
        {
          sku: 'ING-0001',
          demand: 40.4,
          unit: 'kg',
          ingredient: 'Premium Beef Brisket',
        },
        {
          sku: 'ING-0002',
          demand: 16.5,
          unit: 'kg',
          ingredient: 'Local Hydroponic Lettuce',
        },
      ],
      trafficForecast: [
        { hour: '09:00', customers: 40, lower: 35, upper: 52 },
        { hour: '12:00', customers: 120, lower: 105, upper: 138 },
        { hour: '18:00', customers: 150, lower: 120, upper: 190 },
      ],
      factors: { weather: 'rain', holiday: false },
    },
    metrics: { mape: 9.8, rmse: 12.1 },
    notes: 'Scenario forecast for lunch service',
    createdAt: new Date('2025-03-04T22:30:00.000Z'),
  };
}

function createDecisionFixtures(storeId: string) {
  const base = [
    {
      id: 'decision-pending-1',
      decisionType: 'WORKFORCE_ADJUSTMENT',
      status: 'PENDING',
      createdAt: new Date('2025-03-04T08:00:00.000Z'),
      appliedAt: null,
      notes: 'Awaiting operations confirmation',
      recommendation: { promote: [{ action: 'Extend dinner shift coverage' }] },
      context: { timeWindow: 'Mar 5 - Mar 6', target: 'Dinner service' },
    },
    {
      id: 'decision-pending-2',
      decisionType: 'INVENTORY_REPLENISHMENT',
      status: 'PENDING',
      createdAt: new Date('2025-03-04T09:00:00.000Z'),
      appliedAt: null,
      notes: 'Pending finance sign-off',
      recommendation: {
        promote: [{ action: 'Order additional seafood allocation' }],
      },
      context: { timeWindow: 'Mar 6 - Mar 10', target: 'Seafood menu' },
    },
    {
      id: 'decision-pending-3',
      decisionType: 'PROMOTION_PLANNING',
      status: 'PENDING',
      createdAt: new Date('2025-03-04T10:00:00.000Z'),
      appliedAt: null,
      notes: 'Marketing review pending',
      recommendation: { promote: [{ action: 'Launch brunch bundle' }] },
      context: { timeWindow: 'Mar 8 - Mar 9', target: 'Weekend brunch' },
    },
    {
      id: 'decision-pending-4',
      decisionType: 'COST_CONTROL',
      status: 'PENDING',
      createdAt: new Date('2025-03-04T11:00:00.000Z'),
      appliedAt: null,
      notes: 'Leadership review queued',
      recommendation: {
        promote: [{ action: 'Freeze overtime for non-peak slots' }],
      },
      context: { timeWindow: 'Mar 5 - Mar 12', target: 'Labor cost' },
    },
    {
      id: 'decision-applied-1',
      decisionType: 'WORKFORCE_ADJUSTMENT',
      status: 'APPLIED',
      createdAt: new Date('2025-02-28T08:00:00.000Z'),
      appliedAt: new Date('2025-02-28T10:00:00.000Z'),
      notes: 'Implemented successfully',
      recommendation: {
        promote: [{ action: 'Shift prep team to earlier slot' }],
      },
      context: { timeWindow: 'Feb 28 - Mar 2', target: 'Prep throughput' },
    },
    {
      id: 'decision-dismissed-1',
      decisionType: 'MENU_OPTIMIZATION',
      status: 'DISMISSED',
      createdAt: new Date('2025-03-03T08:00:00.000Z'),
      appliedAt: null,
      notes: 'Rejected due to supplier commitment',
      recommendation: {
        suppress: [{ action: 'Remove seasonal tart', reason: 'Low margin' }],
      },
      context: { timeWindow: 'Mar 4 - Mar 6', target: 'Dessert lineup' },
    },
    {
      id: 'decision-dismissed-2',
      decisionType: 'INVENTORY_REPLENISHMENT',
      status: 'DISMISSED',
      createdAt: new Date('2025-03-03T10:00:00.000Z'),
      appliedAt: null,
      notes: 'Deferred to next cycle',
      recommendation: {
        review: [{ action: 'Evaluate alternative flour vendor' }],
      },
      context: { timeWindow: 'Mar 6 - Mar 8', target: 'Bakery' },
    },
    {
      id: 'decision-dismissed-3',
      decisionType: 'COST_CONTROL',
      status: 'DISMISSED',
      createdAt: new Date('2025-03-03T12:00:00.000Z'),
      appliedAt: null,
      notes: 'Conflict with marketing push',
      recommendation: {
        review: [{ action: 'Reduce premium beverage assortment' }],
      },
      context: { timeWindow: 'Mar 7 - Mar 14', target: 'Beverage cost' },
    },
  ];

  return base.map((entry) => ({
    ...entry,
    storeId,
    appliedBy: entry.appliedAt ? 'OpsLead' : null,
  }));
}

function createCostFixtures(storeId: string) {
  return [
    {
      id: 'cost-snapshot-1',
      storeId,
      capturedDate: new Date('2025-03-04T02:00:00.000Z'),
      cogs: 72000,
      laborCost: 52000,
      marketingSpend: 38000,
      utilities: 9000,
      otherCost: 6000,
      revenue: 180000,
      footTraffic: 950,
      metadata: {
        netProfit: -15000,
        expectedFootTraffic: 1200,
        variance: { cogs: 0.15 },
      },
      createdAt: new Date('2025-03-04T02:00:00.000Z'),
      updatedAt: new Date('2025-03-04T02:00:00.000Z'),
    },
  ];
}

function createMarketingFixtures(storeId: string) {
  const buildCampaign = (partial: {
    id: string;
    name: string;
    objective: string;
    channel: string;
    status: $Enums.CampaignStatus;
    startDate: string;
    endDate: string | null;
    budget: number;
    expectedLift: number | null;
    actualLift: number | null;
    tags: string[];
    kpi: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }) => ({
    ...partial,
    storeId,
    startDate: new Date(partial.startDate),
    endDate: partial.endDate ? new Date(partial.endDate) : null,
    createdAt: new Date(partial.createdAt),
    updatedAt: new Date(partial.updatedAt),
  });

  return [
    buildCampaign({
      id: 'campaign-active',
      name: 'Lunch Bundle Push',
      objective: 'Boost weekday lunch traffic',
      channel: 'wechat-mini-app',
      status: $Enums.CampaignStatus.ACTIVE,
      startDate: '2025-10-01T00:00:00.000Z',
      endDate: '2025-12-01T12:00:00.000Z',
      budget: 38000,
      expectedLift: 0.15,
      actualLift: 0.08,
      tags: ['bundle', 'digital'],
      kpi: { conversionRate: 0.21 },
      createdAt: '2025-02-01T00:00:00.000Z',
      updatedAt: '2025-03-05T03:00:00.000Z',
    }),
    buildCampaign({
      id: 'campaign-completed',
      name: 'Spring Awareness Billboards',
      objective: 'Top-of-funnel awareness',
      channel: 'outdoor',
      status: $Enums.CampaignStatus.COMPLETED,
      startDate: '2025-08-01T00:00:00.000Z',
      endDate: '2025-09-05T23:59:59.000Z',
      budget: 12000,
      expectedLift: 0.2,
      actualLift: 0.17,
      tags: ['brand'],
      kpi: { reach: 180000 },
      createdAt: '2024-12-15T00:00:00.000Z',
      updatedAt: '2025-03-01T05:00:00.000Z',
    }),
    buildCampaign({
      id: 'campaign-upcoming',
      name: 'Evening Happy Hour',
      objective: 'Drive after-work visits',
      channel: 'douyin',
      status: $Enums.CampaignStatus.DRAFT,
      startDate: '2025-11-05T00:00:00.000Z',
      endDate: '2025-12-05T23:59:59.000Z',
      budget: 18000,
      expectedLift: 0.18,
      actualLift: null,
      tags: ['promotion'],
      kpi: { videoViews: 50000 },
      createdAt: '2025-03-02T00:00:00.000Z',
      updatedAt: '2025-03-04T00:00:00.000Z',
    }),
    buildCampaign({
      id: 'campaign-cancelled',
      name: 'Post-Holiday Radio Blast',
      objective: 'Recover January traffic',
      channel: 'radio',
      status: $Enums.CampaignStatus.CANCELLED,
      startDate: '2025-01-05T00:00:00.000Z',
      endDate: '2025-01-20T23:00:00.000Z',
      budget: 25000,
      expectedLift: 0.12,
      actualLift: null,
      tags: ['brand', 'seasonal'],
      kpi: { reach: 80000 },
      createdAt: '2024-12-25T00:00:00.000Z',
      updatedAt: '2025-01-02T12:00:00.000Z',
    }),
  ];
}
