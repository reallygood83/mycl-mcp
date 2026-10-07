import { installMyclWebMcp } from '../web/mycl-webmcp.js';

const catalog = [
  { id: 'family-letter', name: '가정통신문 작성', keywords: '학부모 현장체험학습 안내 가정통신문' },
  { id: 'lesson-plan', name: '수업 계획 초안', keywords: '수업 계획 지도안 학습' }
];
const jobs = new Map();
const definitions = new Map();
const element = id => document.getElementById(id);
const native = Boolean(document.modelContext?.registerTool && document.modelContext?.executeTool);
let currentJob;

if (!native) {
  document.modelContext = {
    registerTool: async definition => definitions.set(definition.name, definition),
    getTools: async () => [...definitions.values()],
    executeTool: async (definition, args) => definition.execute(args)
  };
}

const app = {
  async searchTools({ query, limit }) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return { tools: catalog.filter(item => words.some(word => `${item.name} ${item.keywords}`.toLowerCase().includes(word))).slice(0, limit) };
  },
  async runTool({ toolId }) {
    const tool = catalog.find(item => item.id === toolId);
    if (!tool) return { status: 'failed', reason: '목록에 없는 도구' };
    const jobId = crypto.randomUUID();
    const draft = `${tool.name}\n\n${element('details').value.trim()}\n\n교사가 내용을 확인하고 수정하세요. (로컬 데모 초안)`;
    const result = { type: 'document', text: draft, resultId: jobId };
    jobs.set(jobId, result);
    currentJob = jobId;
    element('result').disabled = false;
    element('open').disabled = false;
    return { status: 'completed', jobId, result };
  },
  async getResult({ jobId }) {
    const result = jobs.get(jobId);
    return result ? { status: 'completed', jobId, result } : { status: 'failed', reason: '없는 작업 ID' };
  },
  async openEditor({ resultId }) {
    const result = jobs.get(resultId);
    if (!result) return { status: 'failed' };
    element('paper').value = localStorage.getItem(`mycl-demo:${resultId}`) ?? result.text;
    element('editor').hidden = false;
    return { status: 'opened', resultId };
  }
};

const { tools } = await installMyclWebMcp({
  document, app,
  approve: (action, details) => window.confirm(`${action}을(를) 실행할까요?\n${JSON.stringify(details)}`)
});
element('mode').textContent = native ? '브라우저 기본 WebMCP 사용 중' : 'WebMCP 시뮬레이션 테스트 (이 브라우저는 API 미지원)';
element('guide').textContent = native
  ? '등록된 도구는 브라우저 에이전트에서 호출할 수 있습니다. 화면 버튼은 같은 작업 함수를 직접 호출합니다.'
  : '동일한 도구 코드를 페이지 안의 검사기로 호출합니다. 브라우저 기본 WebMCP 검증은 아닙니다.';
element('registered').textContent = `등록한 도구: ${tools.join(', ')}`;

async function invoke(name, args) {
  try {
    const tool = (await document.modelContext.getTools()).find(item => item.name === name);
    if (!tool) throw new Error(`도구를 찾지 못했습니다: ${name}`);
    const result = JSON.parse(await document.modelContext.executeTool(tool, args));
    element('output').textContent = JSON.stringify(result, null, 2);
    return result;
  } catch (error) {
    element('output').textContent = `실패: ${error.message}`;
    return null;
  }
}

async function pageAction(name, args) {
  try {
    if (['mycl_run_tool', 'mycl_open_editor'].includes(name) && !window.confirm(`${name}을(를) 실행할까요?\n${JSON.stringify(args)}`)) return null;
    const result = name === 'mycl_search_tools' ? await app.searchTools(args)
      : name === 'mycl_run_tool' ? await app.runTool(args)
      : name === 'mycl_get_result' ? await app.getResult(args)
      : await app.openEditor(args);
    element('output').textContent = JSON.stringify(result, null, 2);
    return result;
  } catch (error) {
    element('output').textContent = `실패: ${error.message}`;
    return null;
  }
}

element('search').onclick = async () => {
  const args = { query: element('task').value, limit: 5 };
  if (native) await pageAction('mycl_search_tools', args);
  else await invoke('mycl_search_tools', args);
};
element('run').onclick = async () => {
  const args = { toolId: element('tool').value };
  if (native) await pageAction('mycl_run_tool', args);
  else await invoke('mycl_run_tool', args);
};
element('result').onclick = async () => {
  const args = { jobId: currentJob };
  if (native) await pageAction('mycl_get_result', args);
  else await invoke('mycl_get_result', args);
};
element('open').onclick = async () => {
  const args = { resultId: currentJob };
  if (native) await pageAction('mycl_open_editor', args);
  else await invoke('mycl_open_editor', args);
};
element('save').onclick = () => {
  localStorage.setItem(`mycl-demo:${currentJob}`, element('paper').value);
  element('saved').textContent = '브라우저에 저장됨 — 같은 작업에서 다시 열어 확인하세요.';
};
