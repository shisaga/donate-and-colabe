// Shared money config (safe for both server and client).
// The ledger base currency is INR; every contribution is stored in INR
// so ranking, the 30/40/30 split and totals stay consistent.

export const BASE_CURRENCY = 'INR';

export const CURRENCIES = {
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee',      locale: 'en-IN', rateToInr: 1,    chips: [1, 11, 51, 101, 501, 1000, 5000, 25000] },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar',         locale: 'en-US', rateToInr: 83,   chips: [1, 2, 5, 10, 25, 50, 100, 500] },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro',              locale: 'de-DE', rateToInr: 90,   chips: [1, 2, 5, 10, 25, 50, 100, 500] },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound',     locale: 'en-GB', rateToInr: 105,  chips: [1, 2, 5, 10, 20, 50, 100, 500] },
  AED: { code: 'AED', symbol: 'AED ', name: 'UAE Dirham',     locale: 'en-AE', rateToInr: 22.6, chips: [3, 5, 10, 25, 50, 100, 250, 1000] },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG', rateToInr: 61,   chips: [1, 2, 5, 10, 25, 50, 100, 500] },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar',locale: 'en-AU', rateToInr: 55,   chips: [1, 2, 5, 10, 25, 50, 100, 500] },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar',  locale: 'en-CA', rateToInr: 61,   chips: [1, 2, 5, 10, 25, 50, 100, 500] },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen',      locale: 'ja-JP', rateToInr: 0.55, chips: [100, 200, 500, 1000, 2500, 5000, 10000, 50000], zeroDecimal: true },
};

export const COUNTRY_CURRENCY = {
  IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED', SG: 'SGD', AU: 'AUD', CA: 'CAD', JP: 'JPY',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', PT: 'EUR', BE: 'EUR',
  AT: 'EUR', FI: 'EUR', GR: 'EUR', NP: 'INR', LK: 'INR', BD: 'INR',
};

export function currencyOf(code) {
  return CURRENCIES[String(code || '').toUpperCase()] || CURRENCIES[BASE_CURRENCY];
}

// local amount -> INR ledger amount
export function toBase(amount, code) {
  const c = currencyOf(code);
  return Math.max(1, Math.round(Number(amount) * c.rateToInr));
}

// INR ledger amount -> local display amount
export function fromBase(amountInr, code) {
  const c = currencyOf(code);
  const v = Number(amountInr || 0) / c.rateToInr;
  return c.zeroDecimal ? Math.round(v) : (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
}

export function formatMoney(amount, code) {
  const c = currencyOf(code);
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat(c.locale, {
      style: 'currency', currency: c.code,
      maximumFractionDigits: c.zeroDecimal ? 0 : (n < 10 && !Number.isInteger(n) ? 1 : 0),
    }).format(n);
  } catch (e) {
    return c.symbol + n.toLocaleString();
  }
}

// Format an INR ledger amount in the viewer's currency
export function formatBase(amountInr, code) {
  const c = currencyOf(code);
  const local = fromBase(amountInr, code);
  const text = formatMoney(local, code);
  return c.code === BASE_CURRENCY ? text : '≈' + text;
}
