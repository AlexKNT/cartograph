"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { headers } from "next/headers";

// A "use server" module may only export async functions, so the shape of the
// result stays private to this file and the form derives it.
type InviteState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export async function inviteMember(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const { userId, orgId, has } = await auth();
  if (!userId || !orgId) {
    return { status: "error", message: "You are not signed in to an organization." };
  }
  // System permissions aren't part of the session claims, so the server can
  // only gate on the role. The default admin role is the one that may invite.
  if (!has({ role: "org:admin" })) {
    return { status: "error", message: "Only organization admins can invite people." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const role = formData.get("role");
  if (email === "") {
    return { status: "error", message: "Enter an email address." };
  }
  if (role !== "org:member" && role !== "org:admin") {
    return { status: "error", message: "Pick a role." };
  }

  try {
    const clerk = await clerkClient();
    await clerk.organizations.createOrganizationInvitation({
      organizationId: orgId,
      inviterUserId: userId,
      emailAddress: email,
      role,
      // Accepting happens at the identity provider; where the person lands
      // afterwards is this app's decision, and it's the login page.
      redirectUrl: `${await requestOrigin()}/sign-in`,
    });
  } catch (error) {
    if (isClerkAPIResponseError(error)) {
      return {
        status: "error",
        message: error.errors[0]?.longMessage ?? "The invitation could not be sent.",
      };
    }
    throw error;
  }

  return { status: "sent", email };
}

async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}
