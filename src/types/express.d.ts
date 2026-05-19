import { User } from 'src/modules/user/schema/user.schema';

declare global {
  namespace Express {
    interface Request {
      user?: User & { _id: string };
    }
  }
}
