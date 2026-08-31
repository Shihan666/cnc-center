import {
  stdin as input,
} from 'node:process';

import {
  createFirstAdmin,
} from './admin-bootstrap-core.mjs';

const MAX_STDIN_UTF8_BYTES =
  16_384;

async function readBootstrapInput() {
  if (input.isTTY) {
    throw new Error(
      'Direct terminal password entry is disabled. Use npm run admin:create.',
    );
  }

  input.setEncoding(
    'utf8',
  );

  let payload =
    '';

  for await (
    const chunk of input
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
        'Admin bootstrap input exceeded the allowed size.',
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
      'Invalid Admin bootstrap input transport.',
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
      'Invalid Admin bootstrap input transport.',
    );
  }

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

async function runBootstrap() {
  const inputData =
    await readBootstrapInput();

  let password =
    inputData.takePassword();

  let result;

  try {
    result =
      await createFirstAdmin({
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
      case 'admin_exists':
        console.error(
          'Refusing to bootstrap: an Admin account already exists.',
        );
        break;

      case 'invalid_email':
        console.error(
          'Invalid Admin email.',
        );
        break;

      case 'invalid_password':
        console.error(
          'Password does not satisfy the Admin password input contract.',
        );
        break;
    }

    process.exitCode =
      1;

    return;
  }

  console.log(
    'Admin created.',
  );

  console.log(
    'TOTP was not provisioned by this command.',
  );

  console.log(
    'Open /admin/auth/login and complete first-login enrollment.',
  );
}

try {
  await runBootstrap();
} catch {
  console.error(
    'Admin bootstrap failed. No credentials were printed.',
  );

  process.exitCode =
    1;
}
