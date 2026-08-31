import {
  resetAdminPassword,
} from './admin-password-reset-core.mjs';

const MAX_STDIN_UTF8_BYTES =
  16_384;

async function readPasswordResetInput() {
  if (process.stdin.isTTY) {
    throw new Error(
      'Direct interactive Node password reset is disabled. Use npm run admin:password-reset.',
    );
  }

  process.stdin.setEncoding(
    'utf8',
  );

  let payload =
    '';

  for await (
    const chunk
    of process.stdin
  ) {
    payload +=
      chunk;

    if (
      Buffer.byteLength(
        payload,
        'utf8',
      ) >
      MAX_STDIN_UTF8_BYTES
    ) {
      throw new Error(
        'Admin password reset input exceeded the allowed size.',
      );
    }
  }

  const lines =
    payload
      .replace(
        /\r\n/gu,
        '\n',
      )
      .split(
        '\n',
      );

  payload =
    '';

  if (
    lines.at(-1) ===
    ''
  ) {
    lines.pop();
  }

  if (
    lines.length !==
    2
  ) {
    throw new Error(
      'Invalid Admin password reset input transport.',
    );
  }

  const email =
    lines[0];

  let password =
    lines[1];

  if (
    typeof email !==
      'string' ||
    typeof password !==
      'string'
  ) {
    throw new Error(
      'Invalid Admin password reset input transport.',
    );
  }

  lines[1] =
    '';

  return {
    email,

    takePassword() {
      const current =
        password;

      password =
        '';

      return current;
    },
  };
}

async function runPasswordReset() {
  const inputData =
    await readPasswordResetInput();

  let password =
    inputData.takePassword();

  let result;

  try {
    result =
      await resetAdminPassword({
        email:
          inputData.email,

        password,
      });
  } finally {
    password =
      '';
  }

  if (!result.ok) {
    switch (
      result.reason
    ) {
      case 'invalid_email':
        console.error(
          'Invalid Admin email.',
        );
        break;

      case 'invalid_password':
        console.error(
          'Invalid Admin password.',
        );
        break;

      case 'admin_not_found':
        console.error(
          'Admin account was not found.',
        );
        break;

      case 'admin_inactive':
        console.error(
          'Admin account is disabled.',
        );
        break;

      default:
        console.error(
          'Admin password reset failed.',
        );
    }

    process.exitCode =
      1;

    return;
  }

  console.log(
    'Admin password reset completed.',
  );

  console.log(
    `Revoked sessions: ${result.revokedSessionCount}`,
  );

  console.log(
    `Invalidated login challenges: ${result.invalidatedChallengeCount}`,
  );
}

try {
  await runPasswordReset();
} catch {
  console.error(
    'Admin password reset failed. No credentials were printed.',
  );

  process.exitCode =
    1;
}
