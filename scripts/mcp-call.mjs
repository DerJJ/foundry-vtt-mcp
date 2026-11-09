// Calls domain tools through a real MCP connection and prints the answers, for trying things by
// hand against the connected world. Needs the built server and the bridge connected in a GM browser.
//
//   node scripts/mcp-call.mjs '[["world","info"],["actors","list",{"limit":5}]]'
//
// Each call is [tool, action, params]. Calls run in order; a failing call prints its error and the
// run goes on.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const calls = JSON.parse(process.argv[2] ?? '[]');
const limit = Number(process.env.MCP_CALL_MAX ?? 1500);

const client = new Client({ name: 'mcp-call', version: '1.0.0' });
await client.connect(
  new StdioClientTransport({ command: 'node', args: [path.join(root, 'packages/mcp-server/dist/index.js')] })
);

const deadline = Date.now() + 300_000;
for (;;) {
  const r = await client.callTool({ name: 'world', arguments: { action: 'capabilities' } });
  if (!r.isError) break;
  if (Date.now() > deadline) {
    console.log('The bridge did not connect within 5 minutes.');
    process.exit(1);
  }
  await new Promise(resolve => setTimeout(resolve, 3000));
}

for (const [tool, action, params = {}] of calls) {
  const response = await client.callTool({ name: tool, arguments: { action, params } });
  const text = (response.content ?? []).map(part => part.text ?? '').join('\n');
  const shown = text.length > limit ? `${text.slice(0, limit)}… (${text.length} characters)` : text;
  console.log(`\n## ${tool}.${action} ${JSON.stringify(params).slice(0, 120)}\n${response.isError ? 'ERROR: ' : ''}${shown}`);
}
await client.close();
process.exit(0);
