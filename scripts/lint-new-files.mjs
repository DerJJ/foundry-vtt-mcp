// Lint errors fail the commit for files that are being added; existing files keep their old
// lint debt until they are rewritten. Warnings never fail. Run by the pre-commit hook.
import { execFileSync, spawnSync } from 'node:child_process';

const added = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=A'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(f => /\.(ts|js)$/.test(f) && !f.endsWith('.macro.js') && !f.endsWith('.d.ts'));

if (added.length === 0) process.exit(0);

const run = spawnSync('npx', ['eslint', '--quiet', '--ext', '.ts,.js', ...added], {
  stdio: 'inherit',
  shell: true,
});
process.exit(run.status ?? 1);
