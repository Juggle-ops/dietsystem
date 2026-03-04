import { Prisma, PrismaClient, $Enums } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

type SeedStore = {
  code: string;
  name: string;
  timezone: string;
  locale: string;
  currency: string;
  address: string;
  managerName: string;
  contactPhone: string;
  openedAt: string;
  metadata: Record<string, unknown>;
};

const stores: SeedStore[] = [
  {
    code: 'SH001',
    name: '上海陆家嘴旗舰店',
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
    currency: 'CNY',
    address: '上海市浦东新区银城中路68号',
    managerName: '李想',
    contactPhone: '+86-21-88886666',
    openedAt: '2023-05-20T00:00:00.000Z',
    metadata: {
      city: '上海',
      storeLevel: 'flagship',
      seatingCapacity: 120,
    },
  },
  {
    code: 'SZ201',
    name: '深圳科兴城城市店',
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
    currency: 'CNY',
    address: '深圳市南山区科苑大道15号',
    managerName: '王露',
    contactPhone: '+86-755-77775555',
    openedAt: '2024-03-18T00:00:00.000Z',
    metadata: {
      city: '深圳',
      storeLevel: 'city',
      seatingCapacity: 90,
    },
  },
];

async function seedStores() {
  const created: Record<string, { id: string; code: string }> = {};
  for (const store of stores) {
    const result = await prisma.store.upsert({
      where: { code: store.code },
      update: {
        name: store.name,
        timezone: store.timezone,
        locale: store.locale,
        currency: store.currency,
        address: store.address,
        managerName: store.managerName,
        contactPhone: store.contactPhone,
        openedAt: new Date(store.openedAt),
        metadata: store.metadata as Prisma.InputJsonValue,
        isActive: true,
      },
      create: {
        code: store.code,
        name: store.name,
        timezone: store.timezone,
        locale: store.locale,
        currency: store.currency,
        address: store.address,
        managerName: store.managerName,
        contactPhone: store.contactPhone,
        openedAt: new Date(store.openedAt),
        metadata: store.metadata as Prisma.InputJsonValue,
        isActive: true,
      },
    });
    created[store.code] = { id: result.id, code: result.code };
  }
  return created;
}

async function seedInventory(storeId: string, code: string) {
  const inventoryItems: Array<{
    id: string;
    sku: string;
    name: string;
    nameEn: string;
    category: string;
    unit: string;
    currentStock: Decimal;
    reorderPoint: Decimal;
    safetyStock: Decimal;
    leadTimeDays: number;
    supplier: string;
    shelfLifeDays: number;
    lastDeliveryAt: Date;
    metadata: Prisma.InputJsonValue;
  }> = [
    {
      id: `${code}-INV-BEEF`,
      sku: 'ING-0001',
      name: '精选牛腩',
      nameEn: 'Premium Beef Brisket',
      category: 'protein',
      unit: 'kg',
      currentStock: new Decimal('32.6'),
      reorderPoint: new Decimal('20'),
      safetyStock: new Decimal('15'),
      leadTimeDays: 2,
      supplier: '华东肉类联合供应中心',
      shelfLifeDays: 5,
      lastDeliveryAt: new Date('2025-02-27T02:00:00.000Z'),
      metadata: {
        storage: '冷藏',
        lossRate: 0.05,
        preferredVendor: true,
      } as Prisma.InputJsonValue,
    },
    {
      id: `${code}-INV-RICE`,
      sku: 'ING-0002',
      name: '东北珍珠米',
      nameEn: 'Northeast Pearl Rice',
      category: 'grain',
      unit: 'kg',
      currentStock: new Decimal('120.5'),
      reorderPoint: new Decimal('80'),
      safetyStock: new Decimal('60'),
      leadTimeDays: 4,
      supplier: '黑龙江三江米业',
      shelfLifeDays: 365,
      lastDeliveryAt: new Date('2025-02-22T06:00:00.000Z'),
      metadata: {
        storage: '常温',
        organicCertification: true,
      } as Prisma.InputJsonValue,
    },
    {
      id: `${code}-INV-LETTUCE`,
      sku: 'ING-0003',
      name: '本地生菜',
      nameEn: 'Local Lettuce',
      category: 'produce',
      unit: 'kg',
      currentStock: new Decimal('18.4'),
      reorderPoint: new Decimal('12'),
      safetyStock: new Decimal('10'),
      leadTimeDays: 1,
      supplier: '浦东蔬果直采中心',
      shelfLifeDays: 3,
      lastDeliveryAt: new Date('2025-03-01T00:30:00.000Z'),
      metadata: {
        storage: '冷藏',
        procurementStrategy: 'daily-fresh',
      } as Prisma.InputJsonValue,
    },
  ];

  await Promise.all(
    inventoryItems.map((item) =>
      prisma.inventoryItem.upsert({
        where: { id: item.id },
        update: {
          storeId,
          sku: item.sku,
          name: item.name,
          nameEn: item.nameEn,
          category: item.category,
          unit: item.unit,
          currentStock: item.currentStock,
          reorderPoint: item.reorderPoint,
          safetyStock: item.safetyStock,
          leadTimeDays: item.leadTimeDays,
          supplier: item.supplier,
          shelfLifeDays: item.shelfLifeDays,
          lastDeliveryAt: item.lastDeliveryAt,
          metadata: item.metadata,
        },
        create: {
          id: item.id,
          storeId,
          sku: item.sku,
          name: item.name,
          nameEn: item.nameEn,
          category: item.category,
          unit: item.unit,
          currentStock: item.currentStock,
          reorderPoint: item.reorderPoint,
          safetyStock: item.safetyStock,
          leadTimeDays: item.leadTimeDays,
          supplier: item.supplier,
          shelfLifeDays: item.shelfLifeDays,
          lastDeliveryAt: item.lastDeliveryAt,
          metadata: item.metadata,
        },
      }),
    ),
  );
}

async function seedPredictions(storeId: string, code: string) {
  const id = `${code}-PRED-20250305`;
  const payload: Prisma.InputJsonValue = {
    trafficForecast: [
      { hour: '11:00', customers: 85, lower: 72, upper: 101 },
      { hour: '12:00', customers: 128, lower: 110, upper: 152 },
      { hour: '18:00', customers: 142, lower: 118, upper: 170 },
    ],
    ingredientForecast: [
      { sku: 'ING-0001', demand: 24.5, unit: 'kg' },
      { sku: 'ING-0002', demand: 96, unit: 'kg' },
      { sku: 'ING-0003', demand: 16.2, unit: 'kg' },
    ],
    factors: {
      weather: 'cloudy',
      holiday: false,
      marketingLift: 0.12,
      nearbyEvents: [
        { type: 'expo', name: '消费科技展', expectedVisitors: 3000 },
      ],
    },
  };
  const metrics: Prisma.InputJsonValue = {
    mape: 8.4,
    rmse: 12.5,
    dataFreshnessMinutes: 18,
  };
  const notes = '结合陆家嘴白领午餐需求与线下快闪活动，预测在既有基线基础上小幅上调。';

  await prisma.predictionSnapshot.upsert({
    where: { id },
    update: {
      storeId,
      targetDate: new Date('2025-03-05T00:00:00.000Z'),
      horizon: 'daily',
      modelVersion: 'v1.4.2',
      generatedAt: new Date(),
      generatedBy: 'forecast-engine',
      payload,
      metrics,
      notes,
    },
    create: {
      id,
      storeId,
      targetDate: new Date('2025-03-05T00:00:00.000Z'),
      horizon: 'daily',
      modelVersion: 'v1.4.2',
      generatedAt: new Date(),
      generatedBy: 'forecast-engine',
      payload,
      metrics,
      notes,
    },
  });
}

async function seedMarketing(storeId: string, code: string) {
  const id = `${code}-MKT-Q1-BUNDLE`;
  const kpi: Prisma.InputJsonValue = {
    conversionRate: 0.21,
    roi: 3.4,
    voucherUsage: 0.62,
  };

  await prisma.marketingCampaign.upsert({
    where: { id },
    update: {
      storeId,
      name: '春季精品套餐推广',
      objective: '提升午餐时段客单价',
      channel: 'wechat-mini-app',
      status: 'ACTIVE',
      budget: new Decimal('38000'),
      expectedLift: new Decimal('0.15'),
      actualLift: new Decimal('0.11'),
      startDate: new Date('2025-03-01T00:00:00.000Z'),
      endDate: new Date('2025-03-31T15:59:59.000Z'),
      kpi,
      tags: ['bundle', 'lunch', 'white-collar'],
    },
    create: {
      id,
      storeId,
      name: '春季精品套餐推广',
      objective: '提升午餐时段客单价',
      channel: 'wechat-mini-app',
      status: 'ACTIVE',
      budget: new Decimal('38000'),
      expectedLift: new Decimal('0.15'),
      actualLift: new Decimal('0.11'),
      startDate: new Date('2025-03-01T00:00:00.000Z'),
      endDate: new Date('2025-03-31T15:59:59.000Z'),
      kpi,
      tags: ['bundle', 'lunch', 'white-collar'],
    },
  });
}

async function seedStaffSchedules(storeId: string, code: string) {
  const schedules: Array<{
    id: string;
    staffName: string;
    role: string;
    scheduleDate: Date;
    shiftCode: string;
    shiftStart: Date;
    shiftEnd: Date;
    status: $Enums.ScheduleStatus;
    coverageNote: string;
    assignments: {
      stations: string[];
      checklist: string[];
    };
  }> = [
    {
      id: `${code}-SCHED-AM-20250305-ZHANG`,
      staffName: '张凯',
      role: 'line-chef',
      scheduleDate: new Date('2025-03-05T00:00:00.000Z'),
      shiftCode: 'AM_PEAK',
      shiftStart: new Date('2025-03-05T08:00:00.000Z'),
      shiftEnd: new Date('2025-03-05T14:00:00.000Z'),
      status: $Enums.ScheduleStatus.PUBLISHED,
      coverageNote: '午高峰保障主菜产能，需关注冷菜备餐。',
      assignments: {
        stations: ['hot-line', 'prep'],
        checklist: ['08:15 温度校准', '11:00 菜品补货'],
      },
    },
    {
      id: `${code}-SCHED-PM-20250305-LIN`,
      staffName: '林伟',
      role: 'floor-manager',
      scheduleDate: new Date('2025-03-05T00:00:00.000Z'),
      shiftCode: 'PM_PEAK',
      shiftStart: new Date('2025-03-05T15:00:00.000Z'),
      shiftEnd: new Date('2025-03-05T22:00:00.000Z'),
      status: $Enums.ScheduleStatus.PUBLISHED,
      coverageNote: '晚餐时段需加强堂食引导，关注外卖取餐动线。',
      assignments: {
        stations: ['dining', 'takeaway'],
        checklist: ['17:30 外卖高峰排班核检', '20:00 顾客满意度抽查'],
      },
    },
  ];

  await Promise.all(
    schedules.map((schedule) =>
      prisma.staffSchedule.upsert({
        where: { id: schedule.id },
        update: {
          storeId,
          scheduleDate: schedule.scheduleDate,
          staffName: schedule.staffName,
          role: schedule.role,
          shiftCode: schedule.shiftCode,
          shiftStart: schedule.shiftStart,
          shiftEnd: schedule.shiftEnd,
          status: schedule.status,
          coverageNote: schedule.coverageNote,
          assignments: schedule.assignments as Prisma.InputJsonValue,
        },
        create: {
          id: schedule.id,
          storeId,
          scheduleDate: schedule.scheduleDate,
          staffName: schedule.staffName,
          role: schedule.role,
          shiftCode: schedule.shiftCode,
          shiftStart: schedule.shiftStart,
          shiftEnd: schedule.shiftEnd,
          status: schedule.status,
          coverageNote: schedule.coverageNote,
          assignments: schedule.assignments as Prisma.InputJsonValue,
        },
      }),
    ),
  );
}

async function seedAlerts(storeId: string, code: string) {
  const id = `${code}-ALERT-INV-BEEF`;
  const context: Prisma.InputJsonValue = {
    sku: 'ING-0001',
    currentStock: 32.6,
    forecastedDemand: 52,
    safetyStock: 15,
  };
  const title = '核心蛋白库存低于安全阈值';
  const message = '精选牛腩预计 18 小时内耗尽，请确认加急补货或调整菜品档期。';

  await prisma.alertRecord.upsert({
    where: { id },
    update: {
      storeId,
      alertType: 'INVENTORY',
      alertLevel: 'HIGH',
      title,
      message,
      source: 'inventory-guardian',
      context,
      requiresAction: true,
    },
    create: {
      id,
      storeId,
      alertType: 'INVENTORY',
      alertLevel: 'HIGH',
      title,
      message,
      source: 'inventory-guardian',
      context,
      requiresAction: true,
    },
  });
}

async function seedCostSnapshots(storeId: string, code: string) {
  const id = `${code}-COST-20250304`;
  const metadata: Prisma.InputJsonValue = {
    netProfit: 48000,
    expectedFootTraffic: 1280,
    variance: {
      cogs: -0.03,
      laborCost: 0.02,
    },
  };
  const comments = '春季套餐上线首日，堂食占比提升 8%。';

  await prisma.costSnapshot.upsert({
    where: { id },
    update: {
      storeId,
      capturedDate: new Date('2025-03-04T00:00:00.000Z'),
      cogs: new Decimal('42800'),
      laborCost: new Decimal('26600'),
      marketingSpend: new Decimal('8600'),
      utilities: new Decimal('4200'),
      otherCost: new Decimal('3100'),
      revenue: new Decimal('132800'),
      footTraffic: 1180,
      comments,
      metadata,
    },
    create: {
      id,
      storeId,
      capturedDate: new Date('2025-03-04T00:00:00.000Z'),
      cogs: new Decimal('42800'),
      laborCost: new Decimal('26600'),
      marketingSpend: new Decimal('8600'),
      utilities: new Decimal('4200'),
      otherCost: new Decimal('3100'),
      revenue: new Decimal('132800'),
      footTraffic: 1180,
      comments,
      metadata,
    },
  });
}

async function seedDecisions(storeId: string, code: string) {
  const id = `${code}-DEC-20250305-MENU`;
  const context: Prisma.InputJsonValue = {
    timeWindow: '2025-03-05',
    target: 'lunch',
    constraints: ['后厨产能 <= 140 份/小时', '预算 +5%'],
  };
  const recommendation: Prisma.InputJsonValue = {
    promote: [
      { sku: 'ING-0001', action: '设置快闪组合餐', expectedLift: 0.14 },
      { sku: 'DRINK-0008', action: '联动咖啡组合优惠', expectedLift: 0.09 },
    ],
    suppress: [
      { sku: 'ING-0005', reason: '库存紧张，建议售罄提醒。' },
    ],
  };
  const notes = '等待运营经理确认执行时间与门店培训安排。';

  await prisma.decisionSnapshot.upsert({
    where: { id },
    update: {
      storeId,
      decisionType: 'MENU_OPTIMIZATION',
      context,
      recommendation,
      status: 'PENDING',
      notes,
    },
    create: {
      id,
      storeId,
      decisionType: 'MENU_OPTIMIZATION',
      context,
      recommendation,
      status: 'PENDING',
      notes,
    },
  });
}

async function main() {
  const storeMap = await seedStores();
  for (const [code, info] of Object.entries(storeMap)) {
    await seedInventory(info.id, code);
    await seedPredictions(info.id, code);
    await seedMarketing(info.id, code);
    await seedStaffSchedules(info.id, code);
    await seedAlerts(info.id, code);
    await seedCostSnapshots(info.id, code);
    await seedDecisions(info.id, code);
  }
}

main()
  .catch((err) => {
    console.error('Seed failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
