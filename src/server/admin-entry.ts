export type AdminPageClassification =
  | 'non_admin'
  | 'auth_entry'
  | 'protected_admin';

export function classifyAdminPagePath(
  pathname: string,
): AdminPageClassification {
  if (
    pathname === '/admin'
  ) {
    return 'protected_admin';
  }

  if (
    pathname.startsWith(
      '/admin/auth/',
    )
  ) {
    return 'auth_entry';
  }

  if (
    pathname.startsWith(
      '/admin/',
    )
  ) {
    return 'protected_admin';
  }

  return 'non_admin';
}
