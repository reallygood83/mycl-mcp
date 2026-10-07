# Mycl WebMCP (browser integration preview)

`web/mycl-webmcp.js` registers browser WebMCP tools on an open Mycl page with `document.modelContext.registerTool`. It connects to the page's **existing** search, execute, result, editor, and export functions. No new Mycl API is required if those functions already exist in the web app. The previously released remote MCP adapter remains in `src/` as a separate experimental path.

**Status: browser integration preview, not deployed on mycl.io.** This repository does not contain the Mycl production frontend. The browser module only registers callbacks supplied by that frontend; it does not manufacture an execution result or convert a document to HWP/HWPX. WebMCP tools exist only while the page is open and supported by the browser agent. Codex/Claude Code/Grok remote MCP clients do not automatically discover these page tools.

## Add WebMCP to the Mycl frontend

Import the module from the Mycl frontend build and pass its existing authorized functions. The code below is a **contract example**; replace the function references with verified Mycl frontend functions, not a new set of guessed HTTP endpoints.

```js
import { installMyclWebMcp } from './mycl-webmcp.js';

await installMyclWebMcp({
  document,
  app: {
    searchTools: ({ query, limit, useJev, signal }) => myclSearchTools({ query, limit, useJev, signal }),
    runTool: ({ toolId, inputs, signal }) => myclRunTool({ toolId, inputs, signal }),
    getResult: ({ jobId, signal }) => myclGetResult({ jobId, signal }),
    openEditor: ({ resultId, signal }) => myclOpenEditor({ resultId, signal }),
    exportDocument: ({ documentId, format, signal }) => myclExportDocument({ documentId, format, signal })
  },
  approve: (action, details) => myclConfirmAction(action, details)
});
```

The frontend must return `{ tools: [...] }` for search; `{ status: 'pending', jobId }`, `{ status: 'completed', result }`, or `{ status: 'failed', ... }` for execution/results; `{ status: 'opened' }` after actual editor navigation; and `{ status: 'ready', url }` only after the existing exporter produced a downloadable file. Registering callbacks alone does not grant permissions: each frontend function must use the logged-in user's existing authorization and backend checks. No write action runs without a positive `approve` callback. When a feature is unavailable, omit its callback and its WebMCP tool will not be registered. Jev is optional and `useJev` is only passed through if the frontend supports it. Add this module to the actual Mycl deployment to make it visible on mycl.io; copying it into this repository alone does not change the live site.

The separate local `/Users/moon/Documents/MYCL` static demo already exposes limited WebMCP search/navigation tools. That demo is not the production site and has no verified AI-work-tool execution or HWP/HWPX export. The new module deliberately does not report those operations as successful without results from the host application.

To verify the real integration, open the **deployed** Mycl page in a WebMCP-enabled browser agent and inspect `await document.modelContext.getTools()`. Exercise an authorized tool with a test account, read its actual result, then save and reopen a document. The Node tests below replace `document.modelContext` and the host functions with fakes; passing them does not prove the production site or a browser agent supports the tools.

## Legacy remote MCP adapter (separate from WebMCP)

An MCP adapter in `src/` proposes remote/backend tools for coding agents. Its API paths have not been validated on the Mycl service. Do not confuse this with the browser integration above.

## Setup

Node.js 22+, `npm ci`. Obtain a scoped user API token and confirmed backend URL **from the Mycl service team**. Set `MYCL_API_BASE_URL`, `MYCL_API_TOKEN`, and optionally `MYCL_WEB_ORIGIN` in the environment; `.env.example` documents them but is not automatically loaded. Keep tokens out of config committed to Git. Start with `npm start`. Without a confirmed backend, it fails closed at startup or on calls, depending on the missing value.

For local integration, add an stdio MCP server with command `node`, argument `/absolute/path/to/mycl-mcp/src/cli.js`, and the three Mycl environment variables above. With those variables supplied through your local environment/secret manager, Codex can use `codex mcp add mycl -- node /absolute/path/to/mycl-mcp/src/cli.js`. Claude Code can use `claude mcp add --transport stdio mycl -- node /absolute/path/to/mycl-mcp/src/cli.js`. Antigravity's MCP settings can point to the same local stdio command; verify its current config shape in the installed client. Do not place shared credentials in a checked-in `.mcp.json` or `.agents/mcp_config.json`.

For **local** HTTP development set `MCP_TRANSPORT=http`, `MCP_BEARER_TOKEN` (at least 32 characters), and optionally `MCP_PORT` (default 3000). The endpoint is `http://127.0.0.1:3000/mcp`; it checks Host, Origin, and the bearer token. This is not ready for ChatGPT, Claude cloud connectors, or Grok, which require a publicly reachable server with user-specific authentication. That deployment needs an approved Mycl OAuth integration, TLS, tenant-aware token mapping, quotas, and production authorization checks. WebMCP is a separate in-browser enhancement requiring changes to the actual Mycl frontend.

## Proposed backend contract

The backend remains the authority for user identity, institution visibility, input schema, tool execution, idempotency, credit usage, document ownership, and file export. Prefix paths with `MYCL_API_BASE_URL` (e.g. a URL ending in `/v1`). All responses are JSON objects and all requests use a scoped `Authorization: Bearer` token.

| MCP tool | Backend call | Expected response evidence |
| --- | --- | --- |
| `mycl_whoami` | `GET /mcp/account` | user/institution metadata |
| `mycl_find_tools` | `GET /mcp/tools?query=...&limit=...` | authorized tool IDs, descriptions, eligibility |
| `mycl_get_tool` | `GET /mcp/tools/{id}` | backend input contract and costs |
| `mycl_run_tool` | `POST /mcp/jobs` with `tool_id`, `inputs`, `idempotency_key` | real `job_id`, status |
| `mycl_get_result` | `GET /mcp/jobs/{id}` | pending/completed/failed, typed actual result |
| `mycl_open_editor` | `POST /mcp/results/{id}/editor` | authenticated Mycl editor `url` |
| `mycl_export_document` | `POST /mcp/documents/{id}/export` with `format`, optional `revision` | authenticated download `url` |

The URL returned by the last two calls must be HTTPS and on the configured Mycl API or web origin. Export is only a link to a file produced by Mycl; this adapter does **not** convert to HWP/HWPX. Jev is not wired in this preview because a verified service API and privacy contract are missing; optional ranking can be added after candidate search and before user selection. The adapter does not implement institutional submission, approvals, seals, or sends.

## Verification

`npm run check && npm test && npm audit --omit=dev`

The browser tests verify WebMCP registration, search, execution, actual-result reporting, missing-feature handling, and approval refusal against a mocked page. The remote MCP tests use an in-memory fake backend. They do not prove a real Mycl tool ran, a file opened, or any third-party client connected. Before a production release, wire the browser module into the Mycl frontend and run user/tenant permission and actual HWP/HWPX round-trip tests.

## References

- [MCP official TypeScript SDK v2](https://github.com/modelcontextprotocol/typescript-sdk) (Apache-2.0)
- [MCP specification](https://modelcontextprotocol.io/specification/2026-07-28) (tool discovery, transports, authorization)
- [Chrome: WebMCP vs MCP](https://developer.chrome.com/docs/ai/webmcp/compare-mcp)
- [Chrome: WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome: WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [OpenAI Codex MCP configuration](https://developers.openai.com/codex/mcp)
- [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp)
- [Grok custom MCP connectors](https://docs.x.ai/grok/connectors)
- [Google Antigravity MCP configuration example](https://developers.google.com/knowledge/mcp)

This project is an independent integration preview; it does not include or claim ownership of Mycl's service code, name, or document formats. The referenced SDK and services retain their respective copyrights and licenses.
