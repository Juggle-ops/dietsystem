import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  const name = process.env.APP_NAME ?? 'diet-backend';
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const portSource = process.env.APP_PORT ?? process.env.PORT ?? '3002';
  const port = Number.parseInt(portSource, 10);

  if (Number.isNaN(port)) {
    throw new Error(`Invalid APP_PORT/PORT value: ${portSource}`);
  }

  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const demoAuthToken = process.env.DEMO_AUTH_TOKEN ?? '';

  return {
    name,
    env: nodeEnv,
    port,
    logLevel:
      process.env.LOG_LEVEL ?? (nodeEnv === 'production' ? 'info' : 'debug'),
    corsOrigins,
    defaultCorsOrigins:
      nodeEnv === 'production'
        ? []
        : [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173',
          ],
    demoAuthToken,
  };
});
