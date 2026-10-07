import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const id = z.string().trim().min(1).max(200);
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });

export function createMyclServer(api) {
  const server = new McpServer({ name: 'mycl-mcp', version: '0.2.0-alpha.1' });
  const add = (name, description, inputSchema, action, readOnly = true) => {
    server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: false } }, async args => {
      try { return result(await action(args)); }
      catch (error) { return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Mycl operation failed' }] }; }
    });
  };

  add('mycl_whoami', 'Identify the connected Mycl account. No data is fabricated if the Mycl API is unavailable.', z.object({}), () => api.account());
  add('mycl_find_tools', 'Search available Mycl AI work tools for a user task. Only the Mycl backend decides visibility and eligibility.', z.object({ query: z.string().trim().min(2).max(500), limit: z.number().int().min(1).max(20).default(5) }), ({ query, limit }) => api.search(query, limit));
  add('mycl_get_tool', 'Get the backend-provided input contract and usage information for a specific Mycl tool.', z.object({ tool_id: id }), ({ tool_id }) => api.getTool(tool_id));
  add('mycl_run_tool', 'Run an authorized Mycl work tool. May consume credits; confirm scope and cost with the user first. A repeated idempotency key must not produce duplicate jobs.', z.object({ tool_id: id, inputs: z.record(z.string(), z.unknown()), idempotency_key: z.uuid() }), ({ tool_id, inputs, idempotency_key }) => api.run(tool_id, inputs, idempotency_key), false);
  add('mycl_get_result', 'Read the actual Mycl execution status and result; pending or failed is not a submitted result.', z.object({ job_id: id }), ({ job_id }) => api.result(job_id));
  add('mycl_open_editor', 'Create or retrieve a document draft editing link from a Mycl result. Requires user permission.', z.object({ result_id: id }), ({ result_id }) => api.editor(result_id), false);
  add('mycl_export_document', 'Export an existing saved draft in a backend-supported HWP/HWPX format; does not generate the file itself.', z.object({ draft_id: id, format: z.enum(['hwp', 'hwpx']), revision: id.optional() }), ({ draft_id, format, revision }) => api.export(draft_id, format, revision), false);
  return server;
}
