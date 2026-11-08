/**
 * Verification status of each game system's pack (ADR-0006). `verified` means a live world of
 * that system has been walked through every action; anything else is covered by tests only.
 */
export interface SystemVerification {
  status: 'verified' | 'unverified';
  /** The versions it was last checked against, for a verified system. */
  checkedAgainst?: string;
}

export const SYSTEM_VERIFICATION: Readonly<Record<string, SystemVerification>> = {
  pf2e: { status: 'verified', checkedAgainst: 'pf2e 8.7.0 on Foundry 14' },
  dnd5e: { status: 'verified', checkedAgainst: 'dnd5e 6.0.6 on Foundry 14' },
  dsa5: { status: 'unverified' },
  wfrp4e: { status: 'unverified' },
  'cosmere-rpg': { status: 'unverified' },
  mgt2e: { status: 'unverified' },
};

export function verificationOf(system: string): 'verified' | 'unverified' {
  return SYSTEM_VERIFICATION[system]?.status ?? 'unverified';
}
