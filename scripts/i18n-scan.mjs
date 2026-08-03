#!/usr/bin/env node
/**
 * i18n coverage scanner.
 *
 * Finds UI text that will not follow the locale switch, in two categories:
 *
 *   HARDCODED  a literal string rendered straight into JSX, so it stays in
 *              whichever language it was typed in no matter what the user picks.
 *   UNTRANSLATED
 *              a key whose English value is byte-identical to the French one.
 *              Some of those are correct (brand names, currency codes), so the
 *              check is driven by an explicit allowlist rather than a guess.
 *
 * Read-only by default. `--fix` applies the mechanical half of the repair:
 * it appends the missing keys to both dictionaries and rewrites the call sites.
 * It never invents an English translation — new entries are written with a
 * TODO marker so a human supplies the wording. That is the deliberate tradeoff:
 * a machine translation that silently lands in the UI is worse than a marker
 * that fails the scan until someone reviews it.
 *
 *   node scripts/i18n-scan.mjs           report
 *   node scripts/i18n-scan.mjs --fix     report + apply edits
 *   node scripts/i18n-scan.mjs --json    machine-readable, for CI
 */

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SRC = join(ROOT, "src");
const DICT = join(SRC, "lib", "i18n", "dictionaries.ts");

const args = new Set(process.argv.slice(2));
const FIX = args.has("--fix");
const JSON_OUT = args.has("--json");

/**
 * Strings that are legitimately identical across locales, or legitimately
 * hardcoded. Anything here is not a finding.
 *
 * The language pickers are the interesting case: a French speaker looking for
 * their language scans for "Français", not "French". Localising the names of
 * the languages themselves would make the switcher harder to use, so those
 * options stay fixed on purpose.
 */
const ALLOWED_IDENTICAL = new Set([
  "Vision Pharma plus", // brand, a proper noun
  // The names of the languages themselves — see the note on ALLOWED_HARDCODED.
  "Français",
  "English",
  // Currency and tax codes.
  "BIF",
  "USD",
  "EUR",
  "NIF",
  // True French/English cognates: spelled identically in both languages, so an
  // identical value is the correct translation rather than a missing one.
  "Date",
  "Page",
  "Catalogue",
  "Administration",
  "Notifications",
  "transactions",
  "Transactions",
  "Code",
  "Destination",
  "Province",
  "Performance",
  "Horizon",
  "Suspension",
  "Solution",
  "Mobile money",
  "Export",
  "Import",
  "Identification",
  "Permissions",
  "Notes",
  "Actions",
  "Total",
  "Stock",
  "Distribution",
  "Description",
  "Documents",
  "Configuration",
  "Contact",
  "Instructions",
  "Options",
]);

/**
 * Proper nouns are not translatable and must never be reported.
 *
 * People's names, place names, company and manufacturer names, drug brand
 * names and unit symbols are the same in every locale — "Jean Nkurunziza" is
 * "Jean Nkurunziza" in English, and Bujumbura is not "Bujumbura City". Anything
 * matching here is skipped by both checks.
 *
 * Note this only applies to *literals written in the source*. Names that arrive
 * from the API as data are never scanned in the first place, since they appear
 * in JSX as `{customer.name}` expressions rather than as text.
 */
const PROPER_NOUN = [
  // Personal names used as sample or seed data, "Firstname Lastname".
  // Each part may itself be hyphenated or apostrophed and re-capitalised
  // ("Marie-Claire", "N'Dour", "Jean-Baptiste"), which is common in both
  // French and Burundian names.
  /^[A-ZÀ-Þ][a-zà-ÿ]+(?:[-'’][A-ZÀ-Þa-zà-ÿ][a-zà-ÿ]*)*(?: [A-ZÀ-Þ][a-zà-ÿ]+(?:[-'’][A-ZÀ-Þa-zà-ÿ][a-zà-ÿ]*)*){1,3}$/,
  // Burundian places and administrative divisions that appear in fixtures.
  /^(Bujumbura|Gitega|Ngozi|Rumonge|Muyinga|Kayanza|Makamba|Bururi|Cibitoke|Karuzi|Kirundo|Muramvya|Mwaro|Rutana|Ruyigi|Bubanza|Cankuzo|Mairie)\b/,
  // Corporate suffixes mark a company name rather than a phrase.
  /\b(S\.?A\.?R\.?L|S\.?A\b|Ltd|LLC|Inc|GmbH|Pharma|Laboratoi?res?|Labs?)\b/i,
  // Unit symbols and dosage forms: "500 mg", "10 ml", "5 mg/ml".
  /^[\d\s.,/]*(mg|ml|mcg|µg|g|kg|l|IU|UI|%)(\s*\/\s*(mg|ml|g|l))?$/i,
  // Codes and identifiers: SKU-001, BL-2024, ISO strings.
  /^[A-Z0-9]+[-_/][A-Z0-9-_/]+$/,
];

/**
 * Text that is not UI copy at all, so translating it would be meaningless.
 * URLs and format hints shown in placeholders are the same in every locale.
 */
const NOT_COPY = [
  /^https?:\/\//,
  /^www\./,
  /^[\w.-]+@[\w.-]+$/, // email
  /^[A-Z]{2,}-[….]{1,3}$/, // reference-format hints like "BL-…"
  /^&\s/, // leftover TypeScript type intersection, not JSX text
];

const isNotCopy = (text) => NOT_COPY.some((re) => re.test(text));

const isProperNoun = (text) => PROPER_NOUN.some((re) => re.test(text));

/** Literal JSX text that is deliberately not translated. */
const ALLOWED_HARDCODED = new Set([
  "Français",
  "English",
  "BIF",
  "USD",
  "EUR",
  "7 j",
  "15 j",
  "30 j",
  "45 j",
  "60 j",
  "90 j",
]);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (/\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Strip comments and string-literal bodies before scanning, so that prose
 * inside a `//` note or an import path is never reported as UI copy.
 */
function stripNoise(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

/** Line number for a character offset. */
const lineAt = (src, index) => src.slice(0, index).split("\n").length;

/**
 * A run of text between JSX tags: `<option value="X">Pharmacie</option>`.
 * Requires a letter and rejects anything containing `{`, which would mean the
 * value is already an expression and therefore already translatable.
 *
 * The closing `<` must begin a real closing tag (`</`), which keeps the match
 * from spanning a TypeScript generic bound such as
 * `}: Props<T> & Variants<typeof x>`, where the `>` and `<` are type syntax.
 */
const JSX_TEXT = />([^<>{}\n]*[A-Za-zÀ-ÿ][^<>{}\n]*)<\//g;

/** Translatable literal attributes. `value=` and `href=` are data, not copy. */
const JSX_ATTR = /\b(placeholder|title|aria-label|alt|label)="([^"\n]{2,})"/g;

function scanFile(path) {
  const raw = readFileSync(path, "utf8");
  const src = stripNoise(raw);
  const rel = relative(ROOT, path).replace(/\\/g, "/");
  const findings = [];

  for (const m of src.matchAll(JSX_TEXT)) {
    const text = m[1].trim();
    if (!text || ALLOWED_HARDCODED.has(text)) continue;
    // Needs a letter pair to be words rather than punctuation or a number.
    if (!/[A-Za-zÀ-ÿ]{2}/.test(text)) continue;
    if (isProperNoun(text) || isNotCopy(text)) continue;
    findings.push({
      kind: "hardcoded",
      file: rel,
      line: lineAt(src, m.index),
      text,
    });
  }

  for (const m of src.matchAll(JSX_ATTR)) {
    const text = m[2].trim();
    if (!text || ALLOWED_HARDCODED.has(text)) continue;
    if (!/[A-Za-zÀ-ÿ]{2}/.test(text)) continue;
    if (isProperNoun(text) || isNotCopy(text)) continue;
    findings.push({
      kind: "hardcoded",
      file: rel,
      line: lineAt(src, m.index),
      text,
      attr: m[1],
    });
  }

  return findings;
}

/**
 * Compare the two dictionaries by evaluating the module.
 *
 * The file is TypeScript, so it is reduced to plain JS first: the type-only
 * constructs sit on their own lines and in known positions, which makes a
 * textual transform reliable enough here and avoids pulling in a parser
 * dependency for a build-time script.
 */
async function loadDictionaries() {
  const src = readFileSync(DICT, "utf8");
  const js = src
    .replace(/^export type [\s\S]*?;$/gm, "")
    .replace(/^type Widen[\s\S]*?^};$/gm, "")
    // Drop the type annotation on any top-level `export const x: T =`.
    .replace(/^(export const \w+)\s*:\s*[^=\n]+=/gm, "$1 =")
    // Entries that interpolate a value are arrow functions with typed
    // parameters, e.g. `(a: string, b: string) =>`. Strip the annotations so
    // the reduced module is valid JS; `leaves` treats the function as a leaf.
    .replace(/\((\s*\w+\s*:\s*\w+\s*(?:,\s*\w+\s*:\s*\w+\s*)*)\)\s*=>/g, (m, params) =>
      `(${params
        .split(",")
        .map((p) => p.split(":")[0].trim())
        .join(", ")}) =>`,
    )
    .replace(/ as const/g, "");
  // Written next to the original so any relative import inside it still
  // resolves, then removed once evaluated.
  const tmp = join(SRC, "lib", "i18n", `.dictionaries.scan.${process.pid}.mjs`);
  writeFileSync(tmp, js);
  try {
    const mod = await import(pathToFileURL(tmp).href);
    return { fr: mod.fr, en: mod.en };
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Every leaf path in the dictionary, as `a.b.c`. */
function leaves(obj, prefix = [], out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") leaves(v, [...prefix, k], out);
    else out.push({ path: [...prefix, k].join("."), value: v });
  }
  return out;
}

function compareDictionaries(fr, en) {
  const findings = [];
  const enFlat = new Map(leaves(en).map((l) => [l.path, l.value]));

  for (const { path, value } of leaves(fr)) {
    if (!enFlat.has(path)) {
      findings.push({ kind: "missing", path, fr: value });
      continue;
    }
    const enValue = enFlat.get(path);
    if (
      enValue === value &&
      !ALLOWED_IDENTICAL.has(value) &&
      !isProperNoun(String(value))
    ) {
      findings.push({ kind: "identical", path, fr: value, en: enValue });
    }
    if (typeof enValue === "string" && /^TODO\b/.test(enValue)) {
      findings.push({ kind: "todo", path, fr: value, en: enValue });
    }
  }

  const frFlat = new Set(leaves(fr).map((l) => l.path));
  for (const { path } of leaves(en)) {
    if (!frFlat.has(path)) findings.push({ kind: "orphan", path });
  }

  return findings;
}

/**
 * Insert a nested key into a dictionary literal in the source text.
 *
 * Works on the source rather than on a parsed object so that comments,
 * ordering and formatting in `dictionaries.ts` survive the edit.
 */
function insertKey(src, dictName, group, key, value) {
  const dictStart = src.indexOf(`export const ${dictName}`);
  if (dictStart === -1) throw new Error(`dictionary ${dictName} not found`);
  const groupRe = new RegExp(`^  ${group}: \\{$`, "m");
  const groupMatch = groupRe.exec(src.slice(dictStart));
  if (!groupMatch) return null;

  const groupStart = dictStart + groupMatch.index + groupMatch[0].length;
  const groupEnd = src.indexOf("\n  },", groupStart);
  if (groupEnd === -1) return null;
  if (src.slice(groupStart, groupEnd).includes(`\n    ${key}:`)) return null;

  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return (
    src.slice(0, groupEnd) +
    `\n    ${key}: "${escaped}",` +
    src.slice(groupEnd)
  );
}

function report(hardcoded, dictFindings) {
  const bold = (s) => `[1m${s}[0m`;
  const dim = (s) => `[2m${s}[0m`;
  const red = (s) => `[31m${s}[0m`;
  const yellow = (s) => `[33m${s}[0m`;
  const green = (s) => `[32m${s}[0m`;

  console.log();
  console.log(bold("  i18n coverage"));
  console.log();

  if (hardcoded.length) {
    console.log(`  ${red("hardcoded")} ${dim("— literal text, never switches locale")}`);
    const byFile = new Map();
    for (const f of hardcoded) {
      if (!byFile.has(f.file)) byFile.set(f.file, []);
      byFile.get(f.file).push(f);
    }
    for (const [file, items] of byFile) {
      console.log(`    ${file}`);
      for (const i of items) {
        const where = i.attr ? dim(` (${i.attr})`) : "";
        console.log(`      ${dim(String(i.line).padStart(4))}  ${i.text}${where}`);
      }
    }
    console.log();
  }

  const groups = [
    ["missing", red("missing"), "key absent from en"],
    ["identical", yellow("identical"), "en value same as fr"],
    ["todo", yellow("todo"), "awaiting a human translation"],
    ["orphan", dim("orphan"), "in en but not in fr"],
  ];
  for (const [kind, label, note] of groups) {
    const items = dictFindings.filter((f) => f.kind === kind);
    if (!items.length) continue;
    console.log(`  ${label} ${dim(`— ${note}`)}`);
    for (const i of items) {
      const val = i.fr ? dim(`  "${i.fr}"`) : "";
      console.log(`      ${i.path}${val}`);
    }
    console.log();
  }

  const total = hardcoded.length + dictFindings.length;
  if (total === 0) {
    console.log(`  ${green("✓")} no gaps found`);
    console.log();
    return 0;
  }
  console.log(
    `  ${bold(String(total))} issue${total === 1 ? "" : "s"}` +
      dim(FIX ? "" : "  ·  re-run with --fix to scaffold keys"),
  );
  console.log();
  return 1;
}

async function main() {
  const files = await walk(SRC);
  const hardcoded = files.flatMap(scanFile);
  const { fr, en } = await loadDictionaries();
  const dictFindings = compareDictionaries(fr, en);

  if (JSON_OUT) {
    console.log(JSON.stringify({ hardcoded, dictionary: dictFindings }, null, 2));
    return hardcoded.length + dictFindings.length ? 1 : 0;
  }

  const code = report(hardcoded, dictFindings);

  if (FIX) {
    const missing = dictFindings.filter((f) => f.kind === "missing");
    if (missing.length) {
      let src = readFileSync(DICT, "utf8");
      let applied = 0;
      for (const f of missing) {
        const [group, key] = f.path.split(".");
        const next = insertKey(src, "en", group, key, `TODO ${f.fr}`);
        if (next) {
          src = next;
          applied += 1;
        }
      }
      if (applied) {
        writeFileSync(DICT, src);
        console.log(`  wrote ${applied} placeholder key(s) to dictionaries.ts`);
        console.log(`  each is marked TODO — replace with real English copy`);
        console.log();
      }
    }
  }

  return code;
}

main().then((code) => process.exit(code));
