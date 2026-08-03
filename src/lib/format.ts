/**
 * Display formatting for money, quantities and dates.
 *
 * Money never passes through a JavaScript `number`. The API sends amounts as
 * decimal strings precisely because IEEE-754 doubles cannot represent them
 * exactly — parsing to `number` here would reintroduce the error the backend
 * works to avoid, and an invoice that displays 589,999.99 instead of 590,000
 * destroys user trust even when the stored value is correct.
 */

import Decimal from "decimal.js";

import { DEFAULT_LOCALE, type Locale } from "./i18n/dictionaries";

// Rounding must match the backend: half away from zero, per OHADA practice.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 28 });

/** U+00A0 no-break space, used between the amount and the currency code. */
const NBSP = " ";

/**
 * Thousands separator for on-screen amounts, by locale.
 *
 * U+202F is the typographically correct French/Burundian separator and is what
 * the PDF templates use, but on screen it is effectively invisible: at UI font
 * sizes "2 400 BIF" reads as "240 BIF". That is not a cosmetic complaint — an
 * operator who reads a 2 400 total as 240 tenders 300, gets a disabled Confirm
 * button, and has no way to see why. A displayed amount that the reader
 * resolves to the wrong number is a wrong amount.
 *
 * French keeps a space so the grouping convention survives, but a regular one
 * that is actually visible; the no-break property is preserved by the CSS
 * `white-space` on the amount rather than by the character. English uses the
 * comma its readers expect.
 *
 * The PDF templates in backend/templates/pdf/ format money independently and
 * are deliberately untouched, so printed documents keep U+202F.
 */
const GROUP_SEPARATOR: Record<Locale, string> = {
  fr: " ",
  en: ",",
};

/**
 * Format a BIF amount for display.
 *
 * BIF has no circulating subunit, so amounts print as whole francs with a
 * narrow no-break space as the thousands separator — the French/Burundian
 * convention. The same separator is used in English output so an English
 * export remains line-for-line reconcilable with the French original.
 */
export function formatMoney(
  value: string | number | null | undefined,
  options: { showCurrency?: boolean; decimals?: number; locale?: Locale } = {},
): string {
  const { showCurrency = true, decimals = 0, locale = DEFAULT_LOCALE } = options;

  if (value === null || value === undefined || value === "") {
    return showCurrency ? "— BIF" : "—";
  }

  let amount: Decimal;
  try {
    amount = new Decimal(value);
  } catch {
    return showCurrency ? "— BIF" : "—";
  }

  const negative = amount.isNegative();
  const rounded = amount.abs().toFixed(decimals);
  const [whole = "0", fraction] = rounded.split(".");

  const grouped = whole.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    GROUP_SEPARATOR[locale],
  );
  const decimalSeparator = locale === "fr" ? "," : ".";
  const body = fraction ? `${grouped}${decimalSeparator}${fraction}` : grouped;

  const sign = negative ? "−" : ""; // true minus sign, not hyphen
  return showCurrency ? `${sign}${body}${NBSP}BIF` : `${sign}${body}`;
}

/**
 * Compact form for dashboard tiles, e.g. "2,6 M BIF".
 *
 * `showCurrency: false` is what chart axes should use. Stripping " BIF" from
 * the formatted string afterwards silently breaks the moment the separator or
 * currency placement changes.
 */
export function formatMoneyCompact(
  value: string | number | null | undefined,
  locale: Locale = "fr",
  options: { showCurrency?: boolean } = {},
): string {
  const { showCurrency = true } = options;
  const suffixCurrency = showCurrency ? " BIF" : "";

  if (value === null || value === undefined || value === "")
    return `—${suffixCurrency}`;

  let amount: Decimal;
  try {
    amount = new Decimal(value);
  } catch {
    return `—${suffixCurrency}`;
  }

  const abs = amount.abs();
  const sign = amount.isNegative() ? "−" : "";
  const decimalSeparator = locale === "fr" ? "," : ".";

  const scale = (divisor: string, suffix: string) =>
    `${sign}${abs
      .dividedBy(divisor)
      .toFixed(1)
      .replace(".", decimalSeparator)} ${suffix}${suffixCurrency}`;

  if (abs.greaterThanOrEqualTo("1000000000")) return scale("1000000000", "Md");
  if (abs.greaterThanOrEqualTo("1000000")) return scale("1000000", "M");
  if (abs.greaterThanOrEqualTo("1000")) return scale("1000", "k");
  return formatMoney(value, { showCurrency });
}

/** Quantities keep up to 3 decimals but drop trailing zeros. */
export function formatQuantity(
  value: string | number | null | undefined,
  unit?: string,
): string {
  if (value === null || value === undefined || value === "") return "—";

  let quantity: Decimal;
  try {
    quantity = new Decimal(value);
  } catch {
    return "—";
  }

  const text = quantity
    .toFixed(3)
    .replace(/\.?0+$/, "")
    .replace(".", ",");
  // Same visibility problem as formatMoney: a U+202F between the digits makes
  // 2 400 tablets read as 240 on screen.
  const grouped = text.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR.fr);
  return unit ? `${grouped} ${unit}` : grouped;
}

export function formatPercent(
  value: string | number | null | undefined,
  decimals = 1,
): string {
  if (value === null || value === undefined || value === "") return "—";
  try {
    return `${new Decimal(value).toFixed(decimals).replace(".", ",")} %`;
  } catch {
    return "—";
  }
}

/**
 * Dates are rendered dd/MM/yyyy in both locales.
 *
 * Burundi uses the day-first convention; showing an English user MM/dd would
 * make 03/04 ambiguous against the same document rendered in French, which on
 * an invoice due date is a genuine operational risk.
 */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${formatDate(date)} ${hours}:${minutes}`;
}

/**
 * A bare day count, e.g. "90 j" / "90 d".
 *
 * The abbreviation was previously hardcoded as the French " j" everywhere it
 * appeared, so an English user saw French units throughout the stock screens.
 */
export function formatDays(value: number, locale: Locale = "fr"): string {
  return locale === "fr" ? `${value} j` : `${value} d`;
}

/** "dans 12 jours" / "in 12 days", or "il y a 3 jours" / "3 days ago". */
export function formatRelativeDays(days: number, locale: Locale): string {
  if (locale === "fr") {
    if (days === 0) return "aujourd'hui";
    if (days === 1) return "demain";
    if (days === -1) return "hier";
    return days > 0 ? `dans ${days} jours` : `il y a ${Math.abs(days)} jours`;
  }
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

/**
 * Coerce anything that reaches the arithmetic helpers into a usable Decimal.
 *
 * `new Decimal(x)` *throws* on undefined, null, "" and on partial numeric text
 * — and "partial" is the normal state of an `<input type="number">` mid-typing:
 * a lone "-", ".", or "1e" all arrive here as the user works towards a real
 * figure. It also covers an API field that a create response omits where the
 * list response includes it.
 *
 * Every one of those used to throw out of a render pass with no error boundary
 * above it, which is what blanked the screen after an otherwise successful
 * save. Treating an unreadable value as zero matches what `formatMoney` and
 * `formatQuantity` already do, so a half-typed amount now previews as 0 and
 * corrects itself on the next keystroke instead of taking the page down.
 *
 * This is display and preview math only — the server stays authoritative for
 * every stored amount, and it validates the submitted payload independently.
 */
function toDecimal(value: string | number | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

/** Safe decimal arithmetic for client-side line totals. */
export const money = {
  add: (a: string, b: string) => toDecimal(a).plus(toDecimal(b)).toFixed(4),
  subtract: (a: string, b: string) => toDecimal(a).minus(toDecimal(b)).toFixed(4),
  multiply: (a: string, b: string) => toDecimal(a).times(toDecimal(b)).toFixed(4),
  percentOf: (base: string, percent: string) =>
    toDecimal(base).times(toDecimal(percent)).dividedBy(100).toFixed(4),
  isZero: (a: string) => toDecimal(a).isZero(),
  isNegative: (a: string) => toDecimal(a).isNegative(),
  compare: (a: string, b: string) => toDecimal(a).comparedTo(toDecimal(b)),
};

/**
 * Extract the net-of-VAT price from a VAT-inclusive one.
 *
 * Mirrors `apps.core.money.price_ex_tax`. Catalogue and counter prices are
 * entered VAT-inclusive — the figure the customer actually pays — while every
 * stored line amount is net of VAT, so this is the one inversion and the two
 * implementations must stay in step.
 *
 * A zero rate returns the price unchanged rather than dividing by one, keeping
 * exempt and zero-rated products exact.
 */
export function priceExclVat(priceInclVat: string, vatRate = "0"): string {
  const rate = toDecimal(vatRate);
  const price = toDecimal(priceInclVat);
  if (rate.isZero()) {
    return price.toFixed(4);
  }
  return price.dividedBy(rate.dividedBy(100).plus(1)).toFixed(4);
}

/**
 * Add VAT back onto a net price. The inverse of `priceExclVat`.
 */
export function priceInclVat(priceExclVatValue: string, vatRate = "0"): string {
  const rate = toDecimal(vatRate);
  const price = toDecimal(priceExclVatValue);
  if (rate.isZero()) {
    return price.toFixed(4);
  }
  return price.times(rate.dividedBy(100).plus(1)).toFixed(4);
}

/**
 * Compute a sale/invoice line client-side for live preview.
 *
 * Mirrors `apps.core.money.compute_line` exactly — discount applies to the
 * gross line, tax to the discounted net. The server remains authoritative;
 * this exists so the operator sees the total update as they type rather than
 * after a round trip.
 *
 * `unitPrice` here is NET of VAT, matching what the server stores. Callers
 * holding a VAT-inclusive figure — the sales screen, where the operator types
 * the counter price — must put it through `priceExclVat` first.
 */
export function computeLine(
  quantity: string,
  unitPrice: string,
  discountPercent = "0",
  taxRate = "0",
): {
  gross: string;
  discount: string;
  net: string;
  tax: string;
  total: string;
} {
  const gross = toDecimal(quantity).times(toDecimal(unitPrice));
  const discount = gross.times(toDecimal(discountPercent)).dividedBy(100);
  const net = gross.minus(discount);
  const tax = net.times(toDecimal(taxRate)).dividedBy(100);

  return {
    gross: gross.toFixed(4),
    discount: discount.toFixed(4),
    net: net.toFixed(4),
    tax: tax.toFixed(4),
    total: net.plus(tax).toFixed(4),
  };
}
