/**
 * Path: packages/core/src/tools/blocklist.ts
 * Purpose: Bash command blocklist (PRD 2.19 + anti-pattern #10). Matched
 *          commands are hard-denied BEFORE spawning a shell. False positives
 *          are acceptable; false negatives are not.
 * Dependencies: @tagent-office/shared
 */
import { err, ok, type Result } from '@tagent-office/shared';
import { PermissionError } from '@tagent-office/shared';

/** One blocklist rule. */
export interface BlockRule {
  id: string;
  pattern: RegExp;
  reason: string;
}

/**
 * The blocklist. Patterns are intentionally simple and greedy on safety:
 * - `rm` with flags targeting an absolute/home path is always blocked
 *   (the workspace jail only protects relative paths inside the root).
 * - Remote downloads piped into any shell flavor are blocked.
 */
export const BASH_BLOCKLIST: readonly BlockRule[] = [
  {
    id: 'rm-flags-absolute',
    pattern: /\brm\s+(?:(?:-{1,2}[A-Za-z][A-Za-z-]*)\s+)+(?:\/|~)/,
    reason: 'rm with flags targeting an absolute or home path',
  },
  {
    id: 'rm-root',
    pattern: /\brm\s+\/\S*/,
    reason: 'rm targeting an absolute path',
  },
  {
    id: 'curl-pipe-shell',
    pattern: /\b(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/,
    reason: 'piping a remote download straight into a shell',
  },
  {
    id: 'fork-bomb',
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    reason: 'fork bomb',
  },
  {
    id: 'dd-dev-zero',
    pattern: /\bdd\b[^;|&]*\bif=\/dev\/(?:zero|random)/,
    reason: 'dd from /dev/zero or /dev/random',
  },
  {
    id: 'raw-device-write',
    pattern: />\s*\/dev\/(?:sd[a-z]|hd[a-z]|nvme\d+n?\d*|disk)/,
    reason: 'redirecting output to a raw disk device',
  },
  {
    id: 'mkfs',
    pattern: /\bmkfs(?:\.[a-z0-9]+)?\b/,
    reason: 'filesystem formatting',
  },
  {
    id: 'shutdown-family',
    pattern: /\b(?:shutdown|reboot|halt|poweroff)\b/,
    reason: 'system power control',
  },
  {
    id: 'chmod-777-root',
    pattern: /\bchmod\b[^;|&]*\s777\s+\/\S*/,
    reason: 'chmod 777 on a root-level path',
  },
  {
    id: 'chown-recursive-root',
    pattern: /\bchown\b[^;|&]*-R[^;|&]*\s+\/\S*/,
    reason: 'recursive chown on an absolute path',
  },
  {
    id: 'kill-all',
    pattern: /\bkill\s+(?:-[A-Za-z0-9]+\s+)?-1\b/,
    reason: 'kill signals to the entire process group',
  },
];

/** Returns the first matching rule, or null when the command looks safe. */
export function findBlockedRule(command: string): BlockRule | null {
  for (const rule of BASH_BLOCKLIST) {
    if (rule.pattern.test(command)) return rule;
  }
  return null;
}

/** Hard gate for the bash tool. */
export function checkBashCommand(command: string): Result<null, PermissionError> {
  const rule = findBlockedRule(command);
  if (rule === null) return ok(null);
  return err(
    new PermissionError(`Bash command blocked by rule "${rule.id}": ${rule.reason}`, {
      ruleId: rule.id,
      command,
    }),
  );
}
