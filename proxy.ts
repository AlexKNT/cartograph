import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// The agent's tools surface is public to this middleware on purpose: the agent
// has no session of its own, and the request authenticates with the signed
// credential the app minted instead. The route is the only thing that reads it.
const isPublicRoute = createRouteMatcher([
  // The landing page is the one screen a stranger sees, and it sends a pasted
  // repository through sign-in itself rather than being walled off first.
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/agent/tools",
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
