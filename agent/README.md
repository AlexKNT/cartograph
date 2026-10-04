# cartograph-agent

The agent that answers questions about one analysed repository. It is its own
service, a stock Deep Agents harness on the LangGraph runtime, reached over
HTTP. The runtime provides the server, the threads and the streaming; nothing
here writes any of that.

## Run it

```bash
npm install
cp .env.example .env   # then fill in OPENAI_API_KEY
npm run dev            # langgraph dev, http://127.0.0.1:2024
```

The app talks to it at `AGENT_URL` (default `http://127.0.0.1:2024`). When it is
not running, the rest of the app keeps working and the Ask pane says why.

## What it can see

Six tools, all of them calls to the app's own read-only surface:

| tool | what it answers |
| --- | --- |
| `analysis_summary` | the framework, counts, coverage, categories and the graph's four facts |
| `find_files` | files whose path contains a piece of text |
| `files_by_role` | the files in one role |
| `file_neighbours` | what a file imports and what imports it |
| `walk_dependencies` | a few steps through the graph, either direction |
| `route_table` | the HTTP routes the parser recovered exactly |

The arithmetic behind all six is the same code that draws the map. The agent
picks a starting file and a direction; the walk does the walking.

## The credential

A run carries one thing in its context: a short-lived signed credential naming
exactly one analysis and the organization it belongs to. The tools read it and
attach it to every call; the model never sees it, so nothing in the source code
being read can redirect the agent to another analysis. Nothing here holds a key
that can read every row — the credential carries the asker's own org-scoped
Supabase token, and row-level security still decides what comes back.
