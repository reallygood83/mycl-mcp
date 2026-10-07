import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { NodeStreamableHTTPServerTransport, localhostHostValidation, localhostOriginValidation } from '@modelcontextprotocol/node';
import { MyclApi } from './mycl-api.js';
import { createMyclServer } from './server.js';

const api = new MyclApi({ baseUrl: process.env.MYCL_API_BASE_URL, token: process.env.MYCL_API_TOKEN, webOrigin: process.env.MYCL_WEB_ORIGIN });

if (process.env.MCP_TRANSPORT === 'http') {
  const secret = process.env.MCP_BEARER_TOKEN;
  if (!secret || secret.length < 32) throw new Error('MCP_BEARER_TOKEN must be at least 32 characters');
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  createServer(async (req, res) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
    const provided = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const a = Buffer.from(provided), b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) { res.writeHead(401).end(); return; }
    const server = createMyclServer(api);
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500).end();
    } finally { await server.close(); }
  }).listen(Number(process.env.MCP_PORT ?? 3000), '127.0.0.1');
} else if (!process.env.MCP_TRANSPORT || process.env.MCP_TRANSPORT === 'stdio') {
  await createMyclServer(api).connect(new StdioServerTransport());
} else {
  throw new Error('MCP_TRANSPORT must be stdio or http');
}
