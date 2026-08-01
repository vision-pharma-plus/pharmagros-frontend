"use client";

import { PASSWORD_RULES, evaluatePassword } from "@/lib/password-policy";
import { useTranslation } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Live checklist of the client-side mirror of the server password policy
 * (`@/lib/password-policy`). Shared by the user form and the admin password
 * reset dialog so the two stay in step.
 *
 * Renders nothing for an empty value: the rules are only relevant once a
 * password is being typed, and showing them against a blank field would
 * contradict the "leave blank to generate" hint the user form puts above it.
 */
export function PasswordChecklist({ value }: { value: string }) {
  const t = useTranslation();

  if (value.length === 0) return null;

  const ruleState = evaluatePassword(value);

  return (
    <div className="rounded-md border border-border p-3">
      <p className="mb-1.5 text-sm font-medium">{t.passwordPolicy.heading}</p>
      {/* Polite live region: rules flip as the user types, and each change
          should be announced without interrupting. */}
      <ul className="space-y-1" aria-live="polite">
        {PASSWORD_RULES.map((rule) => {
          const met = ruleState[rule.id];
          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-2 text-sm",
                met ? "text-success" : "text-muted-foreground",
              )}
            >
              {/* Decorative: colour and glyph both restate the state that the
                  sr-only text carries in words, so colour is never the only
                  signal. */}
              <span aria-hidden="true" className="w-3 text-center">
                {met ? "✓" : "•"}
              </span>
              <span>{t.passwordPolicy[rule.id]}</span>
              <span className="sr-only">
                {met ? t.passwordPolicy.ruleMet : t.passwordPolicy.ruleUnmet}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
