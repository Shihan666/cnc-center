const runtimeDatabaseUrlName =
  'DATABASE_URL';

export function requireRuntimeDatabaseUrl() {
  const databaseUrl =
    process.env[
      runtimeDatabaseUrlName
    ]?.trim();

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required for the application runtime.',
    );
  }

  return databaseUrl;
}
