import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.ts';
import {
  requireRuntimeDatabaseUrl,
} from './env.ts';

function createDatabaseState() {
  const client =
    postgres(
      requireRuntimeDatabaseUrl(),
    );

  const database =
    drizzle(
      client,
      {
        schema,
      },
    );

  return {
    client,
    database,
  };
}

type DatabaseState =
  ReturnType<
    typeof createDatabaseState
  >;

let databaseState:
  | DatabaseState
  | undefined;

function getDatabaseState() {
  databaseState ??=
    createDatabaseState();

  return databaseState;
}

export function getDatabase() {
  return getDatabaseState().database;
}

export async function closeDatabase() {
  if (!databaseState) {
    return;
  }

  const currentState =
    databaseState;

  databaseState =
    undefined;

  await currentState.client.end();
}


export async function withDatabaseTransaction<T>(
  callback: (
    transaction: Parameters<
      Parameters<
        ReturnType<
          typeof getDatabase
        >["transaction"]
      >[0]
    >[0],
  ) => Promise<T>,
) {
  const database =
    getDatabase();

  return database.transaction(
    callback,
  );
}
