import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RulesRegistryService } from '../rules/rules-registry.service';
import { RuleHit } from '../rules/rule.types';
import { StoreResolverService } from '../prisma/store-resolver.service';

type InventoryItemEntity = NonNullable<
  Awaited<ReturnType<PrismaClient['inventoryItem']['findFirst']>>
>;

export type InventoryItemView = {
  id: string;
  sku: string;
  name: string;
  nameEn?: string | null;
  unit: string;
  category?: string | null;
  currentStock: number;
  reorderPoint: number;
  safetyStock: number;
  daysCover?: number | null;
  restockAmount?: number | null;
  status: 'critical' | 'low' | 'normal';
  supplier?: string | null;
  lastDeliveryAt?: string | null;
  updatedAt: string;
  metadata?: Record<string, unknown> | null;
};

export type InventoryOverview = {
  store: {
    id: string;
    code: string;
    name: string;
    timezone: string;
  };
  items: InventoryItemView[];
  summary: {
    totalSkus: number;
    criticalSkus: number;
    lowStockSkus: number;
    healthySkus: number;
    recommendedRestockUnits: number;
  };
  forecastReference: {
    targetDate: string;
    modelVersion?: string | null;
  } | null;
  signals: string[];
  rules: RuleHit[];
};

type ForecastInsight = {
  sku: string;
  demand: number;
  unit?: string;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeResolver: StoreResolverService,
    private readonly rulesRegistry: RulesRegistryService,
  ) {}

  async getOverview(query: InventoryQueryDto): Promise<InventoryOverview> {
    const store = await this.storeResolver.resolve(query.storeId);

    const [items, latestSnapshot] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { storeId: store.id },
        orderBy: { name: 'asc' },
      }),
      this.prisma.predictionSnapshot.findFirst({
        where: { storeId: store.id },
        orderBy: { targetDate: 'desc' },
      }),
    ]);

    const forecastMap = this.extractForecast(latestSnapshot?.payload ?? null);
    const enrichedItems = items
      .map((item: InventoryItemEntity) =>
        this.composeItemView(item, forecastMap),
      )
      .filter((item: InventoryItemView) =>
        query.criticalOnly ? item.status !== 'normal' : true,
      );

    const summary = this.buildSummary(enrichedItems);

    const evaluationTime = latestSnapshot?.generatedAt ?? new Date();
    const ruleHits = this.rulesRegistry.evaluateInventoryOverview({
      storeId: store.id,
      evaluationTime,
      summary,
      items: enrichedItems.map((item) => ({
        id: item.id,
        sku: item.sku,
        status: item.status,
        currentStock: item.currentStock,
        reorderPoint: item.reorderPoint,
        safetyStock: item.safetyStock,
        restockAmount: item.restockAmount ?? null,
        daysCover: item.daysCover ?? null,
      })),
      forecastReference: latestSnapshot
        ? {
            targetDate: latestSnapshot.targetDate.toISOString(),
            modelVersion: latestSnapshot.modelVersion,
          }
        : null,
    });
    const signals = ruleHits.map((hit) => hit.summary);

    return {
      store: {
        id: store.id,
        code: store.code,
        name: store.name,
        timezone: store.timezone,
      },
      items: enrichedItems,
      summary,
      forecastReference: latestSnapshot
        ? {
            targetDate: latestSnapshot.targetDate.toISOString(),
            modelVersion: latestSnapshot.modelVersion,
          }
        : null,
      signals,
      rules: ruleHits,
    };
  }

  private buildSummary(items: InventoryItemView[]) {
    return items.reduce<InventoryOverview['summary']>(
      (acc, item) => {
        acc.totalSkus += 1;
        if (item.status === 'critical') {
          acc.criticalSkus += 1;
        } else if (item.status === 'low') {
          acc.lowStockSkus += 1;
        } else {
          acc.healthySkus += 1;
        }
        if (item.restockAmount) {
          acc.recommendedRestockUnits += item.restockAmount;
        }
        return acc;
      },
      {
        totalSkus: 0,
        criticalSkus: 0,
        lowStockSkus: 0,
        healthySkus: 0,
        recommendedRestockUnits: 0,
      },
    );
  }

  private composeItemView(
    item: InventoryItemEntity,
    forecastMap: Map<string, ForecastInsight>,
  ): InventoryItemView {
    const demand = forecastMap.get(item.sku)?.demand ?? 0;
    const currentStock = this.asNumber(item.currentStock);
    const reorderPoint = this.asNumber(item.reorderPoint);
    const safetyStock = this.asNumber(item.safetyStock);
    const coverageDays =
      demand > 0 ? Number((currentStock / demand).toFixed(1)) : null;
    const restockAmount =
      demand > currentStock ? Number((demand - currentStock).toFixed(1)) : null;
    const status = this.deriveStatus(currentStock, reorderPoint, safetyStock);

    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      nameEn: item.nameEn,
      unit: item.unit,
      category: item.category,
      currentStock,
      reorderPoint,
      safetyStock,
      daysCover: coverageDays,
      restockAmount,
      status,
      supplier: item.supplier,
      lastDeliveryAt: item.lastDeliveryAt
        ? item.lastDeliveryAt.toISOString()
        : null,
      updatedAt: item.updatedAt.toISOString(),
      metadata: item.metadata as Record<string, unknown> | null,
    };
  }

  private deriveStatus(
    current: number,
    reorderPoint: number,
    safetyStock: number,
  ) {
    if (current <= Math.min(reorderPoint * 0.6, safetyStock * 0.8)) {
      return 'critical';
    }
    if (current <= Math.max(reorderPoint, safetyStock)) {
      return 'low';
    }
    return 'normal';
  }

  private extractForecast(payload: unknown) {
    const forecastMap = new Map<string, ForecastInsight>();
    if (!payload || typeof payload !== 'object') {
      return forecastMap;
    }

    const ingredientForecast = (payload as Record<string, unknown>)?.[
      'ingredientForecast'
    ];
    if (Array.isArray(ingredientForecast)) {
      for (const entry of ingredientForecast) {
        if (!entry || typeof entry !== 'object') continue;
        const sku = (entry as Record<string, unknown>)['sku'];
        const demand = (entry as Record<string, unknown>)['demand'];
        const unit = (entry as Record<string, unknown>)['unit'];
        if (typeof sku === 'string' && typeof demand === 'number') {
          forecastMap.set(sku, {
            sku,
            demand,
            unit: typeof unit === 'string' ? unit : undefined,
          });
        }
      }
    }
    return forecastMap;
  }

  private asNumber(value: Decimal | number | string | null) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number.parseFloat(value);
    return Number.parseFloat(value.toString());
  }
}
