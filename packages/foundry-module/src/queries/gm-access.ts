/**
 * SECURITY: Validate GM access - returns silent failure for non-GM users
 */
export function validateGMAccess(): { allowed: boolean; error?: any } {
  if (!game.user?.isGM) {
    // Silent failure - no error message for non-GM users
    return { allowed: false };
  }
  return { allowed: true };
}
