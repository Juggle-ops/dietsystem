import { registerAs } from '@nestjs/config';

const DEFAULT_FIXTURE_URL = 'fixture://local';

export default registerAs('database', () => {
  const url = process.env.DATABASE_URL ?? DEFAULT_FIXTURE_URL;
  return {
    url,
    logLevel: process.env.PRISMA_LOG_LEVEL ?? 'warn',
  };
});
