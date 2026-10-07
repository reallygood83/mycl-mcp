import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installMyclWebMcp } from '../web/mycl-webmcp.js';

test('registers browser tools and submits a completed Mycl result', async () => {
  const definitions = new Map();
  const document = { modelContext: { registerTool: async (tool) => definitions.set(tool.name, tool) } };
  const calls = [];
  const app = {
    searchTools: async (input) => { calls.push(input); return { tools: [{ id: 'field-trip' }] }; },
    runTool: async (input) => { calls.push(input); return { status: 'pending', jobId: 'job-1' }; },
    getResult: async (input) => { calls.push(input); return { status: 'completed', result: { type: 'text', text: '확인된 결과' } }; },
    openEditor: async () => ({ status: 'opened' }),
    exportDocument: async () => ({ status: 'ready', url: '/documents/1.hwpx' })
  };
  const installed = await installMyclWebMcp({ document, app, approve: async () => true });
  assert.equal(installed.supported, true);
  assert.deepEqual(installed.tools, ['mycl_search_tools', 'mycl_run_tool', 'mycl_get_result', 'mycl_open_editor', 'mycl_export_document']);
  assert.deepEqual(JSON.parse(await definitions.get('mycl_search_tools').execute({ query: '현장체험학습' })), { tools: [{ id: 'field-trip' }] });
  assert.deepEqual(JSON.parse(await definitions.get('mycl_run_tool').execute({ toolId: 'field-trip' })), { status: 'pending', jobId: 'job-1' });
  assert.equal(JSON.parse(await definitions.get('mycl_get_result').execute({ jobId: 'job-1' })).result.text, '확인된 결과');
  assert.equal(JSON.parse(await definitions.get('mycl_export_document').execute({ documentId: 'doc-1', format: 'hwpx' })).url, '/documents/1.hwpx');
  assert.equal(calls[0].useJev, false);
});

test('unsupported browser, absent actions, invalid results, and denied actions fail closed', async () => {
  assert.deepEqual(await installMyclWebMcp({ document: {}, app: {} }), { supported: false, tools: [] });
  const definitions = new Map();
  const document = { modelContext: { registerTool: async (tool) => definitions.set(tool.name, tool) } };
  let ran = false;
  const installed = await installMyclWebMcp({ document, app: {
    searchTools: async () => ({ tools: [] }),
    runTool: async () => { ran = true; return { status: 'completed' }; }
  }, approve: async () => false });
  assert.deepEqual(installed.tools, ['mycl_search_tools', 'mycl_run_tool']);
  const cancelled = JSON.parse(await definitions.get('mycl_run_tool').execute({ toolId: 'x' }));
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(ran, false);
  await assert.rejects(definitions.get('mycl_search_tools').execute({ query: '' }));
  await assert.rejects(installMyclWebMcp({ document, app: {} }), /searchTools/);
});

test('completed without a result is not reported as success', async () => {
  const definitions = new Map();
  const document = { modelContext: { registerTool: async (tool) => definitions.set(tool.name, tool) } };
  await installMyclWebMcp({ document, app: {
    searchTools: async () => ({ tools: [] }),
    runTool: async () => ({ status: 'completed' })
  }, approve: async () => true });
  await assert.rejects(definitions.get('mycl_run_tool').execute({ toolId: 'x' }), /valid execution result/);
});
