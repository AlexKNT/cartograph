import { redirect } from "next/navigation";
import { analyseRepository } from "@/lib/actions/analyse";

/**
 * Where the hero's repository comes back after sign-in.
 *
 * It runs the very same start the dashboard's form runs, in a request that is
 * allowed to outlive itself, and lands on the analysis it began. A failure —
 * an unreadable URL, or a session with no organization — falls through to the
 * dashboard, which already says why.
 */
export async function GET(request: Request): Promise<void> {
  const url = new URL(request.url).searchParams.get("url") ?? "";
  const formData = new FormData();
  formData.set("url", url);

  await analyseRepository({ status: "idle" }, formData);

  redirect("/dashboard");
}
