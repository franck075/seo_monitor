import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/connexion", "/inscription", "/abonnement/succes", "/abonnement/annuler"];
const PUBLIC_PREFIXES = ["/equipe/rejoindre/", "/blog"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("access_token")?.value;

  // Allow public paths without token
  if (PUBLIC_PATHS.some((p) => pathname === p) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    // If already logged in, redirect away from connexion/inscription
    if (token && (pathname === "/connexion" || pathname === "/inscription")) {
      return NextResponse.redirect(new URL("/tableau-de-bord", request.url));
    }
    return NextResponse.next();
  }

  // All other routes require a token
  if (!token) {
    const loginUrl = new URL("/connexion", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
