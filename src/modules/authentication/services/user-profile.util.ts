import { UserDocument } from '../../user/schema/user.schema';
import {
  getPermissionsForRole,
  Permission,
} from '../constants/permissions.constant';

/**
 * Monta o objeto de perfil retornado pela auth (sem `password`, com `id` string
 * e `permissions`). Fonte única do shape para que `/auth/me` e
 * `POST /auth/sso/session` devolvam exatamente o mesmo contrato ao front.
 *
 * `permissions` explícitas só quando o token é da própria API (vêm do payload);
 * caso contrário derivam do `role` local.
 */
export function buildUserProfile(
  user: UserDocument,
  permissions?: Permission[],
) {
  const { password: _pw, ...userObj } = user.toObject();
  return {
    ...userObj,
    id: String(userObj._id),
    permissions: permissions ?? getPermissionsForRole(user.role),
  };
}
