import {
  sql,
} from 'drizzle-orm';

import {
  drizzle,
} from 'drizzle-orm/postgres-js';

import postgres from 'postgres';

import {
  admins,
} from '../src/server/db/schema.ts';

import {
  hashPassword,
} from '../src/server/auth/password.ts';

import {
  canonicalizeAdminEmail,
  isAdminEmailInputValid,
  isAdminPasswordInputValid,
} from '../src/server/auth/service-foundation.ts';

function requireDatabaseUrl(
  name,
) {
  const value =
    process.env[
      name
    ]?.trim();

  if (!value) {
    throw new Error(
      `${name} is required for Admin bootstrap.`,
    );
  }

  return value;
}

async function verifyBootstrapDatabaseBoundary(
  migrationClient,
  runtimeClient,
) {
  const [
    migrationRows,
    runtimeRows,
  ] =
    await Promise.all([
      migrationClient`
        select
          current_database()
            as database_name,
          current_user
            as role_name
      `,
      runtimeClient`
        select
          current_database()
            as database_name,
          current_user
            as role_name
      `,
    ]);

  const migrationInfo =
    migrationRows[0];

  const runtimeInfo =
    runtimeRows[0];

  if (
    !migrationInfo ||
    !runtimeInfo
  ) {
    throw new Error(
      'Unable to verify Admin bootstrap database boundary.',
    );
  }

  if (
    migrationInfo.database_name !==
    runtimeInfo.database_name
  ) {
    throw new Error(
      'Admin bootstrap migration and runtime credentials target different databases.',
    );
  }

  if (
    migrationInfo.role_name ===
    runtimeInfo.role_name
  ) {
    throw new Error(
      'Admin bootstrap requires separate migration and runtime database roles.',
    );
  }
}

export async function createFirstAdmin({
  email: emailInput,
  password,
}) {
  if (
    !isAdminEmailInputValid(
      emailInput,
    )
  ) {
    return {
      ok: false,
      reason:
        'invalid_email',
    };
  }

  if (
    !isAdminPasswordInputValid(
      password,
    )
  ) {
    return {
      ok: false,
      reason:
        'invalid_password',
    };
  }

  const email =
    canonicalizeAdminEmail(
      emailInput,
    );

  const migrationUrl =
    requireDatabaseUrl(
      'DATABASE_MIGRATION_URL',
    );

  const runtimeUrl =
    requireDatabaseUrl(
      'DATABASE_URL',
    );

  if (
    migrationUrl ===
    runtimeUrl
  ) {
    throw new Error(
      'DATABASE_MIGRATION_URL must not equal DATABASE_URL.',
    );
  }

  const migrationClient =
    postgres(
      migrationUrl,
      {
        max: 1,
        prepare: false,
      },
    );

  const runtimeClient =
    postgres(
      runtimeUrl,
      {
        max: 1,
        prepare: false,
      },
    );

  try {
    await verifyBootstrapDatabaseBoundary(
      migrationClient,
      runtimeClient,
    );

    const database =
      drizzle(
        migrationClient,
      );

    return await database.transaction(
      async (tx) => {
        /*
         * The table can be empty, so there is no row
         * available to lock. The privileged operational
         * credential owns the table and takes a writer-
         * conflicting table lock before checking whether
         * the first Admin already exists.
         */
        await tx.execute(
          sql`
            lock table "admins"
            in share row exclusive mode
          `,
        );

        const existingAdmins =
          await tx
            .select({
              id:
                admins.id,
            })
            .from(
              admins,
            )
            .limit(1);

        if (
          existingAdmins.length !==
          0
        ) {
          return {
            ok: false,
            reason:
              'admin_exists',
          };
        }

        const passwordHash =
          await hashPassword(
            password,
          );

        const createdAdmins =
          await tx
            .insert(
              admins,
            )
            .values({
              email,
              passwordHash,
              isActive:
                true,
            })
            .returning({
              id:
                admins.id,
              email:
                admins.email,
            });

        const createdAdmin =
          createdAdmins[0];

        if (
          createdAdmins.length !==
            1 ||
          !createdAdmin
        ) {
          throw new Error(
            'First Admin bootstrap did not create exactly one Admin.',
          );
        }

        return {
          ok: true,
          admin: {
            id:
              createdAdmin.id,
            email:
              createdAdmin.email,
          },
        };
      },
    );
  } finally {
    await Promise.all([
      migrationClient.end(),
      runtimeClient.end(),
    ]);
  }
}
