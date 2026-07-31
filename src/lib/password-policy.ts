/**
 * Client-side mirror of the server password policy.
 *
 * The authority is `apps/accounts/validators.py` plus Django's own validators
 * (AUTH_PASSWORD_VALIDATORS in config/settings/base.py). Duplicating the rules
 * here is deliberate: it lets the form show what is required *before* save and
 * block submission, rather than making the user discover the policy through a
 * 400. The server still enforces everything independently — this is a
 * usability affordance, not a security control.
 *
 * Two server rules are intentionally not reproduced: "too common" (a 20k-word
 * list) and "too similar to personal information". Those still come back as
 * server field errors, which the forms already render.
 */

export const PASSWORD_MIN_LENGTH = 12;

export type PasswordRuleId =
  | "minLength"
  | "uppercase"
  | "lowercase"
  | "digit"
  | "symbol";

export interface PasswordRule {
  id: PasswordRuleId;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "minLength", test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { id: "uppercase", test: (v) => /[A-Z]/.test(v) },
  { id: "lowercase", test: (v) => /[a-z]/.test(v) },
  { id: "digit", test: (v) => /[0-9]/.test(v) },
  { id: "symbol", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** Which rules the given value currently satisfies. */
export function evaluatePassword(value: string): Record<PasswordRuleId, boolean> {
  return PASSWORD_RULES.reduce(
    (acc, rule) => ({ ...acc, [rule.id]: rule.test(value) }),
    {} as Record<PasswordRuleId, boolean>,
  );
}

export function isPasswordValid(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}
