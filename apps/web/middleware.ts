import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const SELLER_PREFIX = '/seller';
const ADMIN_PREFIX = '/admin';
const NEEDS_AUTH = ['/cart', '/checkout', '/orders', '/wishlist', '/account'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.AUTH_SECRET, salt: 'authjs.session-token' });

  const role = (token?.role as string | undefined) ?? null;

  if (pathname.startsWith(ADMIN_PREFIX) && role !== 'ADMIN') {
    return redirectToLogin(req);
  }
  if (pathname.startsWith(SELLER_PREFIX) && role !== 'SELLER' && role !== 'ADMIN') {
    return redirectToLogin(req);
  }
  if (NEEDS_AUTH.some((p) => pathname.startsWith(p)) && !token) {
    return redirectToLogin(req);
  }
  return NextResponse.next();
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/seller/:path*', '/admin/:path*', '/cart/:path*', '/checkout/:path*', '/orders/:path*', '/wishlist/:path*', '/account/:path*'],
};
