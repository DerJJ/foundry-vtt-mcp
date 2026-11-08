import { SYSTEM_VERIFICATION } from '../systems/verification.js';
import type { ActionSpec, DomainToolSpec, OperationCatalog } from './domain-tool.js';

type Schema = { properties?: Record<string, unknown>; required?: string[] };

function parametersOf(spec: ActionSpec, catalog: OperationCatalog): string {
  const operation = spec.operation ? catalog.get(spec.operation) : undefined;
  const schema = (operation?.definition.inputSchema ?? {}) as Schema;
  const all = Object.keys(schema.properties ?? {});
  const fixed = new Set(Object.keys(spec.fixed ?? {}));
  const names = (spec.params ? Object.keys(spec.params) : all).filter(k => !fixed.has(k));
  const required = new Set(
    spec.params
      ? Object.entries(spec.params)
          .filter(([, isRequired]) => isRequired)
          .map(([key]) => key)
      : (schema.required ?? [])
  );
  const parts = names.map(k => (required.has(k) ? `**${k}**` : k));
  if (spec.paged) parts.push('limit', 'offset');
  return parts.length ? parts.join(', ') : '(none)';
}

function oneLine(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

/**
 * The reference of every domain tool, generated from the specs so that it cannot drift from the
 * code (`docs/TOOLS.md`). The test in `tools-doc.test.ts` fails when the file is out of date.
 */
export function renderToolsDoc(
  tools: readonly DomainToolSpec[],
  catalog: OperationCatalog,
  upstreamTools: readonly string[]
): string {
  const out: string[] = [
    '# Tools',
    '',
    'Generated from `packages/mcp-server/src/registry/domain-tools.ts`; do not edit by hand. Regenerate with `UPDATE_GOLDEN=1 npm -w @foundry-mcp/server test`.',
    '',
    'Every tool takes `{ "action": "...", "params": { ... } }`. `{ "action": "describe" }` lists the actions of the connected world\'s game system, and `{ "action": "describe", "params": { "action": "..." } }` returns the full parameter schema of one action. Required parameters are in **bold**.',
    '',
    'Every action has a **risk**. The world setting *Access level* decides which are allowed: *Read only* allows `read`; *Read & write* (the default) also allows `write`; *Full access* also allows `delete`. `execute` needs its own checkbox. See [ADR-0005](adr/0005-access-levels-and-action-risk.md).',
    '',
  ];

  for (const tool of tools) {
    out.push(`## \`${tool.name}\``, '', tool.purpose, '');
    out.push(
      '| Action | Risk | Game system | Parameters | Does |',
      '| --- | --- | --- | --- | --- |'
    );
    for (const [name, spec] of Object.entries(tool.actions)) {
      const operation = spec.operation ? catalog.get(spec.operation) : undefined;
      const summary =
        spec.summary ?? (operation?.definition.description ?? '').split(/(?<=[.!?])\s/)[0] ?? '';
      out.push(
        `| \`${name}\` | ${spec.risk} | ${spec.systems ? spec.systems.join(', ') : 'all'} | ${oneLine(parametersOf(spec, catalog))} | ${oneLine(summary)} |`
      );
    }
    out.push('');
  }

  out.push(
    '## Game systems',
    '',
    'Code for one game system lives in a pack ([ADR-0006](adr/0006-game-systems-as-packs.md)). *Verified* means a live world of that system has been walked through every action.',
    '',
    '| System | Status | Checked against |',
    '| --- | --- | --- |'
  );
  for (const [id, info] of Object.entries(SYSTEM_VERIFICATION)) {
    out.push(`| ${id} | ${info.status} | ${info.checkedAgainst ?? '-'} |`);
  }
  out.push('');

  out.push(
    '## Migration from the 50 tools of v0.8.6',
    '',
    'The old tool names are gone (no aliases). Each one is now an action of a domain tool.',
    '',
    '| Old tool | Now | Fixed argument |',
    '| --- | --- | --- |'
  );
  const where = new Map<string, string[]>();
  for (const tool of tools) {
    for (const [name, spec] of Object.entries(tool.actions)) {
      if (!spec.operation) continue;
      const fixed = spec.fixed
        ? Object.entries(spec.fixed)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(', ')
        : '';
      const entry = `${tool.name} \`${name}\`|${fixed}`;
      where.set(spec.operation, [...(where.get(spec.operation) ?? []), entry]);
    }
  }
  for (const old of upstreamTools) {
    for (const entry of where.get(old) ?? ['(not mapped)|']) {
      const [now, fixed] = entry.split('|');
      out.push(`| \`${old}\` | ${now} | ${fixed || '-'} |`);
    }
  }
  out.push('');
  return out.join('\n');
}
