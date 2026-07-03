/**
 * Simple in-memory challenge store keyed by username.
 * Adequate for single-instance deployments (dev + Railway).
 * For multi-instance production, replace with Redis or DB-backed store.
 */
const challenges = new Map<string, string>();

export const challengeStore = {
  set(username: string, challenge: string): void {
    challenges.set(username, challenge);
  },
  get(username: string): string | undefined {
    return challenges.get(username);
  },
  delete(username: string): void {
    challenges.delete(username);
  },
};
