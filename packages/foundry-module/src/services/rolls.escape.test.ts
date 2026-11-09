import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RollService } from './rolls.js';
import { escapeHTML } from '../escape-html.js';

const EVIL = `"><img src=x onerror=alert(1)>`;

function setup() {
  const create = vi.fn(async () => ({ id: 'msg1' }));
  const user = { id: 'u1', name: 'Test', active: true, isGM: false };
  const actor = {
    id: 'a1',
    name: 'Hero',
    testUserPermission: () => true,
    getRollData: () => ({ abilities: {} }),
  };
  vi.stubGlobal('game', {
    ready: true,
    world: { id: 'w' },
    user: { id: 'gm' },
    system: { id: 'dnd5e' },
    users: Object.assign([user], { values: () => [user].values(), filter: () => [] }),
    actors: { find: () => actor },
  });
  vi.stubGlobal('foundry', { utils: { randomID: () => 'btn1' } });
  vi.stubGlobal('ChatMessage', { create, getSpeaker: () => ({}) });
  vi.stubGlobal('CONST', { CHAT_MESSAGE_STYLES: { OTHER: 0 } });
  return { create };
}

describe('roll requests escape what the caller supplies', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => undefined));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps flavor, target and modifier from becoming markup', async () => {
    const { create } = setup();
    const service = new RollService();
    (service as any).saveRollButtonMessageId = vi.fn();
    const result = await service.requestPlayerRolls({
      rollType: 'custom',
      rollTarget: EVIL,
      targetPlayer: 'Test',
      isPublic: true,
      rollModifier: EVIL,
      flavor: `<script>alert(1)</script>${EVIL}`,
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    const html: string = (create.mock.calls[0] as any)[0].content;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain(`"><`);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain(`data-roll-target="${escapeHTML(EVIL)}"`);
  });
});

describe('escapeHTML', () => {
  it('escapes the five characters', () => {
    expect(escapeHTML(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#x27;&amp;&#x27;&lt;/a&gt;'
    );
  });
});
