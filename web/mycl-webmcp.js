const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;
const asText = (value) => JSON.stringify(value);

export async function installMyclWebMcp({ document, app, approve }) {
  if (!document?.modelContext?.registerTool) return { supported: false, tools: [] };
  if (typeof app?.searchTools !== 'function') throw new TypeError('app.searchTools is required');

  const tools = [];
  const add = async (name, description, inputSchema, execute, readOnly) => {
    await document.modelContext.registerTool({
      name,
      description,
      inputSchema,
      annotations: { readOnlyHint: readOnly, consequentialHint: !readOnly, untrustedContentHint: true },
      execute
    });
    tools.push(name);
  };
  const approved = async (name, details) => {
    if (typeof approve !== 'function' || !(await approve(name, details))) {
      return false;
    }
    return true;
  };

  await add('mycl_search_tools', '현재 로그인된 Mycl 사용자에게 사용 가능한 AI 업무도구를 검색합니다.', {
    type: 'object', properties: {
      query: { type: 'string', minLength: 2, maxLength: 500 },
      limit: { type: 'integer', minimum: 1, maximum: 20 },
      useJev: { type: 'boolean', description: '사용자가 Jev 추천을 선택한 경우에만 true' }
    }, required: ['query']
  }, async ({ query, limit = 5, useJev = false }, { signal } = {}) => {
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 500 || !Number.isInteger(limit) || limit < 1 || limit > 20 || typeof useJev !== 'boolean') throw new TypeError('Invalid search input');
    const found = await app.searchTools({ query: query.trim(), limit, useJev, signal });
    if (!object(found) || !Array.isArray(found.tools)) throw new Error('Mycl did not return a tool list');
    return asText(found);
  }, true);

  if (typeof app.runTool === 'function') {
    await add('mycl_run_tool', '선택한 Mycl AI 업무도구를 실행합니다. 크레딧이 사용될 수 있으므로 확인이 필요합니다.', {
      type: 'object', properties: {
        toolId: { type: 'string', minLength: 1, maxLength: 200 }
      }, required: ['toolId']
    }, async ({ toolId }, { signal } = {}) => {
      if (!identifier(toolId)) throw new TypeError('Invalid tool execution input');
      if (!(await approved('mycl_run_tool', { toolId }))) return asText({ status: 'cancelled' });
      const outcome = await app.runTool({ toolId, signal });
      if (!object(outcome) || !['pending', 'completed', 'failed'].includes(outcome.status) || (outcome.status === 'completed' && !('result' in outcome))) {
        throw new Error('Mycl did not return a valid execution result');
      }
      return asText(outcome);
    }, false);
  }

  if (typeof app.getResult === 'function') {
    await add('mycl_get_result', '실행 중인 업무도구의 실제 완료 상태와 결과를 확인합니다.', {
      type: 'object', properties: { jobId: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['jobId']
    }, async ({ jobId }, { signal } = {}) => {
      if (!identifier(jobId)) throw new TypeError('Invalid job ID');
      const outcome = await app.getResult({ jobId, signal });
      if (!object(outcome) || !['pending', 'completed', 'failed'].includes(outcome.status) || (outcome.status === 'completed' && !('result' in outcome))) {
        throw new Error('Mycl did not return a valid result');
      }
      return asText(outcome);
    }, true);
  }

  if (typeof app.openEditor === 'function') {
    await add('mycl_open_editor', '현재 Mycl 작업 결과의 한글 문서 초안을 편집기에서 엽니다.', {
      type: 'object', properties: { resultId: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['resultId']
    }, async ({ resultId }, { signal } = {}) => {
      if (!identifier(resultId)) throw new TypeError('Invalid result ID');
      if (!(await approved('mycl_open_editor', { resultId }))) return asText({ status: 'cancelled' });
      const outcome = await app.openEditor({ resultId, signal });
      if (!object(outcome) || outcome.status !== 'opened') throw new Error('Mycl did not confirm editor navigation');
      return asText(outcome);
    }, false);
  }

  if (typeof app.exportDocument === 'function') {
    await add('mycl_export_document', '저장된 Mycl 문서를 기존 한글 에디터 기능으로 HWP 또는 HWPX 내보냅니다.', {
      type: 'object', properties: {
        documentId: { type: 'string', minLength: 1, maxLength: 200 },
        format: { type: 'string', enum: ['hwp', 'hwpx'] }
      }, required: ['documentId', 'format']
    }, async ({ documentId, format }, { signal } = {}) => {
      if (!identifier(documentId) || !['hwp', 'hwpx'].includes(format)) throw new TypeError('Invalid export input');
      if (!(await approved('mycl_export_document', { documentId, format }))) return asText({ status: 'cancelled' });
      const outcome = await app.exportDocument({ documentId, format, signal });
      if (!object(outcome) || outcome.status !== 'ready' || typeof outcome.url !== 'string') throw new Error('Mycl did not produce a downloadable file');
      return asText(outcome);
    }, false);
  }

  return { supported: true, tools };
}
