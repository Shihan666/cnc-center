/// <reference types="astro/client" />

import type {
  ResolvedAdminSession,
} from './server/auth/service-contract.ts';

type SafeAdminSessionView =
  Readonly<
    Pick<
      ResolvedAdminSession,
      | 'admin'
      | 'authMethod'
      | 'idleExpiresAt'
      | 'absoluteExpiresAt'
    >
  >;

declare global {
  namespace App {
    interface Locals {
      adminSession?:
        SafeAdminSessionView;
    }
  }
}

export {};
