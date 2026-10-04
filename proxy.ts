import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  // The preview renders checked-in scaffolding data, not a stored analysis, so
  // there is nothing behind it that needs a session.
  "/preview(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // The login screens finish their own business, including the session task
  // that picks an organization — `clerkMiddleware` sends a session with an
  // unfinished task there on its own, so those requests are left alone.
  if (isPublicRoute(req)) {
    return;
  }

  // Everything else needs a session, decided here so a protected page's HTML is
  // never generated for a signed-out visitor.
  await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
