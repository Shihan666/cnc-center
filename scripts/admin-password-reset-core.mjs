import {
  and,
  eq,
  isNull,
} from 'drizzle-orm';

import {
  drizzle,
} from 'drizzle-orm/postgres-js';

import postgres from 'postgres';

import {
  adminLoginChallenges,
  adminSessions,
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
      `${name} is required for Admin password reset.`,
    );
  }

  return value;
}

async function verifyPasswordResetDatabaseBoundary(
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
      'Unable to verify Admin password-reset database boundary.',
    );
  }

  if (
    migrationInfo.database_name !==
    runtimeInfo.database_name
  ) {
    throw new Error(
      'Admin password-reset migration and runtime credentials target different databases.',
    );
  }

  if (
    migrationInfo.role_name ===
    runtimeInfo.role_name
  ) {
    throw new Error(
      'Admin password reset requires separate migration and runtime database roles.',
    );
  }
}

export async function resetAdminPassword({
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

  /*
   * Hash before taking the Admin row lock so the privileged
   * transaction remains short. No database mutation has
   * occurred at this point.
   */
  const passwordHash =
    await hashPassword(
      password,
    );

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
    await verifyPasswordResetDatabaseBoundary(
      migrationClient,
      runtimeClient,
    );

    const database =
      drizzle(
        migrationClient,
      );

    return await database.transaction(
      async (tx) => {
        const matchingAdmins =
          await tx
            .select({
              id:
                admins.id,

              email:
                admins.email,

              isActive:
                admins.isActive,
            })
            .from(
              admins,
            )
            .where(
              eq(
                admins.email,
                email,
              ),
            )
            .for(
              'update',
            )
            .limit(2);

        if (
          matchingAdmins.length ===
          0
        ) {
          return {
            ok: false,
            reason:
              'admin_not_found',
          };
        }

        if (
          matchingAdmins.length !==
          1
        ) {
          throw new Error(
            'Admin password reset found a non-unique canonical email.',
          );
        }

        const admin =
          matchingAdmins[0];

        if (!admin) {
          throw new Error(
            'Admin password reset lost its locked Admin row.',
          );
        }

        if (
          admin.isActive !==
          true
        ) {
          return {
            ok: false,
            reason:
              'admin_inactive',
          };
        }

        const changedAt =
          new Date();

        const updatedAdmins =
          await tx
            .update(
              admins,
            )
            .set({
              passwordHash,

              passwordChangedAt:
                changedAt,

              updatedAt:
                changedAt,
            })
            .where(
              and(
                eq(
                  admins.id,
                  admin.id,
                ),

                eq(
                  admins.isActive,
                  true,
                ),
              ),
            )
            .returning({
              id:
                admins.id,

              email:
                admins.email,
            });

        if (
          updatedAdmins.length !==
          1
        ) {
          throw new Error(
            'Admin password reset lost its locked active Admin state.',
          );
        }

        const revokedSessions =
          await tx
            .update(
              adminSessions,
            )
            .set({
              revokedAt:
                changedAt,

              revocationReason:
                'password_changed',
            })
            .where(
              and(
                eq(
                  adminSessions.adminId,
                  admin.id,
                ),

                isNull(
                  adminSessions.revokedAt,
                ),

                isNull(
                  adminSessions.revocationReason,
                ),
              ),
            )
            .returning({
              id:
                adminSessions.id,
            });

        /*
         * A password reset must also kill any first-factor
         * challenge created using the previous credential.
         * MFA factors/recovery codes themselves are preserved.
         */
        const invalidatedChallenges =
          await tx
            .update(
              adminLoginChallenges,
            )
            .set({
              invalidatedAt:
                changedAt,
            })
            .where(
              and(
                eq(
                  adminLoginChallenges.adminId,
                  admin.id,
                ),

                isNull(
                  adminLoginChallenges.consumedAt,
                ),

                isNull(
                  adminLoginChallenges.invalidatedAt,
                ),
              ),
            )
            .returning({
              id:
                adminLoginChallenges.id,
            });

        return {
          ok: true,

          admin: {
            id:
              admin.id,

            email:
              admin.email,
          },

          revokedSessionCount:
            revokedSessions.length,

          invalidatedChallengeCount:
            invalidatedChallenges.length,
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
