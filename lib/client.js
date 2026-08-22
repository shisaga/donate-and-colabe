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
export const CREATOR_PCT = 30;
export function share30(n) { return Math.round(Number(n || 0) * 0.3); }
export function timeLeft(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  const m = Math.floor((ms % 3600000) / 60000);
  return h + 'h ' + m + 'm';
}
