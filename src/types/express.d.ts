import { User as UserSchema } from 'src/modules/user/schema/user.schema';
import { Permission } from 'src/modules/authentication/constants/permissions.constant';

// `@types/passport` (puxado por @types/passport-jwt) já declara
// `Express.User {}` e `Request.user?: Express.User`. Por isso estendemos o
// próprio `Express.User` em vez de redefinir `Request.user` — redefinir
// criava merge conflitante e fazia o tipo de `req.user` perder `_id`/permissões.
declare global {
  namespace Express {
    interface User extends UserSchema {
      _id: string;
      id?: string;
      permissions?: Permission[];
    }
  }
}

export {};
