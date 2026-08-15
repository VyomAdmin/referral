import { NextResponse } from "next/server";
import { auth } from "./app/lib/auth";

const PUBLIC_ADMIN_PATHS = ["/admin/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_ADMIN_PATHS.some((path) => pathname === path) || pathname.startsWith("/admin/invite/");
  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/admin/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = { matcher: ["/admin/:path*"] };
