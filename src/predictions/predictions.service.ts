import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { StoreResolverService } from '../prisma/store-resolver.service';
import { RulesRegistryService } from '../rules/rules-registry.service';
import { RuleHit } from '../rules/rule.types';
import {
  EvaluateForecastDto,
  MenuAdjustmentRequestDto,
  SalesForecastRequestDto,
  TrafficForecastRequestDto,
} from './dto/forecast-query.dto';

type PredictionSnapshotEntity = NonNullable<
  Awaited<ReturnType<PrismaClient['predictionSnapshot']['findFirst']>>
>;

type ForecastFactor = Record<string, unknown>;

type IngredientForecastEntry = {
  sku: string;
  demand: number;
  unit?: string;
  ingredient?: string;
};

type TrafficPoint = {
  time: string;
  customers: number;
  lower?: number;
  upper?: number;
};

type SalesForecastItem = {
  sku: string;
  ingredient: string;
  unit: string;
  predictedAmount: number;
  currentStock: number | null;
  safetyStock: number;
  restockRecommendation: number | null;
  daysCover: number | null;
  status: 'healthy' | 'watch' | 'critical';
  signals: string[];
};

type SalesForecastResponse = {
  store: {
    id: string;
    code: string;
    name: string;
  };
  targetDate: string;
  generatedAt: string;
  horizon: string;
  modelVersion?: string | null;
  metrics: Record<string, unknown> | null;
  items: SalesForecastItem[];
  summary: {
    totalDemand: number;
    expectedShortage: number;
    criticalCount: number;
  };
  factors: ForecastFactor | null;
  signals: string[];
  rules: RuleHit[];
};

type TrafficForecastResponse = {
  storeId: string;
  targetDate: string;
  generatedAt: string;
  horizon: string;
  points: TrafficPoint[];
  averageCustomers: number;
  signals: string[];
  rules: RuleHit[];
};

type MenuAdjustmentResponse = {
  promote: { ingredient: string; reason: string; restock?: number | null }[];
  review: { ingredient: string; reason: string }[];
  suppress: { ingredient: string; reason: string }[];
  signals: string[];
  rules: RuleHit[];
};

@Injectable()
export class PredictionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeResolver: StoreResolverService,
    private readonly rulesRegistry: RulesRegistryService,
  ) {}

  async getSalesForecast(
    request: SalesForecastRequestDto,
  ): Promise<SalesForecastResponse> {
    const store = await this.storeResolver.resolve(request.storeId);
    const snapshot = await this.findSnapshot(store.id, request.targetDate);
    if (!snapshot) {
      throw new NotFoundException(
        'Forecast snapshot not available for the requested store/date',
      );
    }

    const ingredientForecast = this.extractIngredientForecast(snapshot);
    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: { storeId: store.id },
    });

    const inventoryBySku = new Map<string, (typeof inventoryItems)[number]>();
    for (const item of inventoryItems) {
      inventoryBySku.set(item.sku, item);
    }
    const overrideByIngredient = new Map(
      (request.items ?? []).map((item) => [item.ingredient, item]),
    );

    const items: SalesForecastItem[] = ingredientForecast.map((entry) => {
      const inventory = inventoryBySku.get(entry.sku);
      const override = inventory
        ? overrideByIngredient.get(inventory.name)
        : undefined;

      const ingredientName = entry.ingredient ?? inventory?.name ?? entry.sku;
      const unit = entry.unit ?? inventory?.unit ?? 'unit';
      const predictedAmount = this.round(entry.demand, 1);

      const currentStock =
        override?.currentStock ??
        this.asNumber(inventory?.currentStock ?? null);
      const reorderPoint = this.asNumber(inventory?.reorderPoint ?? null);
      const safetyBase = this.asNumber(inventory?.safetyStock ?? null);
      const safetyStock = this.round(
        Math.max(safetyBase, predictedAmount * 1.1),
        1,
      );

      const stockForRecommendation = currentStock ?? 0;
      const restockRecommendation = Math.max(
        0,
        this.round(safetyStock + predictedAmount - stockForRecommendation, 1),
      );
      const daysCover =
        predictedAmount > 0
          ? this.round(stockForRecommendation / predictedAmount, 1)
          : null;
      const status = this.resolveStatus(
        stockForRecommendation,
        predictedAmount,
        safetyStock,
        reorderPoint,
      );

      const signals: string[] = [];
      if (status === 'critical') {
        signals.push(
          'Predicted demand exceeds available stock beyond safety buffer',
        );
      } else if (status === 'watch') {
        signals.push(
          'Stock hovers near forecast demand, consider proactive replenishment',
        );
      }
      if (override) {
        signals.push('Stock level overridden by request payload');
      }

      return {
        sku: entry.sku,
        ingredient: ingredientName,
        unit,
        predictedAmount,
        currentStock,
        safetyStock,
        restockRecommendation:
          restockRecommendation > 0 ? restockRecommendation : null,
        daysCover,
        status,
        signals,
      };
    });

    const aggregate = items.reduce(
      (acc, item) => {
        acc.totalDemand += item.predictedAmount;
        if (item.restockRecommendation) {
          acc.expectedShortage += item.restockRecommendation;
        }
        if (item.status === 'critical') {
          acc.criticalCount += 1;
        }
        return acc;
      },
      { totalDemand: 0, expectedShortage: 0, criticalCount: 0 },
    );

    const evaluationTime = new Date();
    const factors = this.extractFactors(snapshot);
    const ruleHits = this.rulesRegistry.evaluateSalesForecast({
      storeId: store.id,
      evaluationTime,
      targetDate: snapshot.targetDate.toISOString(),
      generatedAt: snapshot.generatedAt,
      horizon: snapshot.horizon,
      summary: {
        totalDemand: aggregate.totalDemand,
        expectedShortage: aggregate.expectedShortage,
        criticalCount: aggregate.criticalCount,
        itemCount: items.length,
      },
      items: items.map((item) => ({
        sku: item.sku,
        status: item.status,
        restockRecommendation: item.restockRecommendation ?? null,
      })),
    });
    const signals = ruleHits.map((hit) => hit.summary);

    return {
      store: {
        id: store.id,
        code: store.code,
        name: store.name,
      },
      targetDate: snapshot.targetDate.toISOString(),
      generatedAt: snapshot.generatedAt.toISOString(),
      horizon: snapshot.horizon,
      modelVersion: snapshot.modelVersion,
      metrics: this.ensureObject(snapshot.metrics),
      items,
      summary: {
        totalDemand: this.round(aggregate.totalDemand, 1),
        expectedShortage: this.round(aggregate.expectedShortage, 1),
        criticalCount: aggregate.criticalCount,
      },
      factors,
      signals,
      rules: ruleHits,
    };
  }

  async getTrafficForecast(
    request: TrafficForecastRequestDto,
  ): Promise<TrafficForecastResponse> {
    const store = await this.storeResolver.resolve(request.storeId);
    const snapshot = await this.findSnapshot(store.id, request.targetDate);
    if (!snapshot) {
      throw new NotFoundException('Traffic forecast data not available');
    }

    const points = this.extractTraffic(snapshot);
    const averageCustomers =
      points.length === 0
        ? 0
        : this.round(
            points.reduce((total, point) => total + point.customers, 0) /
              points.length,
            1,
          );
    const evaluationTime = new Date();
    const ruleHits = this.rulesRegistry.evaluateTrafficForecast({
      storeId: store.id,
      evaluationTime,
      targetDate: snapshot.targetDate.toISOString(),
      generatedAt: snapshot.generatedAt,
      horizon: snapshot.horizon,
      points: points.map((point) => ({
        time: point.time,
        customers: point.customers,
        lower: point.lower ?? null,
        upper: point.upper ?? null,
      })),
    });
    const signals = ruleHits.map((hit) => hit.summary);

    return {
      storeId: store.id,
      targetDate: snapshot.targetDate.toISOString(),
      generatedAt: snapshot.generatedAt.toISOString(),
      horizon: snapshot.horizon,
      points,
      averageCustomers,
      signals,
      rules: ruleHits,
    };
  }

  async getMenuAdjustments(
    request: MenuAdjustmentRequestDto,
  ): Promise<MenuAdjustmentResponse> {
    const store = await this.storeResolver.resolve(request.storeId);
    const snapshot = await this.findSnapshot(store.id, request.targetDate);
    if (!snapshot) {
      throw new NotFoundException('Menu insights not available');
    }

    const ingredientForecast = this.extractIngredientForecast(snapshot);
    const inventoryItems = await this.prisma.inventoryItem.findMany({
      where: { storeId: store.id },
    });
    const inventoryBySku = new Map<string, (typeof inventoryItems)[number]>();
    for (const item of inventoryItems) {
      inventoryBySku.set(item.sku, item);
    }

    const baseItems = ingredientForecast.map((entry) => {
      const inventory = inventoryBySku.get(entry.sku);
      const override = (request.items ?? []).find(
        (item) => item.ingredient === inventory?.name,
      );

      const margin =
        override?.margin ??
        (inventory?.metadata as Record<string, unknown> | undefined)?.[
          'margin'
        ];
      const risk =
        override?.risk ??
        (inventory?.metadata as Record<string, unknown> | undefined)?.[
          'spoilageRisk'
        ];
      const stock =
        override?.stock ?? this.asNumber(inventory?.currentStock ?? null);

      const score =
        (margin ? Number(margin) : 0.5) -
        0.6 * (risk ? Number(risk) : 0.2) +
        Math.min(stock / 50, 0.4);

      return {
        sku: entry.sku,
        ingredient: inventory?.name ?? entry.sku,
        demand: entry.demand,
        margin: typeof margin === 'number' ? margin : null,
        risk: typeof risk === 'number' ? risk : null,
        stock,
        score,
      };
    });

    const sorted = baseItems.sort((a, b) => b.score - a.score);
    const promote = sorted.slice(0, 5).map((item) => ({
      ingredient: item.ingredient,
      reason: 'Strong margin-to-risk ratio with stable inventory headroom',
      restock:
        item.stock < item.demand
          ? this.round(item.demand - item.stock, 1)
          : null,
    }));

    const suppress = sorted
      .slice(-3)
      .map((item) => ({
        ingredient: item.ingredient,
        reason: 'Low score due to risk exposure or weak demand conversion',
      }))
      .reverse();

    const review = sorted
      .filter(
        (item) =>
          !promote.some((p) => p.ingredient === item.ingredient) &&
          !suppress.some((s) => s.ingredient === item.ingredient),
      )
      .slice(0, 5)
      .map((item) => ({
        ingredient: item.ingredient,
        reason:
          'Keep monitoring demand trend; adjust marketing copy or bundle strategy',
      }));

    const evaluationTime = new Date();
    const ruleHits = this.rulesRegistry.evaluateMenuAdjustments({
      storeId: store.id,
      evaluationTime,
      promote,
      review,
      suppress,
      scoredItems: sorted.map((item) => ({
        ingredient: item.ingredient,
        demand: item.demand,
        stock: item.stock,
        score: item.score,
      })),
    });
    const signals = ruleHits.map((hit) => hit.summary);

    return {
      promote,
      review,
      suppress,
      signals,
      rules: ruleHits,
    };
  }

  evaluateAccuracy(payload: EvaluateForecastDto) {
    const { actual, predicted } = payload;
    if (!actual.length || actual.length !== predicted.length) {
      return {
        mape: null,
        rmse: null,
        coverageP50: null,
        n: 0,
      };
    }
    const n = actual.length;
    const mape =
      (actual.reduce(
        (sum, value, index) =>
          sum + Math.abs((value - predicted[index]) / (value || 1)),
        0,
      ) /
        n) *
      100;
    const rmse = Math.sqrt(
      actual.reduce(
        (sum, value, index) => sum + Math.pow(value - predicted[index], 2),
        0,
      ) / n,
    );
    const coverageP50 =
      predicted.filter((value, index) => {
        const lower = actual[index] * 0.9;
        const upper = actual[index] * 1.1;
        return lower <= value && value <= upper;
      }).length / n;

    return {
      mape: this.round(mape, 2),
      rmse: this.round(rmse, 2),
      coverageP50: this.round(coverageP50 * 100, 2),
      n,
    };
  }

  private async findSnapshot(storeId: string, targetDate?: string) {
    let candidate: PredictionSnapshotEntity | null = null;
    if (targetDate) {
      const target = new Date(targetDate);
      if (!Number.isNaN(target.getTime())) {
        candidate = await this.prisma.predictionSnapshot.findFirst({
          where: { storeId, targetDate: target },
          orderBy: { generatedAt: 'desc' },
        });
      }
    }
    if (!candidate) {
      candidate = await this.prisma.predictionSnapshot.findFirst({
        where: { storeId },
        orderBy: [{ targetDate: 'desc' }, { generatedAt: 'desc' }],
      });
    }
    return candidate;
  }

  private extractIngredientForecast(
    snapshot: PredictionSnapshotEntity,
  ): IngredientForecastEntry[] {
    const payload = this.ensureObject(snapshot.payload);
    const list: unknown[] = Array.isArray(payload?.ingredientForecast)
      ? (payload.ingredientForecast as unknown[])
      : [];
    const entries: IngredientForecastEntry[] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const record = raw as Record<string, unknown>;
      const sku = this.ensureString(record['sku']);
      const demand = this.ensureNumber(record['demand']);
      if (!sku || demand === null) continue;
      entries.push({
        sku,
        demand,
        unit: this.ensureString(record['unit']) ?? undefined,
        ingredient: this.ensureString(record['ingredient']) ?? undefined,
      });
    }
    return entries;
  }

  private extractTraffic(snapshot: PredictionSnapshotEntity): TrafficPoint[] {
    const payload = this.ensureObject(snapshot.payload);
    const list: unknown[] = Array.isArray(payload?.trafficForecast)
      ? (payload.trafficForecast as unknown[])
      : [];
    const points: TrafficPoint[] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const record = raw as Record<string, unknown>;
      const time =
        this.ensureString(record['hour']) ?? this.ensureString(record['time']);
      const customers = this.ensureNumber(record['customers']);
      if (!time || customers === null) continue;
      const lower = this.ensureNumber(record['lower']);
      const upper = this.ensureNumber(record['upper']);
      points.push({
        time,
        customers: this.round(customers, 0),
        lower: lower ?? undefined,
        upper: upper ?? undefined,
      });
    }
    return points;
  }

  private extractFactors(
    snapshot: PredictionSnapshotEntity,
  ): ForecastFactor | null {
    const payload = this.ensureObject(snapshot.payload);
    const factors = this.ensureObject(payload?.factors);
    return factors ?? null;
  }

  private ensureObject(value: unknown): Record<string, any> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, any>;
  }

  private ensureString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  private ensureNumber(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private asNumber(value: Decimal | number | string | null) {
    if (value === null || value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return Number.parseFloat(value.toString());
  }

  private round(value: number, precision = 2) {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
  }

  private resolveStatus(
    currentStock: number,
    predictedAmount: number,
    safetyStock: number,
    reorderPoint: number,
  ): 'healthy' | 'watch' | 'critical' {
    const safetyThreshold = Math.max(safetyStock, reorderPoint);
    if (currentStock <= predictedAmount * 0.8) {
      return 'critical';
    }
    if (currentStock <= safetyThreshold + predictedAmount * 0.2) {
      return 'watch';
    }
    return 'healthy';
  }
}
