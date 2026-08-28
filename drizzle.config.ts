import {
  existsSync,
} from 'node:fs';
import {
  resolve,
} from 'node:path';
import {
  loadEnvFile,
} from 'node:process';

import {
  defineConfig,
} from 'drizzle-kit';

const migrationDatabaseUrlName =
  'DATABASE_MIGRATION_URL';

if (
  !process.env[
    migrationDatabaseUrlName
  ]
) {
  const localEnvironmentPath =
    resolve(
      process.cwd(),
      '.env.local',
    );

  if (
    existsSync(
      localEnvironmentPath,
    )
  ) {
    loadEnvFile(
      localEnvironmentPath,
    );
  }
}

const migrationDatabaseUrl =
  process.env[
    migrationDatabaseUrlName
  ]?.trim();

if (!migrationDatabaseUrl) {
  throw new Error(
    'DATABASE_MIGRATION_URL is required for Drizzle Kit.',
  );
}

export default defineConfig({
  dialect: 'postgresql',

  schema:
    './src/server/db/schema.ts',

  out:
    './drizzle',

  schemaFilter: [
    'public',
  ],

  dbCredentials: {
    url: migrationDatabaseUrl,
  },

  strict: true,
  verbose: true,
});
