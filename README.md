# Diet System 

!<svg xmlns="http://www.w3.org/2000/svg" width="82" height="20" role="img" aria-label="License: MIT"><title>License: MIT</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="82" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="51" height="20" fill="#555"/><rect x="51" width="31" height="20" fill="#dfb317"/><rect width="82" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110"><text aria-hidden="true" x="265" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="410">License</text><text x="265" y="140" transform="scale(.1)" fill="#fff" textLength="410">License</text><text aria-hidden="true" x="655" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="210">MIT</text><text x="655" y="140" transform="scale(.1)" fill="#fff" textLength="210">MIT</text></g></svg>[Uploading 1772625153584.svg…]()


This service powers the Stage 3 rollout of the Diet System restaurant platform. It is built with NestJS and Prisma to support forecasting, inventory, marketing, cost monitoring, and decision workflows for multi-store operations.

## Tech Stack

- NestJS 11 with TypeScript 5
- Prisma ORM targeting PostgreSQL
- Pino structured logging (`nestjs-pino`)
- Jest + Supertest for tests (to be expanded in later sprints)

## Getting Started

1. Copy the environment template and update the values that make sense for your setup.
   ```bash
   cp .env.example .env
   ```
2. Export a `DATABASE_URL` that points to a PostgreSQL database (or edit `.env`). The default template expects a database named `diet_system`.
3. Install dependencies and generate the Prisma client.
   ```bash
   npm install
   npm run prisma:generate
   ```
4. Apply migrations (once the database is reachable).
   ```bash
   npm run prisma:migrate
   ```
5. Seed demo data that matches the product IA.
   ```bash
   npm run prisma:seed
   ```
6. Start the API.
   ```bash
   npm run start:dev
   ```

## Environment Variables

| Key              | Description                                                                 | Default in template                     |
| ---------------- | --------------------------------------------------------------------------- | --------------------------------------- |
| `APP_NAME`       | Identifier used in structured logs                                          | `diet-backend`                          |
| `APP_PORT`       | HTTP port served by Nest                                                    | `3002`                                  |
| `NODE_ENV`       | Runtime environment (`development`, `production`, `test`)                   | `development`                           |
| `LOG_LEVEL`      | Pino log level (`debug`, `info`, `warn`, `error`, `trace`)                  | `debug`                                 |
| `CORS_ORIGINS`   | Comma separated list of allowed origins. Empty → allow all (for local dev). | `http://localhost:5173`                 |
| `DATABASE_URL`   | PostgreSQL connection string (Prisma datasource).                           | `postgresql://diet_admin:changeMe@…`    |
| `PRISMA_LOG_LEVEL` | Prisma client log level (`warn`, `error`, `info`, `query`, `trace`).        | `warn`                                  |

During CI the same `.env` file is consumed; keep secrets out of version control.

## Database Workflow

- `npm run prisma:format` – format the Prisma schema
- `npm run prisma:migrate` – run interactive development migrations
- `npm run prisma:deploy` – apply existing migrations in non-interactive environments
- `npm run prisma:seed` – execute `prisma/seed.ts` and populate demo data for stores, inventory, forecasts, marketing campaigns, staff schedules, alerts, cost, and decisions

A canonical schema lives at `prisma/schema.prisma`. The seed script intentionally upserts by stable IDs so it is safe to re-run when data drifts during exploration.

## Runtime Conventions

- Responses are automatically wrapped to `{ data, meta, error }` by `AppResponseInterceptor`.
- Errors are normalized and logged through `AllExceptionsFilter` with structured Pino logs. Sensitive headers (e.g., Authorization, Cookie) are redacted automatically.
- Prisma connections are managed via a global `PrismaService`; shutdown hooks ensure graceful exit on process signals.

## Project Scripts

| Script                | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `npm run start`       | Start server (default configuration)                |
| `npm run start:dev`   | Live reload server for development                  |
| `npm run start:prod`  | Run the compiled output from `dist/`                |
| `npm run build`       | Compile TypeScript                                  |
| `npm run lint`        | Lint and auto-fix issues                            |
| `npm run test`        | Execute unit tests                                  |
| `npm run prisma:*`    | Database helpers described in the section above     |

## Directory Highlights

- `src/config` – Environment configuration loaders and validation helpers
- `src/common` – Cross-cutting interceptors and filters
- `src/prisma` – PrismaModule and typed PrismaService
- `prisma/schema.prisma` – Database models for stores, inventory, predictions, marketing, scheduling, alerts, costs, and decisions
- `prisma/seed.ts` – Domain-aware demo data seeded per store

## Next Sprint Hooks

The Stage 3 sprint plan continues with:

1. Implementing `/predictions/*`, `/inventory/*`, `/marketing/*`, `/cost/*`, `/decisions/*` against Prisma models.
2. Adding DTOs with `class-validator` plus OpenAPI docs.
3. Building contract tests (Jest + Supertest) and schema validation scaffolds.

Use the updated seed data as the reference truth when aligning with the front-end and MSW fixtures.
