'use client';
import { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, LogOut, Flame } from 'lucide-react';
import { StatBox, Sticker } from '@/components/brut';
import AuthModal from '@/components/AuthModal';
import InvestModal from '@/components/InvestModal';
import { api, compact, holdTime, useAuth } from '@/lib/client';
import { useMoney } from '@/lib/currency';

export default function DashboardPage() {
  const { user, ready, login, logout } = useAuth();
  const { money } = useMoney();
  const [listings, setListings] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [invested, setInvested] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [investTarget, setInvestTarget] = useState(null);
  const [notes, setNotes] = useState([]);

  const load = useCallback(async () => {
    try {
      const [a, b, n] = await Promise.all([api('/me/listings'), api('/me/investments'), api('/me/notifications')]);
      setListings(a.listings || []);
      setInvestments(b.investments || []);
      setInvested(b.invested || 0);
      setNotes(n.notifications || []);
    } catch (e) { /* not logged in */ }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);
  useEffect(() => { if (ready && !user) setAuthOpen(true); }, [ready, user]);

  const views = listings.reduce((s, l) => s + (l.views || 0), 0);
  const clicks = listings.reduce((s, l) => s + (l.clicks || 0), 0);
  const best = listings.reduce((s, l) => Math.min(s, l.rank || 999), 999);

  if (!ready) return <div className="p-10 font-comic text-3xl">Loading...</div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="brut-lg bg-white p-8 max-w-md text-center">
          <div className="font-comic text-3xl">Log in to see your stats</div>
          <p className="text-sm font-semibold mt-2">Track rank, PayToTrend views, Instagram clicks, and defend your position.</p>
          <button onClick={() => setAuthOpen(true)} className="brut-btn mt-4 px-6 py-3 bg-[#FFE156]">Log in / Register</button>
          <a href="/" className="block text-xs font-bold underline mt-3">← back to leaderboard</a>
        </div>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={(t, u) => { login(t, u); setAuthOpen(false); }} reason="Your trending stats are one login away." />
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
          <StatBox color="#FFE156" label="Best rank" value={best < 999 ? `#${best}` : '—'} sub={`${listings.length} profiles`} />
          <StatBox color="#A0F04D" label="PayToTrend views" value={compact(views)} sub="visibility on this site" />
          <StatBox color="#4DD4E6" label="Instagram clicks" value={compact(clicks)} sub="people who tapped through" />
          <StatBox color="#FF5DA2" label="You paid" value={money(invested)} sub={`${investments.length} challenges`} />
        </div>

        {notes.filter(n => !n.read && n.type === 'OVERTAKEN').slice(0, 1).map(n => (
          <div key={n.id} className="brut p-4 bg-[#FF5C4D] text-white flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-comic text-2xl">🚨 YOU JUST LOST #1</div>
              <div className="text-sm font-bold">{n.challengerName} took your spot. You are now #{n.toRank}.</div>
            </div>
            <button
              onClick={() => {
                const listing = listings.find(l => l.id === n.listingId);
                if (listing) setInvestTarget(listing);
              }}
              className="brut-btn px-4 py-2 bg-[#FFE156] text-black"
            >
              🔥 DEFEND #1
            </button>
          </div>
        ))}

        <div>
          <h2 className="font-comic text-3xl mb-3">Your trending stats</h2>
          {listings.length === 0 ? (
            <div className="brut p-6 bg-white font-bold">You have no profiles yet. <a href="/" className="underline">Start trending →</a></div>
          ) : (
            <div className="grid gap-3">
              {listings.map(l => (
                <div key={l.id} className="brut p-4 bg-white space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="brut px-3 py-2 font-comic text-2xl bg-[#FFE156]" style={{ boxShadow: '3px 3px 0 #000' }}>
                        #{l.rank || '—'}
                      </div>
                      {l.image
                        ? <img src={l.image} alt={l.name} className="w-11 h-11 brut object-cover" />
                        : <div className="w-11 h-11 brut bg-[#FFE156] flex items-center justify-center text-xl">{l.logo}</div>}
                      <div>
                        <div className="font-comic text-xl leading-none">{l.name}</div>
                        <div className="text-xs font-bold uppercase opacity-70">{l.category} • {l.status}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setInvestTarget(l)}
                      className="brut-btn px-4 py-2 bg-[#FF5DA2] text-white text-sm inline-flex items-center gap-1"
                    >
                      <Flame size={14} strokeWidth={3} /> {l.rank === 1 ? 'Defend #1' : 'Climb'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-bold">
                    <div className="brut p-2 bg-[#FFE156]">Current rank<br /><span className="font-comic text-2xl">#{l.rank || '—'}</span></div>
                    <div className="brut p-2 bg-[#A0F04D]">Highest rank<br /><span className="font-comic text-2xl">#{l.highestRank || l.rank || '—'}</span></div>
                    <div className="brut p-2 bg-[#4DD4E6]">Amount<br /><span className="font-comic text-2xl">{money(l.raised)}</span></div>
                    <div className="brut p-2 bg-[#B285FF]">PayToTrend views<br /><span className="font-comic text-2xl">{compact(l.views)}</span></div>
                    <div className="brut p-2 bg-white">Instagram clicks<br /><span className="font-comic text-2xl">{compact(l.clicks)}</span></div>
                    <div className="brut p-2 bg-white">Click rate<br /><span className="font-comic text-2xl">{l.clickRate || 0}%</span></div>
                    <div className="brut p-2 bg-white">Times overtaken<br /><span className="font-comic text-2xl">{l.timesOvertaken || 0}</span></div>
                    <div className="brut p-2 bg-white">Time at #1<br /><span className="font-comic text-2xl">{holdTime(l.timeAtNumberOneMs)}</span></div>
                  </div>
                  <p className="text-[11px] font-semibold opacity-70">These are PayToTrend visibility metrics — not Instagram followers.</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-comic text-3xl mb-3">Your payments</h2>
          {investments.length === 0 ? (
            <div className="brut p-6 bg-white font-bold">No challenges yet. <a href="/#leaderboard" className="underline">Fight for a rank →</a></div>
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
      <InvestModal
        open={!!investTarget}
        onClose={() => setInvestTarget(null)}
        listing={investTarget}
        mode="SELF_PAY"
        targetRank={1}
        user={user}
        onDone={async () => {
          setInvestTarget(null);
          await load();
        }}
      />
    </div>
  );
}
