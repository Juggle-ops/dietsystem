import { Global, Module } from '@nestjs/common';
import { PrismaService as DatabasePrismaService } from './prisma.service';
import { PrismaFixtureService } from './prisma-fixture.service';
import { StoreResolverService } from './store-resolver.service';

const databaseUrl = process.env.DATABASE_URL;
const useFixtures =
  !databaseUrl ||
  databaseUrl.startsWith('fixture://') ||
  databaseUrl.startsWith('stub://');

@Global()
@Module({
  providers: [
    {
      provide: DatabasePrismaService,
      useClass: useFixtures ? PrismaFixtureService : DatabasePrismaService,
    },
    StoreResolverService,
  ],
  exports: [DatabasePrismaService, StoreResolverService],
})
export class PrismaModule {}
