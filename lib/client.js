'use client';
import { useCallback, useEffect, useState } from 'react';

export const TOKEN_KEY = 'dc_token';

export function getToken() {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}
export function setToken(t) {
  try { window.localStorage.setItem(TOKEN_KEY, t); } catch (e) {}
}
export function clearToken() {
  try { window.localStorage.removeItem(TOKEN_KEY); } catch (e) {}
}

export async function api(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setReady(true); return null; }
    try {
      const d = await api('/auth/me');
      setUser(d.user);
      setReady(true);
      return d.user;
    } catch (e) {
      clearToken();
      setUser(null);
      setReady(true);
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = (token, u) => { setToken(token); setUser(u); };
  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (e) {}
    clearToken();
    setUser(null);
  };

  return { user, ready, refresh, login, logout, setUser };
}

export const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
export const CREATOR_PCT = 0;
export function share30(n) { return 0; }
export function compact(n) {
  const v = Number(n || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(v));
}
export function timeLeft(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  const m = Math.floor((ms % 3600000) / 60000);
  return h + 'h ' + m + 'm';
}
export function countdown(iso) {
  if (!iso) return '—';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ENDED';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}D ${h}H ${m}M`;
  return `${h}H ${m}M ${String(s).padStart(2, '0')}S`;
}
export function holdTime(ms) {
  const n = Math.max(0, Number(ms || 0));
  const h = Math.floor(n / 3600000);
  const m = Math.floor((n % 3600000) / 60000);
  return `${h}h ${m}m`;
}
