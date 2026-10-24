/**
 * Pure helpers for prefix-preserving elapsed-time typewriter progression.
 */

export function commonPrefixLength(a: string, b: string): number {
  const minLen = Math.min(a.length, b.length);
  let i = 0;
  while (i < minLen && a.charCodeAt(i) === b.charCodeAt(i)) {
    i++;
  }
  return i;
}

export interface TypewriterStep {
  text: string;
  done: boolean;
}

/**
 * Given the preserved prefix length when a transition started and elapsed milliseconds,
 * deterministically computes the visible substring of `targetText`.
 */
export function computeTypewriterStep(
  targetText: string,
  startPrefixLen: number,
  elapsedMs: number,
  msPerChar: number = 18
): TypewriterStep {
  if (targetText.length === 0) {
    return { text: '', done: true };
  }
  const safeStart = Math.max(0, Math.min(startPrefixLen, targetText.length));
  const addedChars = Math.max(0, Math.floor(elapsedMs / msPerChar));
  const visibleCount = Math.min(targetText.length, safeStart + addedChars);
  return {
    text: targetText.slice(0, visibleCount),
    done: visibleCount >= targetText.length,
  };
}
