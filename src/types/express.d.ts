import { User } from 'src/modules/user/schema/user.schema';
import { Permission } from 'src/modules/authentication/constants/permissions.constant';

declare global {
  namespace Express {
    interface Request {
      user?: User & { _id: string; permissions?: Permission[] };
    }
  }
}
