/**
 * The agent, as its own service.
 *
 * It is a stock Deep Agents harness with one thing configured: the six
 * repository tools, the product's rules as its instructions, and a context
 * schema whose only field is the credential. The server, the threads and the
 * streaming all come from the runtime; none of them is written here.
 */
import { createDeepAgent } from "deepagents";
import { agentContext } from "./context.ts";
import { instructions } from "./instructions.ts";
import { repositoryTools } from "./tools.ts";

const MODEL = process.env.CARTOGRAPH_AGENT_MODEL ?? "openai:gpt-4.1-mini-2025-04-14";

export const agent = createDeepAgent({
  name: "cartograph",
  model: MODEL,
  tools: repositoryTools,
  systemPrompt: instructions,
  contextSchema: agentContext,
});
