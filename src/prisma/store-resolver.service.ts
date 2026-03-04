import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from './prisma.service';

type StoreEntity = NonNullable<
  Awaited<ReturnType<PrismaClient['store']['findFirst']>>
>;

@Injectable()
export class StoreResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(storeId?: string): Promise<StoreEntity> {
    if (!storeId) {
      const store = await this.prisma.store.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!store) {
        throw new NotFoundException('No active store configured');
      }
      return store;
    }

    const store = await this.prisma.store.findFirst({
      where: {
        OR: [{ id: storeId }, { code: storeId }],
      },
    });

    if (!store) {
      throw new NotFoundException(`Store ${storeId} not found`);
    }

    return store;
  }
}
