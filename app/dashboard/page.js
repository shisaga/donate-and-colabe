'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard, LogOut, Flame, PlusCircle, Wallet,
  Eye, MousePointerClick, ArrowUp, Crown, Copy, Check,
} from 'lucide-react';
import { StatBox, Sticker } from '@/components/brut';
import AuthModal from '@/components/AuthModal';
import InvestModal from '@/components/InvestModal';
import AddBalanceModal from '@/components/AddBalanceModal';
import { api, compact, holdTime, useAuth } from '@/lib/client';
import { useMoney } from '@/lib/currency';
import { toast } from 'sonner';

/* ── tiny helpers ─────────────────────────────────────────── */
const COLORS = ['#FFE156', '#FF5DA2', '#4DD4E6', '#FF5C4D', '#A0F04D', '#B285FF', '#FFB84D'];

function RankBadge({ rank }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  const bg    = rank === 1 ? '#FFE156' : rank === 2 ? '#4DD4E6' : rank === 3 ? '#FF5DA2' : '#fff';
  return (
    <div className="brut inline-flex items-center gap-1 px-3 py-2 font-comic text-2xl flex-shrink-0"
         style={{ background: bg, boxShadow: '4px 4px 0 #000' }}>
      {medal ? <span>{medal}</span> : <Crown size={16} strokeWidth={3} />} #{rank}
    </div>
  );
}

function CopyId({ id }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      toast.success('ID copied!');
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="brut-btn px-2 py-1 bg-white text-[10px] font-bold inline-flex items-center gap-1 opacity-70 hover:opacity-100"
      title="Copy listing ID"
    >
      {copied ? <Check size={10} strokeWidth={3} /> : <Copy size={10} strokeWidth={3} />}
      ID: {id.slice(0, 8)}…
    </button>
  );
}

/* ── Balance header strip ────────────────────────────────── */
function BalanceStrip({ balance, onAdd }) {
  const { money } = useMoney();
  return (
    <div className="border-b-4 border-black bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Wallet size={20} strokeWidth={3} className="text-[#FFE156]" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Wallet Balance</div>
            <div className="font-comic text-2xl leading-none text-[#A0F04D]">
              {money(balance)}
            </div>
          </div>
        </div>
        <button
          onClick={onAdd}
          className="brut-btn px-4 py-2 bg-[#FFE156] text-black text-sm inline-flex items-center gap-2"
        >
          <PlusCircle size={16} strokeWidth={3} />
          Add Balance
        </button>
      </div>
    </div>
  );
}

/* ── Rich listing card (leaderboard-style) ───────────────── */
function MyListingCard({ l, money, onPay }) {
  const isTop3 = l.rank <= 3;
  const color  = COLORS[(Math.max(0, (l.rank || 1) - 1)) % COLORS.length];
  const visit  = () => {
    const href = l.website || (l.handle ? `https://instagram.com/${l.handle}` : '');
    if (href) window.open(href, '_blank', 'noreferrer');
  };

  return (
    <div
      className="brut p-4 md:p-5 relative overflow-hidden"
      style={{ background: isTop3 ? color : '#fff' }}
    >
      {isTop3 && (
        <div className="absolute -top-3 -left-3">
          <Sticker color="#000" rotate={-8}>
            <span className="text-white">🔥 TOP {l.rank}</span>
          </Sticker>
        </div>
      )}

      {/* Top row: rank + image + name + actions */}
      <div className="flex items-start gap-4 flex-wrap md:flex-nowrap">
        <RankBadge rank={l.rank || '—'} />

        {l.image ? (
          <img src={l.image} alt={l.name} className="w-14 h-14 flex-shrink-0 brut object-cover bg-white"
               style={{ boxShadow: '3px 3px 0 #000' }} />
        ) : (
          <div className="w-14 h-14 flex-shrink-0 brut flex items-center justify-center text-3xl bg-white"
               style={{ boxShadow: '3px 3px 0 #000' }}>
            {l.logo}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-comic text-xl sm:text-2xl leading-tight break-all">{l.name}</h3>
            {l.verified && <Sticker color="#A0F04D" rotate={2}>✓ VERIFIED</Sticker>}
          </div>
          {l.tagline && (
            <p className="text-sm font-medium mt-1 opacity-90 break-all">{l.tagline}</p>
          )}
          {/* Meta chips */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold">
            <CopyId id={l.id} />
            <span className="brut px-2 py-1 bg-white">{money(l.raised)}</span>
            <span className="brut px-2 py-1 bg-white inline-flex items-center gap-1">
              <Eye size={11} strokeWidth={3} /> {compact(l.views)} views
            </span>
            <span className="brut px-2 py-1 bg-white inline-flex items-center gap-1">
              <MousePointerClick size={11} strokeWidth={3} /> {compact(l.clicks)} clicks
            </span>
            <span className="brut px-2 py-1 uppercase" style={{ background: '#B285FF', color: '#fff' }}>
              {l.category}
            </span>
            <span className={`brut px-2 py-1 ${l.status === 'ACTIVE' ? 'bg-[#A0F04D]' : 'bg-white opacity-70'}`}>
              {l.status}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 w-full md:w-auto">
          <button
            onClick={() => onPay(l)}
            className="brut-btn px-4 py-3 bg-[#FF5DA2] text-white text-sm inline-flex items-center justify-center gap-1"
          >
            <Flame size={14} strokeWidth={3} />
            {l.rank === 1 ? 'Pay to defend #1' : 'Pay to take #1'}
          </button>
          {l.website || l.handle ? (
            <button
              onClick={visit}
              className="brut-btn px-4 py-2 bg-white text-sm inline-flex items-center justify-center gap-1"
            >
              🔗 Visit profile
            </button>
          ) : null}
        </div>
      </div>

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
        <div className="brut p-2 bg-[#FFE156]">
          Current rank<br />
          <span className="font-comic text-2xl">#{l.rank || '—'}</span>
        </div>
        <div className="brut p-2 bg-[#A0F04D]">
          Highest rank<br />
          <span className="font-comic text-2xl">#{l.highestRank || l.rank || '—'}</span>
        </div>
        <div className="brut p-2 bg-[#4DD4E6]">
          Amount paid<br />
          <span className="font-comic text-2xl">{money(l.raised)}</span>
        </div>
        <div className="brut p-2 bg-[#B285FF] text-white">
          Views<br />
          <span className="font-comic text-2xl">{compact(l.views)}</span>
        </div>
        <div className="brut p-2 bg-white">
          Clicks<br />
          <span className="font-comic text-2xl">{compact(l.clicks)}</span>
        </div>
        <div className="brut p-2 bg-white">
          Click rate<br />
          <span className="font-comic text-2xl">{l.clickRate || 0}%</span>
        </div>
        <div className="brut p-2 bg-white">
          Overtaken<br />
          <span className="font-comic text-2xl">{l.timesOvertaken || 0}×</span>
        </div>
        <div className="brut p-2 bg-white">
          Time at #1<br />
          <span className="font-comic text-2xl">{holdTime(l.timeAtNumberOneMs)}</span>
        </div>
      </div>

      {/* Bottom row */}
      <div className="mt-3 pt-3 border-t-2 border-dashed border-black text-xs font-semibold flex flex-wrap items-center gap-x-4 gap-y-1">
        {l.rank === 1 ? (
          <span className="inline-flex items-center gap-1 font-bold">
            🔥 HOLDING #1
            {l.leadOverNext > 0 && <span> · ⚠️ #{2} is {money(l.leadOverNext)} behind</span>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <ArrowUp size={12} strokeWidth={3} className="text-[#FF5C4D]" />
            <button onClick={() => onPay(l)} className="underline font-bold">
              Pay more to climb — currently #{l.rank || '?'}
            </button>
          </span>
        )}
        <span className="opacity-60">ID: {l.id}</span>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────── */
export default function DashboardPage() {
  const { user, ready, login, logout, setUser } = useAuth();
  const { money } = useMoney();
  const [listings, setListings]       = useState([]);
  const [investments, setInvestments] = useState([]);
  const [invested, setInvested]       = useState(0);
  const [authOpen, setAuthOpen]       = useState(false);
  const [investTarget, setInvestTarget] = useState(null);
  const [addBalOpen, setAddBalOpen]   = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [notes, setNotes]             = useState([]);

  const load = useCallback(async () => {
    try {
      const [a, b, n, w] = await Promise.all([
        api('/me/listings'),
        api('/me/investments'),
        api('/me/notifications'),
        api('/me/wallet'),
      ]);
      setListings(a.listings || []);
      setInvestments(b.investments || []);
      setInvested(b.invested || 0);
      setNotes(n.notifications || []);
      setWalletBalance(w.balance || 0);
    } catch (e) { /* not logged in */ }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);
  useEffect(() => { if (ready && !user) setAuthOpen(true); }, [ready, user]);

  const views  = listings.reduce((s, l) => s + (l.views  || 0), 0);
  const clicks = listings.reduce((s, l) => s + (l.clicks || 0), 0);
  const best   = listings.reduce((s, l) => Math.min(s, l.rank || 999), 999);

  if (!ready) return <div className="p-10 font-comic text-3xl">Loading...</div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="brut-lg bg-white p-8 max-w-md text-center">
          <div className="font-comic text-3xl">Log in to see your stats</div>
          <p className="text-sm font-semibold mt-2">Track rank, PayToTrend views, Instagram clicks, and pay more anytime to climb. The board never ends.</p>
          <button onClick={() => setAuthOpen(true)} className="brut-btn mt-4 px-6 py-3 bg-[#FFE156]">Log in / Register</button>
          <a href="/" className="block text-xs font-bold underline mt-3">← back to leaderboard</a>
        </div>
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onAuthed={(t, u) => { login(t, u); setAuthOpen(false); }}
          reason="Your trending stats are one login away."
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* ── Top nav header ── */}
      <header className="border-b-4 border-black bg-[#FFE156]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <LayoutDashboard size={22} strokeWidth={3} />
            <div>
              <div className="font-comic text-2xl leading-none">Hi {user.name} 👋</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider">{user.email}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <a href="/" className="brut-btn px-3 py-2 bg-white text-sm">Leaderboard</a>
            <button onClick={logout} className="brut-btn px-3 py-2 bg-[#FF5DA2] text-white text-sm inline-flex items-center gap-1">
              <LogOut size={14} strokeWidth={3} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Wallet / Balance strip ── */}
      <BalanceStrip balance={walletBalance} onAdd={() => setAddBalOpen(true)} />

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* ── Stats overview ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatBox color="#FFE156" label="Best rank"          value={best < 999 ? `#${best}` : '—'}   sub={`${listings.length} profiles`} />
          <StatBox color="#A0F04D" label="PayToTrend views"   value={compact(views)}                   sub="visibility on this site" />
          <StatBox color="#4DD4E6" label="Instagram clicks"   value={compact(clicks)}                  sub="people who tapped through" />
          <StatBox color="#FF5DA2" label="You paid"           value={money(invested)}                  sub={`${investments.length} payments`} />
        </div>

        {/* ── Overtaken alert ── */}
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

        {/* ── Listed profiles ── */}
        <div>
          <h2 className="font-comic text-3xl mb-3">Your listed profiles</h2>
          {listings.length === 0 ? (
            <div className="brut p-6 bg-white font-bold">
              You have no profiles yet. <a href="/" className="underline">Start trending →</a>
            </div>
          ) : (
            <div className="grid gap-4">
              {listings.map(l => (
                <MyListingCard
                  key={l.id}
                  l={l}
                  money={money}
                  onPay={setInvestTarget}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Payment history ── */}
        <div>
          <h2 className="font-comic text-3xl mb-3">Your payments</h2>
          {investments.length === 0 ? (
            <div className="brut p-6 bg-white font-bold">
              No payments yet. <a href="/#leaderboard" className="underline">Pay to climb, or donate to someone →</a>
            </div>
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

      {/* ── Modals ── */}
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

      <AddBalanceModal
        open={addBalOpen}
        onClose={() => setAddBalOpen(false)}
        user={user}
        onAdded={(newBalance) => {
          setWalletBalance(newBalance);
        }}
      />
    </div>
  );
}
