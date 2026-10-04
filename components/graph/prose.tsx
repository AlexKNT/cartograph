"use client";

/**
 * An answer, rendered.
 *
 * Explanations and the agent's answers are the same artifact: prose that may
 * name a path, so both go through here and both link the same way. A path that
 * is in the repository becomes a way to move the map; anything else is text.
 */

import { useMemo } from "react";
import { parseExplanation, type Span } from "@/lib/ai/render";

export interface ProseProps {
  body: string;
  /** Every path in the repository, so a path in prose can become a link. */
  paths: ReadonlySet<string>;
  onSelectPath: (path: string) => void;
}

function Spans({
  spans,
  onSelectPath,
}: {
  spans: readonly Span[];
  onSelectPath: (path: string) => void;
}) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.kind === "text") return <span key={index}>{span.text}</span>;
        if (span.kind === "code") {
          return (
            <code key={index} className="rounded-[2px] bg-background px-0.5 font-mono text-[11px]">
              {span.text}
            </code>
          );
        }
        if (span.kind === "strong") {
          return (
            <strong key={index} className="font-semibold">
              <Spans spans={span.spans} onSelectPath={onSelectPath} />
            </strong>
          );
        }
        return (
          <button
            key={index}
            type="button"
            title={span.path}
            onClick={() => onSelectPath(span.path)}
            className="font-mono text-[11px] text-accent hover:underline"
          >
            {span.path}
          </button>
        );
      })}
    </>
  );
}

export function Prose({ body, paths, onSelectPath }: ProseProps) {
  const blocks = useMemo(
    () => parseExplanation(body, (text) => paths.has(text)),
    [body, paths],
  );

  return (
    <>
      {blocks.map((block, index) =>
        block.kind === "paragraph" ? (
          <p key={index} className="text-[11px] leading-relaxed">
            <Spans spans={block.spans} onSelectPath={onSelectPath} />
          </p>
        ) : (
          <ul key={index} className="flex flex-col gap-1">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="flex gap-1.5 text-[11px] leading-relaxed">
                <span aria-hidden className="text-muted">
                  –
                </span>
                <span className="min-w-0 flex-1">
                  <Spans spans={item} onSelectPath={onSelectPath} />
                </span>
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}
