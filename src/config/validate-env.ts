type EnvShape = Record<string, string | undefined>;

const FIXTURE_DATABASE_URL = 'fixture://local';

export function validateEnv(config: EnvShape) {
  const normalized: EnvShape = { ...config };
  if (!normalized.DATABASE_URL) {
    const runtimeEnv =
      normalized.APP_ENV ??
      normalized.NODE_ENV ??
      process.env.APP_ENV ??
      process.env.NODE_ENV ??
      'development';
    const isProduction = runtimeEnv === 'production';
    if (isProduction) {
      throw new Error('Missing required environment variables: DATABASE_URL');
    }
    normalized.DATABASE_URL = FIXTURE_DATABASE_URL;
  }
  process.env.DATABASE_URL = normalized.DATABASE_URL;

  const portCandidate = normalized.APP_PORT ?? normalized.PORT;
  if (portCandidate) {
    const parsed = Number.parseInt(portCandidate, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(
        `APP_PORT/PORT must be a positive integer, received "${portCandidate}"`,
      );
    }
  }

  return normalized;
}
