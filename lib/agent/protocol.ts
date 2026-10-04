/**
 * The agent's stream, read as a few small events.
 *
 * The LangGraph runtime streams everything: token chunks, tool-call fragments,
 * state updates, metadata. The panel needs four things out of all that — the
 * answer as it is written, each tool call as it happens, whether a call came
 * back, and a failure if there was one. Doing the reading here means the panel
 * knows nothing about the runtime's vocabulary, and it means the translation is
 * one pure-ish function that can be run over a recorded stream.
 *
 * Every field is read defensively: the stream is JSON from another process, and
 * a shape this does not recognise is skipped rather than assumed.
 */

/** What one turn of a conversation looks like as it arrives. */
export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; input: string }
  | { type: "tool-result"; id: string; ok: boolean }
  | { type: "error"; message: string }
  | { type: "done" };

export function encodeEvent(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

/** Whether an event off the wire is one this protocol defines. */
export function isAgentEvent(value: unknown): value is AgentEvent {
  switch (fieldOf(value, "type")) {
    case "text":
      return typeof fieldOf(value, "delta") === "string";
    case "tool":
      return (
        typeof fieldOf(value, "id") === "string" &&
        typeof fieldOf(value, "name") === "string" &&
        typeof fieldOf(value, "input") === "string"
      );
    case "tool-result":
      return typeof fieldOf(value, "id") === "string" && typeof fieldOf(value, "ok") === "boolean";
    case "error":
      return typeof fieldOf(value, "message") === "string";
    case "done":
      return true;
    default:
      return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** The text inside a message's content, whether it is a string or blocks. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  let text = "";
  for (const block of content) {
    const value = fieldOf(block, "text");
    if (typeof value === "string") text += value;
  }
  return text;
}

/** One frame of the runtime's server-sent events. */
export interface Frame {
  event: string;
  data: unknown;
}

/**
 * The frames out of a byte stream, in order.
 *
 * Split on the blank line that ends a frame, which is the whole of the SSE
 * envelope this needs. A frame whose data is not JSON is dropped: there is
 * nothing to read out of it.
 */
export async function* frames(body: ReadableStream<Uint8Array>): AsyncGenerator<Frame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const raw = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const frame = parseFrame(raw);
        if (frame !== null) yield frame;
        end = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(raw: string): Frame | null {
  let event = "message";
  const data: string[] = [];

  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }

  if (data.length === 0) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

/**
 * Translate the runtime's stream into the panel's events.
 *
 * Two things about the runtime's shape shape all of this. A message's content
 * is *accumulated* as it streams, so what is new is the end of it — the panel
 * wants the piece, not the whole thing again. A tool call's arguments, by
 * contrast, arrive as fragments that have to be added up. Both are tracked by
 * message and by call, so the events the panel gets are always increments.
 */
export async function* translate(body: ReadableStream<Uint8Array>): AsyncGenerator<AgentEvent> {
  /** What each tool call has spelled out so far, keyed by the call's id. */
  const pending = new Map<string, { name: string; args: string }>();
  /** What has already been sent for each message, so only the new part follows. */
  const sent = new Map<string, string>();
  /**
   * The messages this run streamed. A turn that continues a conversation gets
   * the thread's whole history back on the completed-message channel, so
   * anything not seen streaming here belongs to an earlier turn and is not
   * this turn's news.
   */
  const streamed = new Set<string>();

  for await (const frame of frames(body)) {
    if (frame.event === "error") {
      const message = fieldOf(frame.data, "message");
      yield { type: "error", message: typeof message === "string" ? message : "The agent failed." };
      continue;
    }

    if (frame.event !== "messages/partial" && frame.event !== "messages/complete") continue;
    if (!Array.isArray(frame.data)) continue;

    const partial = frame.event === "messages/partial";

    for (const item of frame.data) {
      const message = asRecord(item);
      if (message === null) continue;
      const kind = message["type"];

      if (kind === "ai") {
        const id = typeof message["id"] === "string" ? message["id"] : "";

        if (partial) {
          if (id !== "") streamed.add(id);

          // Pieces of an argument, to be added up.
          for (const [index, chunk] of listOf(message["tool_call_chunks"])) {
            const callId = typeof chunk["id"] === "string" && chunk["id"] !== "" ? chunk["id"] : `${id}:${index}`;
            const existing = pending.get(callId) ?? { name: "", args: "" };
            const name =
              typeof chunk["name"] === "string" && chunk["name"] !== "" ? chunk["name"] : existing.name;
            // Arguments accumulate the way content does: a piece that already
            // holds what came before replaces it, and a real fragment is added.
            const piece = typeof chunk["args"] === "string" ? chunk["args"] : "";
            const args = piece.startsWith(existing.args) ? piece : existing.args + piece;
            pending.set(callId, { name, args });
            if (name !== "") yield { type: "tool", id: callId, name, input: args };
          }
        } else {
          if (id === "" || !streamed.has(id)) continue;

          // The finished call, so the row settles on its real arguments.
          for (const [, call] of listOf(message["tool_calls"])) {
            const callId = call["id"];
            const name = call["name"];
            if (typeof callId !== "string" || typeof name !== "string") continue;
            yield { type: "tool", id: callId, name, input: JSON.stringify(call["args"] ?? {}) };
          }
        }

        const text = textOf(message["content"]);
        if (text === "") continue;

        // A chunk with no id cannot be compared to anything, so it is taken as
        // an increment rather than reasoned about.
        if (id === "") {
          yield { type: "text", delta: text };
          continue;
        }
        if (!partial && !streamed.has(id)) continue;

        const previous = sent.get(id) ?? "";
        const delta = text.startsWith(previous) ? text.slice(previous.length) : text;
        sent.set(id, text.startsWith(previous) ? text : previous + text);
        if (delta !== "") yield { type: "text", delta };
        continue;
      }

      if (kind === "tool") {
        const callId = message["tool_call_id"];
        if (typeof callId !== "string" || callId === "") continue;
        // Only a call this run made can have a result worth reporting.
        if (!pending.has(callId)) continue;
        yield { type: "tool-result", id: callId, ok: message["status"] !== "error" };
      }
    }
  }

  yield { type: "done" };
}

/** The objects in an array field, with their position when they do not say. */
function listOf(value: unknown): [number, Record<string, unknown>][] {
  if (!Array.isArray(value)) return [];

  const found: [number, Record<string, unknown>][] = [];
  value.forEach((item, at) => {
    const record = asRecord(item);
    if (record === null) return;
    const index = typeof record["index"] === "number" ? record["index"] : at;
    found.push([index, record]);
  });
  return found;
}
