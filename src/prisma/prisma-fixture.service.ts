import { INestApplication, Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { buildAppFixtures } from '../fixtures/app-fixtures';

type OrderDirection = 'asc' | 'desc';

function sortByDate<T>(items: T[], key: keyof T, direction: OrderDirection) {
  return [...items].sort((a, b) => {
    const left = (a[key] as unknown as Date)?.getTime?.() ?? 0;
    const right = (b[key] as unknown as Date)?.getTime?.() ?? 0;
    return direction === 'asc' ? left - right : right - left;
  });
}

function sortByKey<T>(items: T[], key: keyof T, direction: OrderDirection) {
  return [...items].sort((a, b) => {
    const left = (a[key] as unknown as string) ?? '';
    const right = (b[key] as unknown as string) ?? '';
    if (left === right) return 0;
    return direction === 'asc'
      ? left < right
        ? -1
        : 1
      : left > right
        ? -1
        : 1;
  });
}

@Injectable()
export class PrismaFixtureService {
  private readonly fixtures = buildAppFixtures();

  readonly inventoryItem = {
    findMany: async (args?: {
      where?: { storeId?: string };
      orderBy?: { name?: OrderDirection };
    }) => {
      const storeId = args?.where?.storeId;
      let items = this.fixtures.inventoryItems.filter((item) =>
        storeId ? item.storeId === storeId : true,
      );
      if (args?.orderBy?.name) {
        items = sortByKey(items, 'name', args.orderBy.name);
      }
      return items.map((item) => ({ ...item }));
    },
  };

  readonly predictionSnapshot = {
    findFirst: async (args?: {
      where?: { storeId?: string; targetDate?: Date };
      orderBy?: { targetDate?: OrderDirection; generatedAt?: OrderDirection };
    }) => {
      const storeId = args?.where?.storeId;
      const targetDate = args?.where?.targetDate;
      let snapshots = [this.fixtures.predictionSnapshot];
      if (storeId) {
        snapshots = snapshots.filter(
          (snapshot) => snapshot.storeId === storeId,
        );
      }
      if (targetDate) {
        snapshots = snapshots.filter(
          (snapshot) => snapshot.targetDate.getTime() === targetDate.getTime(),
        );
      }
      if (args?.orderBy?.targetDate) {
        snapshots = sortByDate(
          snapshots,
          'targetDate',
          args.orderBy.targetDate,
        );
      }
      if (args?.orderBy?.generatedAt) {
        snapshots = sortByDate(
          snapshots,
          'generatedAt',
          args.orderBy.generatedAt,
        );
      }
      const [match] = snapshots;
      return match ? { ...match } : null;
    },
  };

  readonly marketingCampaign = {
    findMany: async (args?: {
      where?: { storeId?: string; status?: $Enums.CampaignStatus | undefined };
      orderBy?: Array<{
        startDate?: OrderDirection;
        updatedAt?: OrderDirection;
      }>;
    }) => {
      const storeId = args?.where?.storeId;
      const status = args?.where?.status;
      let campaigns = this.fixtures.marketingCampaigns.filter((campaign) =>
        storeId ? campaign.storeId === storeId : true,
      );
      if (status) {
        campaigns = campaigns.filter((campaign) => campaign.status === status);
      }
      const firstOrder = args?.orderBy?.[0];
      if (firstOrder?.startDate) {
        campaigns = sortByDate(campaigns, 'startDate', firstOrder.startDate);
      }
      if (firstOrder?.updatedAt) {
        campaigns = sortByDate(campaigns, 'updatedAt', firstOrder.updatedAt);
      }
      return campaigns.map((campaign) => ({ ...campaign }));
    },
  };

  readonly costSnapshot = {
    findMany: async (args?: { where?: { storeId?: string } }) => {
      const storeId = args?.where?.storeId;
      const items = this.fixtures.costSnapshots.filter((item) =>
        storeId ? item.storeId === storeId : true,
      );
      return items.map((item) => ({ ...item }));
    },
  };

  readonly decisionSnapshot = {
    findMany: async (args?: {
      where?: { storeId?: string; status?: string };
      orderBy?: { createdAt?: OrderDirection };
      take?: number;
    }) => {
      const storeId = args?.where?.storeId;
      const status = args?.where?.status;
      let items = this.fixtures.decisionSnapshots.filter((item) =>
        storeId ? item.storeId === storeId : true,
      );
      if (status) {
        items = items.filter((item) => item.status === status);
      }
      if (args?.orderBy?.createdAt) {
        items = sortByDate(items, 'createdAt', args.orderBy.createdAt);
      }
      if (args?.take && args.take > 0) {
        items = items.slice(0, args.take);
      }
      return items.map((item) => ({ ...item }));
    },
  };

  readonly store = {
    findFirst: async (args?: {
      where?: {
        isActive?: boolean;
        OR?: Array<{ id?: string; code?: string }>;
      };
      orderBy?: { createdAt?: OrderDirection };
    }) => {
      const { store } = this.fixtures;
      const where = args?.where;
      if (where?.isActive === false) {
        return null;
      }
      if (where?.OR?.length) {
        const target = where.OR.find(
          (entry) =>
            (entry.id && entry.id === store.id) ||
            (entry.code && entry.code === store.code),
        );
        return target ? { ...store } : null;
      }
      return { ...store };
    },
  };

  async onModuleInit() {
    return;
  }

  async onModuleDestroy() {
    return;
  }

  async $connect() {
    return;
  }

  async $disconnect() {
    return;
  }

  enableShutdownHooks(_app?: INestApplication): void {
    return;
  }
}
