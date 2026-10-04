/**
 * What a run is handed that must never reach the model.
 *
 * The credential names one analysis and the organization it belongs to. It is
 * read by the tools and attached to every call they make; it is not part of the
 * conversation, so a comment in someone else's source code cannot ask for a
 * different analysis and be understood.
 */
import { z } from "zod";

export const agentContext = z.object({
  credential: z.string().describe("The signed credential the tools read the analysis with."),
});

export type AgentContext = z.infer<typeof agentContext>;
