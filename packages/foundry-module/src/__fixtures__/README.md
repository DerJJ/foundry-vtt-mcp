# Fixtures from live worlds

Real actors, items, chat messages and a scene, exported from a Foundry world. Tests that use them
check behaviour against what Foundry actually produces instead of against shapes we made up.

## Capture

1. In the world, as the GM, create a **Script** macro with the contents of
   [`scripts/export-fixtures.macro.js`](../../../../scripts/export-fixtures.macro.js) and run it.
2. Open the downloaded `fixtures-<system>-<version>.json` and read through it. User ids,
   ownership, secrets and audit data are removed, but notes and biographies are not. Delete
   anything you do not want in a public repository.
3. Move the file here, for example `__fixtures__/pf2e-8.6.1.json`.

## Use

```ts
import { loadFixtures } from '../test-support/load-fixtures.js';

const fixtures = loadFixtures('pf2e');
describe.skipIf(!fixtures)('against a real pf2e world', () => {
  it('...', () => {
    const actor = fixtures!.actors.find(a => a.type === 'character');
  });
});
```

A test written this way is skipped when the fixture is not there, so the suite also runs on a
checkout without fixtures.
