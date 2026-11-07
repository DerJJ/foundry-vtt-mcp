/**
 * Format PF2e action cost to human-readable string
 */
export function formatPF2eActionCost(actionValue: any): string | undefined {
  if (!actionValue) return undefined;
  if (typeof actionValue === 'number') {
    return actionValue === 1 ? '1 action' : `${actionValue} actions`;
  }
  if (actionValue === 'reaction') return 'reaction';
  if (actionValue === 'free') return 'free action';
  return String(actionValue);
}
/**
 * Extract PF2e spell slots from spellcasting entry data
 */
export function extractPF2eSpellSlots(
  entryData: any
): Record<string, { value: number; max: number }> | undefined {
  const slots: Record<string, { value: number; max: number }> = {};

  // PF2e stores slots per rank
  for (let rank = 1; rank <= 10; rank++) {
    const slotKey = `slot${rank}`;
    const slotData = entryData?.slots?.[slotKey] || entryData?.[slotKey];
    if (slotData && (slotData.max > 0 || slotData.value > 0)) {
      slots[`rank${rank}`] = {
        value: slotData.value ?? 0,
        max: slotData.max ?? 0,
      };
    }
  }

  return Object.keys(slots).length > 0 ? slots : undefined;
}
/**
 * Extract spell targeting info for PF2e
 * PF2e spells have: target (string), range.value, area.type, area.value
 */
export function extractPF2eSpellTargeting(spellSystem: any): {
  range?: string;
  target?: string;
  area?: string;
} {
  const result: { range?: string; target?: string; area?: string } = {};

  // Range (e.g., "30 feet", "touch")
  const rangeValue = spellSystem?.range?.value;
  if (rangeValue) {
    result.range = String(rangeValue);
  }

  // Target (PF2e has a descriptive target string)
  const targetValue = spellSystem?.target?.value;
  if (targetValue) {
    result.target = String(targetValue);
  }

  // Area (e.g., "15-foot emanation", "30-foot cone")
  const areaType = spellSystem?.area?.type;
  const areaValue = spellSystem?.area?.value;
  if (areaType) {
    if (areaValue) {
      result.area = `${areaValue}-foot ${areaType}`;
    } else {
      result.area = areaType;
    }
    // If has area but no explicit target, it's an area spell
    if (!result.target) {
      result.target = 'area';
    }
  }

  return result;
}
