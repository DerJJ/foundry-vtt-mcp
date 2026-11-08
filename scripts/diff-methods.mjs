// Splits a TypeScript class file into its members (by 2-space indentation) and compares two
// versions: which members are new, removed or changed. Used to port fork changes to the bridge
// services. Usage: node scripts/diff-methods.mjs <oldFile> <newFile> [--json out.json]
import fs from 'fs';

export function members(source) {
  const lines = source.split('\n');
  const out = new Map();
  let i = 0;
  while (i < lines.length) {
    const m = /^  (?:(?:private|public|protected|static|async|readonly)\s+)*([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\(/.exec(lines[i]);
    if (m) {
      // include the doc comment above
      let start = i;
      while (start > 0 && /^\s*(\/\*\*|\*|\*\/|\/\/)/.test(lines[start - 1])) start--;
      let j = i;
      // find the end: a line that is exactly "  }" after the opening
      while (j < lines.length && lines[j] !== '  }') j++;
      const text = lines.slice(start, j + 1).join('\n');
      out.set(m[1], { text, start, end: j });
      i = j + 1;
    } else i++;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('diff-methods.mjs')) {
  const [oldFile, newFile] = process.argv.slice(2);
  const a = members(fs.readFileSync(oldFile, 'utf8'));
  const b = members(fs.readFileSync(newFile, 'utf8'));
  const added = [];
  const changed = [];
  const removed = [];
  for (const [name, m] of b) {
    if (!a.has(name)) added.push([name, m.text.split('\n').length]);
    else if (a.get(name).text.replace(/\s+/g, ' ') !== m.text.replace(/\s+/g, ' ')) {
      changed.push([name, a.get(name).text.split('\n').length, m.text.split('\n').length]);
    }
  }
  for (const name of a.keys()) if (!b.has(name)) removed.push(name);
  console.log(`old ${a.size} members, new ${b.size}`);
  console.log('ADDED', added.length);
  for (const [n, l] of added) console.log('  +', n, l);
  console.log('CHANGED', changed.length);
  for (const [n, x, y] of changed) console.log('  ~', n, `${x} -> ${y} lines`);
  console.log('REMOVED', removed.join(', ') || '(none)');
}
