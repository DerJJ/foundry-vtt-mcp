// Starts the built backend bundle and checks its control channel: the tool list must equal the
// golden snapshot, and calls must be routed (an unknown tool is an error, a real one reaches the
// Foundry connector). Run `npm run build:release` first.
import { spawn } from 'child_process';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'packages/mcp-server/dist/backend.bundle.cjs');
const golden = path.join(root, 'packages/mcp-server/src/__golden__/tools-list.json');
const child = spawn('node', [bundle], { stdio: 'ignore' });
const ask = (method, params) => new Promise((resolve, reject) => {
  const s = net.connect(31414, '127.0.0.1');
  let buf = '';
  s.on('connect', () => s.write(JSON.stringify({ id: '1', method, params }) + '\n'));
  s.on('data', d => { buf += d; if (buf.includes('\n')) { s.end(); resolve(JSON.parse(buf)); } });
  s.on('error', reject);
});
let ok = false;
try {
  let res;
  for (let i = 0; i < 40; i++) { try { res = await ask('ping'); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
  const tools = (await ask('list_tools')).result.tools;
  const gold = JSON.parse(fs.readFileSync(golden, 'utf8'));
  const identical = JSON.stringify(tools) === JSON.stringify(gold);
  console.log('tools', tools.length, 'identical to golden:', identical);
  if (!identical) throw new Error('tools/list differs from the golden snapshot');
  const unk = await ask('call_tool', { name: 'nope', args: {} });
  console.log('unknown tool ->', JSON.stringify(unk.result));
  const real = await ask('call_tool', { name: 'get-world-info', args: {} });
  console.log('real tool (no Foundry) ->', JSON.stringify(real.result).slice(0, 160));
  ok = true;
} finally { child.kill(); }
console.log(ok ? '[Backend smoke test] PASS' : '[Backend smoke test] FAIL');
process.exit(ok ? 0 : 1);
