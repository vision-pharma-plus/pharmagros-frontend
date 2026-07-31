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

import type { Locale } from "./i18n/dictionaries";

// Rounding must match the backend: half away from zero, per OHADA practice.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 28 });

/**
 * U+202F narrow no-break space — the French thousands separator.
 *
 * Named rather than written as a literal because the character is invisible in
 * source: the grouping separator here had silently been an ordinary space,
 * which let amounts break across lines mid-number.
 */
const NARROW_NBSP = " ";

/** U+00A0 no-break space, used between the amount and the currency code. */
const NBSP = " ";

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
  options: { showCurrency?: boolean; decimals?: number } = {},
): string {
  const { showCurrency = true, decimals = 0 } = options;

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

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_NBSP);
  const body = fraction ? `${grouped},${fraction}` : grouped;

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
  const grouped = text.replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_NBSP);
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

/** Safe decimal arithmetic for client-side line totals. */
export const money = {
  add: (a: string, b: string) => new Decimal(a).plus(b).toFixed(4),
  subtract: (a: string, b: string) => new Decimal(a).minus(b).toFixed(4),
  multiply: (a: string, b: string) => new Decimal(a).times(b).toFixed(4),
  percentOf: (base: string, percent: string) =>
    new Decimal(base).times(percent).dividedBy(100).toFixed(4),
  isZero: (a: string) => new Decimal(a || 0).isZero(),
  isNegative: (a: string) => new Decimal(a || 0).isNegative(),
  compare: (a: string, b: string) => new Decimal(a).comparedTo(b),
};

/**
 * Compute a sale/invoice line client-side for live preview.
 *
 * Mirrors `apps.core.money.compute_line` exactly — discount applies to the
 * gross line, tax to the discounted net. The server remains authoritative;
 * this exists so the operator sees the total update as they type rather than
 * after a round trip.
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
  const gross = new Decimal(quantity || 0).times(unitPrice || 0);
  const discount = gross.times(discountPercent || 0).dividedBy(100);
  const net = gross.minus(discount);
  const tax = net.times(taxRate || 0).dividedBy(100);

  return {
    gross: gross.toFixed(4),
    discount: discount.toFixed(4),
    net: net.toFixed(4),
    tax: tax.toFixed(4),
    total: net.plus(tax).toFixed(4),
  };
}
