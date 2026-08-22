'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LayoutDashboard, LogOut } from 'lucide-react';
import { StatBox, Sticker } from '@/components/brut';
import AuthModal from '@/components/AuthModal';
import { api, useAuth } from '@/lib/client';
import { useMoney } from '@/lib/currency';

export default function DashboardPage() {
  const { user, ready, login, logout } = useAuth();
  const { money } = useMoney();
  const [listings, setListings] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [invested, setInvested] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api('/me/listings'), api('/me/investments')]);
      setListings(a.listings || []);
      setInvestments(b.investments || []);
      setInvested(b.invested || 0);
    } catch (e) { /* not logged in */ }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);
  useEffect(() => { if (ready && !user) setAuthOpen(true); }, [ready, user]);

  const gathered = listings.reduce((s, l) => s + (l.raised || 0), 0);
  const myShare = listings.reduce((s, l) => s + (l.creatorShare || 0), 0);
  const paid = listings.reduce((s, l) => s + (l.paidOut || 0), 0);

  if (!ready) return <div className="p-10 font-comic text-3xl">Loading...</div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="brut-lg bg-white p-8 max-w-md text-center">
          <div className="font-comic text-3xl">Log in to see your dashboard</div>
          <p className="text-sm font-semibold mt-2">Track how much your listings gathered and claim your 30% share.</p>
          <button onClick={() => setAuthOpen(true)} className="brut-btn mt-4 px-6 py-3 bg-[#FFE156]">Log in / Register</button>
          <a href="/" className="block text-xs font-bold underline mt-3">← back to leaderboard</a>
        </div>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={(t, u) => { login(t, u); setAuthOpen(false); }} reason="Your dashboard is one login away." />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b-4 border-black bg-[#FFE156]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <LayoutDashboard size={22} strokeWidth={3} />
            <div>
              <div className="font-comic text-2xl leading-none">Hi {user.name} 👋</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider">{user.email}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <a href="/" className="brut-btn px-3 py-2 bg-white text-sm">Leaderboard</a>
            <button onClick={logout} className="brut-btn px-3 py-2 bg-[#FF5DA2] text-white text-sm inline-flex items-center gap-1"><LogOut size={14} strokeWidth={3} /></button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBox color="#FFE156" label="My total gathering" value={money(gathered)} sub={`${listings.length} listings`} />
          <StatBox color="#A0F04D" label="My 30% share" value={money(myShare)} sub={`${money(paid)} received so far`} />
          <StatBox color="#4DD4E6" label="Pending payout" value={money(Math.max(0, myShare - paid))} sub="admin settles this" />
          <StatBox color="#FF5DA2" label="I paid / donated" value={money(invested)} sub={`${investments.length} payments`} />
        </div>

        <div>
          <h2 className="font-comic text-3xl mb-3">My listings</h2>
          {listings.length === 0 ? (
            <div className="brut p-6 bg-white font-bold">You have no listings yet. <a href="/" className="underline">List one now →</a></div>
          ) : (
            <div className="grid gap-3">
              {listings.map(l => (
                <div key={l.id} className="brut p-4 bg-white flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 brut bg-[#FFE156] flex items-center justify-center text-xl">{l.logo}</div>
                    <div>
                      <div className="font-comic text-xl leading-none">{l.name}</div>
                      <div className="text-xs font-bold uppercase opacity-70">{l.category} • {l.status}</div>
                    </div>
                  </div>
                  <div className="text-sm font-bold">{money(l.raised)} gathered • 👑 {money(l.selfPaid)} self-paid • ❤️ {money(l.donated)} donated</div>
                  <Sticker color="#A0F04D">30% = {money(l.creatorShare)}</Sticker>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-comic text-3xl mb-3">My investments</h2>
          {investments.length === 0 ? (
            <div className="brut p-6 bg-white font-bold">No investments yet — back someone from ₹1. <a href="/#leaderboard" className="underline">Browse board →</a></div>
          ) : (
            <div className="brut p-4 bg-white">
              {investments.map(i => (
                <div key={i.id} className="flex flex-wrap justify-between border-b-2 border-dashed border-black py-2 text-sm font-bold gap-2">
                  <span>{i.listingName}</span>
                  <span>{money(i.amount)} • {new Date(i.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
