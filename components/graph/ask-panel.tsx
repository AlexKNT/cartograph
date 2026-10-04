"use client";

/**
 * The Ask pane.
 *
 * A conversation about this repository, and the lookups behind each answer.
 * A tool call appears the moment the agent starts making it, which is the point:
 * an answer with nothing above it would be the one thing this product exists to
 * prevent, so the panel shows the looking as it happens rather than a spinner.
 *
 * The question is asked of the whole repository, not of the selection, so the
 * selection is only carried along as what the person has open.
 */

import { useState } from "react";
import { Prose } from "@/components/graph/prose";
import type { ToolCall, Turn } from "@/components/graph/use-agent-chat";
import type { Selection } from "@/lib/graph/types";

export interface AskPanelProps {
  turns: readonly Turn[];
  onAsk: (question: string, selected: string | null) => void;
  selection: Selection | null;
  paths: ReadonlySet<string>;
  onSelectPath: (path: string) => void;
}

function selectedPathOf(selection: Selection | null): string | null {
  if (selection === null) return null;
  return selection.kind === "file" ? selection.path : selection.node;
}

/** Arguments as one short line, however far through they are. */
function summarise(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 140);
}

function ToolRow({ call }: { call: ToolCall }) {
  return (
    <div className="flex items-baseline gap-1.5 font-mono text-[10px] text-muted">
      <span aria-hidden className="shrink-0">
        {call.done ? "✓" : "·"}
      </span>
      <span className="shrink-0 text-foreground">{call.name}</span>
      <span className="min-w-0 flex-1 truncate">{summarise(call.input)}</span>
    </div>
  );
}

function TurnView({
  turn,
  paths,
  onSelectPath,
}: {
  turn: Turn;
  paths: ReadonlySet<string>;
  onSelectPath: (path: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px]">{turn.question}</p>

      {turn.tools.length > 0 && (
        <div className="flex flex-col gap-0.5 border-l border-border pl-2">
          {turn.tools.map((call) => (
            <ToolRow key={call.id} call={call} />
          ))}
        </div>
      )}

      {turn.answer !== "" && (
        <div className="flex flex-col gap-2">
          <Prose body={turn.answer} paths={paths} onSelectPath={onSelectPath} />
        </div>
      )}

      {turn.error !== null && <p className="font-mono text-[11px] text-outgoing">{turn.error}</p>}

      {turn.running && <p className="font-mono text-[10px] text-muted">working…</p>}
    </div>
  );
}

export function AskPanel({ turns, onAsk, selection, paths, onSelectPath }: AskPanelProps) {
  const [question, setQuestion] = useState("");
  const selected = selectedPathOf(selection);
  const running = turns.length > 0 && turns[turns.length - 1].running;

  const ask = (): void => {
    const text = question.trim();
    if (text === "" || running) return;
    setQuestion("");
    onAsk(text, selected);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2">
        {turns.length === 0 && (
          <p className="text-[11px] text-muted">
            Ask this repository a question. Every answer is looked up in the parsed graph, and each
            lookup appears above the answer as it happens.
          </p>
        )}
        {turns.map((turn, index) => (
          <TurnView key={index} turn={turn} paths={paths} onSelectPath={onSelectPath} />
        ))}
      </div>

      <form
        className="flex shrink-0 flex-col gap-1 border-t border-border p-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        {selected !== null && (
          <span className="truncate font-mono text-[10px] text-muted">about {selected}</span>
        )}

        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              ask();
            }
          }}
          rows={2}
          placeholder="where is authentication handled?"
          className="w-full resize-none rounded border border-border bg-background px-1.5 py-1 text-[11px] outline-none placeholder:text-muted focus:border-accent"
        />

        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-muted">enter to ask · shift+enter for a line</span>
          <button
            type="submit"
            disabled={running || question.trim() === ""}
            className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:border-accent hover:text-foreground disabled:opacity-50"
          >
            {running ? "asking…" : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}
