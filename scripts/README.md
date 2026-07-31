# i18n coverage scanner

Finds UI text that will not follow the locale switch.

```bash
npm run i18n:scan    # report only
npm run i18n:fix     # report + scaffold the missing dictionary keys
```

## What it reports

| Category | Meaning |
| --- | --- |
| `hardcoded` | A literal string rendered straight into JSX. Stays in whichever language it was typed in, whatever the user picks. |
| `missing` | A key present in `fr` but absent from `en`. |
| `identical` | The English value is byte-identical to the French one and is not a known cognate. |
| `todo` | A value still carrying the `TODO` marker written by `--fix`. |
| `orphan` | A key in `en` with no counterpart in `fr`. |

Exit code is non-zero when anything is found, so it works as a CI gate:

```bash
npm run i18n:scan || exit 1
```

## What it deliberately ignores

**Proper nouns are never translatable** and are excluded by the `PROPER_NOUN`
rules in [i18n-scan.mjs](i18n-scan.mjs):

- People's names — `Jean Nkurunziza`, `Marie-Claire Ndayishimiye`
- Places — `Bujumbura`, `Ngozi`, and the other provinces
- Companies and manufacturers — anything with `Ltd`, `S.A.R.L`, `Pharma`, `Laboratoires`
- Dosages and units — `500 mg`, `5 mg/ml`
- Codes and identifiers — `SKU-001`, `BL-2024`

The rule that separates a name from UI copy is capitalisation: proper nouns
capitalise every word (`Jean Nkurunziza`), while UI copy is sentence case
(`Nouveau client`). Sentence-case French phrases are still reported.

Also ignored: URLs and emails (`NOT_COPY`), the language names `Français` and
`English` in the locale switcher — a French speaker looks for "Français", not
"French" — plus currency codes and true French/English cognates such as
`Date`, `Catalogue` and `Solution` (`ALLOWED_IDENTICAL`).

Names that arrive from the API as data are never scanned at all: they appear in
JSX as `{customer.name}` expressions rather than as literal text.

## Adding an exclusion

If the scanner flags something that genuinely should not be translated, add it
to `ALLOWED_IDENTICAL` (dictionary values) or `ALLOWED_HARDCODED` (literal JSX)
near the top of the script, with a comment saying why.

## Why `--fix` does not translate

`--fix` writes `TODO <french text>` rather than an English guess, and the next
scan fails on that marker. A wrong machine translation that silently reaches
users is worse than a marker that blocks until someone reviews the wording —
which matters here, since mistranslating a dosage form or a payment term is a
safety and billing problem, not a cosmetic one.
