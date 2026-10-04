"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseClient } from "@/lib/supabase/browser";
import {
  analysisTopic,
  isAnalysisProgress,
  PROGRESS_EVENT,
  type AnalysisProgress,
} from "@/lib/analysis/progress";

/** The separator in the effect key. A uuid contains none, so it is unambiguous. */
const SEPARATOR = "\u0000";

/**
 * What the database has published about these analyses, live.
 *
 * The client is the authenticated one on purpose: opening the socket needs the
 * access token, which is why the session cookie is readable in the first place.
 *
 * Joining also asks the server once for the current row, because a page that
 * loads mid-run has already missed whatever was published before the socket
 * opened. That is not a poll: it happens once per channel, on joining.
 */
export function useAnalysisProgress(
  analysisIds: readonly string[],
): Readonly<Record<string, AnalysisProgress>> {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [progress, setProgress] = useState<Record<string, AnalysisProgress>>({});

  // Keyed on the ids themselves rather than on the array, so a parent that
  // re-renders with an equal list does not tear the channels down.
  const key = analysisIds.join(SEPARATOR);

  useEffect(() => {
    const ids = key === "" ? [] : key.split(SEPARATOR);
    if (ids.length === 0) return;

    const channels = ids.map((id) =>
      supabase
        .channel(analysisTopic(id), { config: { private: true } })
        .on("broadcast", { event: PROGRESS_EVENT }, ({ payload }: { payload: unknown }) => {
          if (!isAnalysisProgress(payload)) return;

          const event = payload;
          setProgress((current) => ({ ...current, [id]: event }));

          // The row holds more than the stage — the counts, and on failure the
          // reason — so finishing is a re-read rather than a state change.
          if (event.status === "ready" || event.status === "failed") router.refresh();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") router.refresh();
        }),
    );

    return () => {
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [supabase, router, key]);

  return progress;
}
