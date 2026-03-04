import {
  INestApplication,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly configService: ConfigService) {
    const databaseUrl = configService.getOrThrow<string>('database.url');
    const logLevel = configService.get<string>('database.logLevel', 'warn');
    super({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      log:
        logLevel === 'trace'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  enableShutdownHooks(app: INestApplication) {
    const listener = async () => {
      await this.$disconnect();
      await app.close();
    };

    process.once('beforeExit', listener);
  }
}
