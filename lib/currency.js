'use client';
import { useEffect, useState } from 'react';
import { COUNTRY_CURRENCY, CURRENCIES, currencyOf, formatBase, formatMoney, fromBase } from './money';

const KEY = 'dc_currency';
let current = 'INR';
let list = Object.values(CURRENCIES).map(c => ({ code: c.code, symbol: c.symbol, name: c.name, cardMin: c.cardMin, chips: c.chips }));
let started = false;
const listeners = new Set();

function broadcast() { listeners.forEach(fn => fn(current)); }

function guessFromBrowser() {
  try {
    const lang = navigator.language || '';
    const region = (lang.split('-')[1] || '').toUpperCase();
    if (COUNTRY_CURRENCY[region]) return COUNTRY_CURRENCY[region];
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (/Kolkata|Calcutta|Asia\/Colombo|Asia\/Kathmandu|Asia\/Dhaka/.test(tz)) return 'INR';
    if (/Europe\/London/.test(tz)) return 'GBP';
    if (/Europe\//.test(tz)) return 'EUR';
    if (/Dubai/.test(tz)) return 'AED';
    if (/Singapore/.test(tz)) return 'SGD';
    if (/Australia\//.test(tz)) return 'AUD';
    if (/Tokyo/.test(tz)) return 'JPY';
    if (/America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax)/.test(tz)) return 'CAD';
    if (/America\//.test(tz)) return 'USD';
  } catch (e) {}
  return 'INR';
}

async function init() {
  if (started) return;
  started = true;
  let saved = null;
  try { saved = window.localStorage.getItem(KEY); } catch (e) {}
  if (saved && CURRENCIES[saved]) { current = saved; broadcast(); }
  try {
    const res = await fetch('/api/currencies');
    const d = await res.json();
    if (Array.isArray(d.currencies) && d.currencies.length) list = d.currencies;
    if (!saved) {
      current = (d.detected && CURRENCIES[d.detected]) ? d.detected : guessFromBrowser();
    }
  } catch (e) {
    if (!saved) current = guessFromBrowser();
  }
  broadcast();
}

export function setCurrency(code) {
  if (!CURRENCIES[code]) return;
  current = code;
  try { window.localStorage.setItem(KEY, code); } catch (e) {}
  broadcast();
}

export function useMoney() {
  const [currency, setLocal] = useState(current);

  useEffect(() => {
    listeners.add(setLocal);
    init();
    setLocal(current);
    return () => { listeners.delete(setLocal); };
  }, []);

  const conf = currencyOf(currency);
  return {
    currency,
    conf,
    currencies: list,
    setCurrency,
    // format an INR ledger amount in the viewer's currency
    money: (amountInr) => formatBase(amountInr, currency),
    // format an amount already in the viewer's currency
    local: (amount) => formatMoney(amount, currency),
    fromBase: (amountInr) => fromBase(amountInr, currency),
    chips: conf.chips,
    cardMin: conf.cardMin,
    symbol: conf.symbol,
  };
}
