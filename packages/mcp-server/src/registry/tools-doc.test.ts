import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { createTestOperationCatalog } from '../test-support/create-test-registry.js';
import { DOMAIN_TOOLS } from './domain-tools.js';
import { renderToolsDoc } from './tools-doc.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DOC = path.join(here, '..', '..', '..', '..', 'docs', 'TOOLS.md');
const UPSTREAM = path.join(here, '..', '__golden__', 'upstream-tools.json');

describe('docs/TOOLS.md', () => {
  it('is generated from the domain tool specs and is up to date', () => {
    const upstream = JSON.parse(fs.readFileSync(UPSTREAM, 'utf8')) as string[];
    const current = renderToolsDoc(DOMAIN_TOOLS, createTestOperationCatalog(), upstream);
    if (process.env.UPDATE_GOLDEN === '1') fs.writeFileSync(DOC, current);
    expect(fs.readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n')).toBe(current);
  });
});
