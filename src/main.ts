import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppResponseInterceptor } from './common/interceptors/app-response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const httpAdapterHost = app.get(HttpAdapterHost);
  const prismaService = app.get(PrismaService);
  prismaService.enableShutdownHooks(app);

  app.useGlobalInterceptors(new AppResponseInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost, logger));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const configuredOrigins =
    configService.get<string[]>('app.corsOrigins', []) ?? [];
  const fallbackOrigins =
    configService.get<string[]>('app.defaultCorsOrigins', []) ?? [];
  const origins =
    configuredOrigins.length > 0 ? configuredOrigins : fallbackOrigins;
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
  });

  const port = configService.get<number>('app.port', 3002);
  await app.listen(port);
  logger.log(`diet backend listening at :${port}`);
}
void bootstrap();
