/**
 * Client-side mirror of the phone rules.
 *
 * The authority is `validate_phone` / `normalise_phone` in
 * apps/core/validators.py. Mirrored here so a mistyped number is caught in the
 * form rather than coming back as a 400. The server still validates and
 * normalises independently.
 *
 * Accepts an international number in E.164 form (optional '+', 7 to 15 digits,
 * first digit non-zero) or a bare 8-digit Burundi local number. Spaces,
 * hyphens, dots, slashes and parentheses may appear anywhere — the same
 * separators the server strips.
 */

const SEPARATORS = /[\s\-(). /]/g;
const PHONE_PATTERN = /^\+?[1-9][0-9]{6,14}$/;
const BURUNDI_LOCAL_PATTERN = /^[0-9]{8}$/;
const BURUNDI_DIALLING_CODE = "257";

export function isValidPhone(value: string): boolean {
  if (!value) return true; // Optional field: blank is valid.
  const cleaned = value.replace(SEPARATORS, "");
  return BURUNDI_LOCAL_PATTERN.test(cleaned) || PHONE_PATTERN.test(cleaned);
}

/** Canonical E.164 form, matching the server's normalise_phone. */
export function normalisePhone(value: string): string {
  if (!value) return "";
  const cleaned = value.replace(SEPARATORS, "").replace(/^\+/, "");
  if (!cleaned) return "";
  if (BURUNDI_LOCAL_PATTERN.test(cleaned)) {
    return `+${BURUNDI_DIALLING_CODE}${cleaned}`;
  }
  return `+${cleaned}`;
}
