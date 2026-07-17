import { router } from './trpc';
import { authRouter } from './routers/auth';
import { catalogRouter } from './routers/catalog';
import { cartRouter } from './routers/cart';
import { addressRouter } from './routers/address';
import { orderRouter } from './routers/order';
import { sellerRouter } from './routers/seller';
import { adminRouter } from './routers/admin';
import { negotiationRouter } from './routers/negotiation';

export const appRouter = router({
  auth: authRouter,
  catalog: catalogRouter,
  cart: cartRouter,
  address: addressRouter,
  order: orderRouter,
  seller: sellerRouter,
  admin: adminRouter,
  negotiation: negotiationRouter,
});

export type AppRouter = typeof appRouter;
