import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { appConfig, databaseConfig, validateEnv } from './config';
import { InventoryModule } from './inventory/inventory.module';
import { PredictionsModule } from './predictions/predictions.module';
import { OrdersModule } from './orders/orders.module';
import { DecisionsModule } from './decisions/decisions.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { MarketingModule } from './marketing/marketing.module';
import { CostModule } from './cost/cost.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      expandVariables: true,
      load: [appConfig, databaseConfig],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const env = config.get<string>('app.env', 'development');
        const logLevel = config.get<string>(
          'app.logLevel',
          env === 'production' ? 'info' : 'debug',
        );
        const usePretty = env !== 'production';
        return {
          pinoHttp: {
            level: logLevel,
            transport: usePretty
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
                    singleLine: true,
                  },
                }
              : undefined,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["x-demo-auth"]',
                'req.headers["x-store-id"]',
                'req.body.password',
                'req.body.token',
                'req.body.authToken',
                'res.body.token',
              ],
              remove: true,
            },
            autoLogging: {
              ignore(req) {
                return req.url?.includes('health') ?? false;
              },
            },
          },
        };
      },
    }),
    PrismaModule,
    InventoryModule,
    PredictionsModule,
    OrdersModule,
    DecisionsModule,
    SchedulingModule,
    MarketingModule,
    CostModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
