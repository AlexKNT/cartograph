"use client";

/**
 * The conversation with the agent, as the panel holds it.
 *
 * A turn is the question, the lookups it took, and the answer. Events arrive as
 * they happen, so a tool call appears while it is still being spelled out and
 * the answer is written a piece at a time. Nothing here is optimistic: the panel
 * shows what the agent did, in the order it did it.
 */

import { useCallback, useRef, useState } from "react";
import { frames, isAgentEvent, type AgentEvent } from "@/lib/agent/protocol";

export interface ToolCall {
  id: string;
  name: string;
  /** The arguments as they streamed, which may be a partial JSON object. */
  input: string;
  done: boolean;
}

export interface Turn {
  question: string;
  tools: ToolCall[];
  answer: string;
  error: string | null;
  running: boolean;
}

function reduce(turn: Turn, event: AgentEvent): Turn {
  switch (event.type) {
    case "text":
      return { ...turn, answer: turn.answer + event.delta };
    case "tool": {
      const at = turn.tools.findIndex((call) => call.id === event.id);
      const call: ToolCall = { id: event.id, name: event.name, input: event.input, done: false };
      const tools = [...turn.tools];
      if (at === -1) tools.push(call);
      else tools[at] = { ...call, done: tools[at].done };
      return { ...turn, tools };
    }
    case "tool-result":
      return {
        ...turn,
        tools: turn.tools.map((call) => (call.id === event.id ? { ...call, done: true } : call)),
      };
    case "error":
      return { ...turn, error: event.message };
    case "done":
      return turn;
  }
}

function settled(turn: Turn): Turn {
  return { ...turn, running: false, tools: turn.tools.map((call) => ({ ...call, done: true })) };
}

async function refusal(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (typeof body === "object" && body !== null) {
    const error = (body as Record<string, unknown>)["error"];
    if (typeof error === "string" && error !== "") return error;
  }
  return `The agent could not be reached (${response.status}).`;
}

export function useAgentChat(analysisId: string): {
  turns: readonly Turn[];
  send: (question: string, selected: string | null) => Promise<void>;
} {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const busy = useRef(false);

  /** The last turn is the only one an event can belong to. */
  const change = useCallback((edit: (turn: Turn) => Turn): void => {
    setTurns((current) => {
      if (current.length === 0) return current;
      const next = current.slice();
      next[next.length - 1] = edit(next[next.length - 1]);
      return next;
    });
  }, []);

  const send = useCallback(
    async (question: string, selected: string | null): Promise<void> => {
      if (busy.current) return;
      busy.current = true;

      setTurns((current) => [
        ...current,
        { question, tools: [], answer: "", error: null, running: true },
      ]);

      try {
        const response = await fetch("/api/agent/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ analysisId, question, selected }),
        });

        if (!response.ok) {
          const message = await refusal(response);
          change((turn) => ({ ...settled(turn), error: message }));
          return;
        }
        if (response.body === null) {
          change((turn) => ({ ...settled(turn), error: "The agent answered with no stream." }));
          return;
        }

        for await (const frame of frames(response.body)) {
          const event = frame.data;
          if (isAgentEvent(event)) change((turn) => reduce(turn, event));
        }
        change(settled);
      } catch (error) {
        change((turn) => ({
          ...settled(turn),
          error: error instanceof Error ? error.message : String(error),
        }));
      } finally {
        busy.current = false;
      }
    },
    [analysisId, change],
  );

  return { turns, send };
}
