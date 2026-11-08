# Tool surface today (upstream v0.8.6, unchanged by iteration 1)

Input for the tool-style decision in iteration 2. Measured from the golden snapshot.

- 50 tools; descriptions total 17,288 characters; input schemas total 57,336 characters.
  That is sent to the model's context in every session that loads the server (roughly 20k tokens).
- Heaviest: `dnd5e-add-feature` (34 properties, 2,294-character description), `dnd5e-add-features-from-compendium`
  (1,781), `manage-world-items` (10 properties, 7 actions), `dnd5e-create-npc` (34 properties).
- Already action-style: `manage-actors`, `manage-effects`, `manage-world-items`, `manage-playlists`.
- Same job under several names: ownership (3 tools), tokens (5), maps (3), scenes (2), quests (4),
  compendium reads (5), system-specific creation (`dnd5e-*`, `wfrp4e-*`, `*-dsa5-*`).
- Bridge queries the server never sends: `deleteTokens`, `getAvailableConditions`, `getEnhancedCreatureIndex`,
  `getTokenDetails`, `moveToken`, `toggleTokenCondition`, `updateToken` (camelCase twins of the kebab-case token
  queries it does use), `updateCampaignProgress`, `validateWritePermissions`.
- Live findings to fix on the way: #2 playlist create, #3 PF2e effect create, #4 stale system cache.
