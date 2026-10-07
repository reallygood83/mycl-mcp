const paths = {
  account: '/mcp/account',
  tools: '/mcp/tools',
  run: '/mcp/jobs',
  result: id => `/mcp/jobs/${encodeURIComponent(id)}`,
  editor: id => `/mcp/results/${encodeURIComponent(id)}/editor`,
  export: id => `/mcp/documents/${encodeURIComponent(id)}/export`
};

export class MyclApi {
  constructor({ baseUrl, token, webOrigin = 'https://mycl.io', fetcher = fetch }) {
    if (!baseUrl || !token) throw new Error('MYCL_API_BASE_URL and MYCL_API_TOKEN are required');
    this.base = new URL(baseUrl);
    if (this.base.protocol !== 'https:' && !(this.base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(this.base.hostname))) {
      throw new Error('Mycl API must use HTTPS (or localhost for testing)');
    }
    this.webOrigin = new URL(webOrigin).origin;
    this.token = token;
    this.fetcher = fetcher;
  }

  async request(method, path, body) {
    const url = new URL(path.replace(/^\//, ''), this.base.href.endsWith('/') ? this.base : `${this.base.href}/`);
    const response = await this.fetcher(url, {
      method,
      headers: { authorization: `Bearer ${this.token}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`Mycl API returned HTTP ${response.status}`);
    const result = await response.json();
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid Mycl API response');
    return result;
  }

  account() { return this.request('GET', paths.account); }
  search(query, limit) { return this.request('GET', `${paths.tools}?query=${encodeURIComponent(query)}&limit=${limit}`); }
  getTool(id) { return this.request('GET', `${paths.tools}/${encodeURIComponent(id)}`); }
  run(toolId, inputs, idempotencyKey) { return this.request('POST', paths.run, { tool_id: toolId, inputs, idempotency_key: idempotencyKey }); }
  result(jobId) { return this.request('GET', paths.result(jobId)); }

  async editor(resultId) {
    const result = await this.request('POST', paths.editor(resultId), {});
    this.checkLink(result.url);
    return result;
  }

  async export(draftId, format, revision) {
    const result = await this.request('POST', paths.export(draftId), { format, ...(revision ? { revision } : {}) });
    this.checkLink(result.url);
    return result;
  }

  checkLink(value) {
    if (typeof value !== 'string') throw new Error('Missing result URL');
    const url = new URL(value);
    if (url.protocol !== 'https:' || ![this.webOrigin, this.base.origin].includes(url.origin)) {
      throw new Error('Mycl API returned an untrusted URL');
    }
  }
}
