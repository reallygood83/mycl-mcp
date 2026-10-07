import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { MyclApi } from '../src/mycl-api.js';
import { createMyclServer } from '../src/server.js';

function fakeApi() {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: options.body && JSON.parse(options.body), authorization: options.headers.authorization });
    const path = new URL(url).pathname;
    const data = path.endsWith('/tools') ? { tools: [{ id: 'trip-letter', name: '가정통신문', executable: true }] }
      : path.endsWith('/jobs') ? { job_id: 'job-1', status: 'pending' }
      : path.endsWith('/jobs/job-1') ? { job_id: 'job-1', status: 'completed', result: { type: 'text', text: '실제 백엔드 결과' } }
      : path.endsWith('/editor') ? { url: 'https://mycl.io/editor/draft-1' }
      : path.endsWith('/export') ? { url: 'https://mycl.io/download/file-1.hwpx' }
      : { name: 'Test User' };
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  };
  return { api: new MyclApi({ baseUrl: 'https://api.example.test/v1', token: 'test-only', fetcher }), calls };
}

test('MCP lists tools and preserves search → run → actual result → file flow', async () => {
  const { api, calls } = fakeApi();
  const server = createMyclServer(api);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const { tools } = await client.listTools();
    assert(tools.some(tool => tool.name === 'mycl_find_tools'));
    assert(tools.some(tool => tool.name === 'mycl_export_document'));

    const found = await client.callTool({ name: 'mycl_find_tools', arguments: { query: '가정통신문' } });
    assert.equal(found.structuredContent.tools[0].id, 'trip-letter');
    assert(calls[0].url.includes('/v1/mcp/tools?query='));
    assert.equal(calls[0].authorization, 'Bearer test-only');

    const key = '2878d900-a498-4c6f-b2ab-5259b944510e';
    const run = await client.callTool({ name: 'mycl_run_tool', arguments: { tool_id: 'trip-letter', inputs: { grade: 3 }, idempotency_key: key } });
    assert.equal(run.structuredContent.status, 'pending');
    assert.equal(calls[1].body.idempotency_key, key);

    const complete = await client.callTool({ name: 'mycl_get_result', arguments: { job_id: 'job-1' } });
    assert.equal(complete.structuredContent.result.text, '실제 백엔드 결과');
    const exported = await client.callTool({ name: 'mycl_export_document', arguments: { draft_id: 'draft-1', format: 'hwpx' } });
    assert.equal(exported.structuredContent.url, 'https://mycl.io/download/file-1.hwpx');
  } finally { await client.close(); await server.close(); }
});

test('invalid calls and untrusted backend links cannot succeed', async () => {
  const { api, calls } = fakeApi();
  const server = createMyclServer(api);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const invalid = await client.callTool({ name: 'mycl_run_tool', arguments: { tool_id: 'x', inputs: {}, idempotency_key: 'bad' } });
    assert.equal(invalid.isError, true);
    assert.equal(calls.length, 0);
    api.fetcher = async () => new Response(JSON.stringify({ url: 'https://evil.example/result' }));
    const link = await client.callTool({ name: 'mycl_open_editor', arguments: { result_id: 'x' } });
    assert.equal(link.isError, true);
  } finally { await client.close(); await server.close(); }
});
