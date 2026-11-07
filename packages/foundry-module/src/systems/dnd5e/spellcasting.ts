/**
 * Extract D&D 5e spell slots from actor system data
 */
export function extractDnD5eSpellSlots(
  spellsData: any
): Record<string, { value: number; max: number }> | undefined {
  const slots: Record<string, { value: number; max: number }> = {};

  // D&D 5e stores slots as spell1, spell2, etc.
  for (let level = 1; level <= 9; level++) {
    const slotKey = `spell${level}`;
    const slotData = spellsData?.[slotKey];
    if (slotData && (slotData.max > 0 || slotData.value > 0)) {
      slots[`level${level}`] = {
        value: slotData.value ?? 0,
        max: slotData.max ?? 0,
      };
    }
  }

  // Also check for pact slots (warlock)
  const pactSlot = spellsData?.pact;
  if (pactSlot && (pactSlot.max > 0 || pactSlot.value > 0)) {
    slots['pact'] = {
      value: pactSlot.value ?? 0,
      max: pactSlot.max ?? 0,
    };
  }

  return Object.keys(slots).length > 0 ? slots : undefined;
}
/**
 * Extract spell targeting info for D&D 5e
 * D&D 5e spells have: target.type ("self", "creature", "point", etc.), range.value, range.units
 */
export function extractDnD5eSpellTargeting(spellSystem: any): {
  range?: string;
  target?: string;
  area?: string;
} {
  const result: { range?: string; target?: string; area?: string } = {};

  // Range (e.g., "60 feet", "Self", "Touch")
  const rangeValue = spellSystem?.range?.value;
  const rangeUnits = spellSystem?.range?.units;
  if (rangeUnits === 'self') {
    result.range = 'Self';
  } else if (rangeUnits === 'touch') {
    result.range = 'Touch';
  } else if (rangeUnits === 'spec') {
    result.range = spellSystem?.range?.special || 'Special';
  } else if (rangeValue && rangeUnits) {
    result.range = `${rangeValue} ${rangeUnits}`;
  }

  // Target type (e.g., "1 creature", "self", "area")
  const targetType = spellSystem?.target?.type;
  const targetValue = spellSystem?.target?.value;
  if (targetType === 'self') {
    result.target = 'self';
  } else if (targetType === 'creature' || targetType === 'ally' || targetType === 'enemy') {
    result.target = targetValue
      ? `${targetValue} ${targetType}${targetValue > 1 ? 's' : ''}`
      : targetType;
  } else if (targetType === 'object') {
    result.target = targetValue ? `${targetValue} object${targetValue > 1 ? 's' : ''}` : 'object';
  } else if (targetType === 'space' || targetType === 'point') {
    result.target = 'point';
  } else if (targetType) {
    result.target = targetType;
  }

  // Area (for AoE spells - e.g., "20-foot radius", "30-foot cone")
  const areaType = spellSystem?.target?.template?.type;
  const areaSize = spellSystem?.target?.template?.size;
  const areaUnits = spellSystem?.target?.template?.units || 'ft';
  if (areaType && areaSize) {
    result.area = `${areaSize}-${areaUnits} ${areaType}`;
    // If spell has area, target is usually "area"
    if (!result.target || result.target === 'point') {
      result.target = 'area';
    }
  }

  return result;
}
