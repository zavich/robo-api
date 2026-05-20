export const PERMISSIONS = [
  'change_stage',
  'create_activity',
  'user_management',
  'mass_edit',
  'process_insertion',
  'view_all_processes',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<string, Record<Permission, boolean>> = {
  admin: {
    change_stage: true,
    create_activity: true,
    user_management: true,
    mass_edit: true,
    process_insertion: true,
    view_all_processes: true,
  },
  advogado: {
    change_stage: true,
    create_activity: true,
    user_management: false,
    mass_edit: false,
    process_insertion: false,
    view_all_processes: false,
  },
};

export function getPermissionsForRole(role: string): Permission[] {
  const map = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.advogado;
  return (Object.keys(map) as Permission[]).filter((k) => map[k]);
}
