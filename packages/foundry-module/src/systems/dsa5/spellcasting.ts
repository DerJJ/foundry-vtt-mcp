/**
 * Extract spell targeting info for DSA5
 * DSA5 spells have: targetCategory, range, etc.
 */
export function extractDSA5SpellTargeting(spellSystem: any): {
  range?: string;
  target?: string;
  area?: string;
} {
  const result: { range?: string; target?: string; area?: string } = {};

  // Range
  const rangeValue = spellSystem?.range?.value || spellSystem?.Reichweite;
  if (rangeValue) {
    result.range = String(rangeValue);
  }

  // Target category
  const targetCategory = spellSystem?.targetCategory?.value || spellSystem?.Zielkategorie;
  if (targetCategory) {
    result.target = String(targetCategory);
  }

  // Area (Wirkungsbereich)
  const areaValue = spellSystem?.effectRadius?.value || spellSystem?.Wirkungsbereich;
  if (areaValue) {
    result.area = String(areaValue);
  }

  return result;
}
