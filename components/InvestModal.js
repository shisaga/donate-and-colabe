'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Flame, Swords } from 'lucide-react';
import { Modal, Sticker } from './brut';
import { api } from '@/lib/client';
import { useMoney } from '@/lib/currency';

export default function InvestModal({ open, onClose, listing, onDone, user, mode = 'SELF_PAY', targetRank = 1 }) {
  const { currency, money, local, chips, cardMin, symbol, fromBase } = useMoney();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [provider, setProvider] = useState('mock');
  const rank = Math.max(1, Number(targetRank) || 1);

  useEffect(() => {
    if (!open) return;
    api('/payments/config').then(c => setProvider(c.provider)).catch(() => setProvider('mock'));
  }, [open]);

  useEffect(() => {
    if (!open || !listing) return;
    setQuote(null);
    setAmount('');
    const q = `/challenge/quote?category=${encodeURIComponent(listing.category || 'instagram')}&listingId=${listing.id}&targetRank=${rank}`;
    api(q)
      .then(t => {
        setQuote(t);
        setAmount(String(Math.max(1, fromBase(t.minBid))));
      })
      .catch(() => setAmount(String((chips && chips[2]) || 101)));
  }, [open, listing, rank, currency]);

  if (!listing) return null;

  const amt = Math.floor(Number(amount) || 0);
  const fee = Math.round(amt * 0.1);
  const total = amt + fee;
  const cardReady = provider === 'stripe' && total >= cardMin;
  const defending = quote?.isDefend || (listing.rank && listing.rank > rank);
  const holder = quote?.currentHolder;

  const submit = async () => {
    if (amt < 1) return toast.error(`Minimum amount is ${symbol}1`);
    if (quote && amt < fromBase(quote.minBid)) {
      return toast.error(`Minimum to take #${rank} is ${money(quote.minBid)}`);
    }
    setLoading(true);
    const payload = {
      listingId: listing.id,
      amount: amt,
      currency,
      kind: 'SELF_PAY',
      targetRank: rank,
      plan: 'weekly',
      backerName: user?.name,
    };

    if (cardReady) {
      try {
        const c = await api('/payments/checkout', { method: 'POST', body: payload });
        if (c.url) {
          toast.success('Opening secure checkout...');
          window.location.assign(c.url);
          return;
        }
      } catch (e) {
        if (e.status === 409 && e.message) {
          setLoading(false);
          toast.error(e.message);
          api(`/challenge/quote?category=${listing.category}&listingId=${listing.id}&targetRank=${rank}`)
            .then(t => { setQuote(t); setAmount(String(Math.max(1, fromBase(t.minBid)))); })
            .catch(() => {});
          return;
        }
        if (e.status !== 503) {
          setLoading(false);
          return toast.error(e.message);
        }
      }
    }

    try {
      const d = await api('/support', { method: 'POST', body: payload });
      if (d.newRank === 1) toast.success(`🏆 YOU ARE #1 — ${listing.name} took the top spot!`);
      else if (d.missedTarget) toast.success(`You moved to #${d.newRank}. #${rank} moved — pay more to take it.`);
      else toast.success(`🔥 ${local(amt)} paid — you are now #${d.newRank}!`);
      onDone({
        ...listing,
        newRank: d.newRank,
        investedAmount: d.baseAmount || amt,
        raised: d.totalRaised,
        kind: 'SELF_PAY',
        movedUp: d.movedUp,
      });
      onClose();
    } catch (e) {
      toast.error(e.message);
      if (e.status === 409) {
        api(`/challenge/quote?category=${listing.category}&listingId=${listing.id}&targetRank=${rank}`)
          .then(t => { setQuote(t); setAmount(String(Math.max(1, fromBase(t.minBid)))); })
          .catch(() => {});
      }
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} wide title={defending ? `🔥 DEFEND #${rank}` : `🔥 TAKE #${rank}`}>
      <div className="space-y-4">
        <div className="brut p-4 bg-black text-white">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-[#FFE156]">
            <Swords size={14} strokeWidth={3} /> {defending ? 'Defend your position' : `Take #${rank}`}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="brut p-3 bg-[#FFE156] text-black">
              <div className="text-[10px] font-bold uppercase">Current #{rank}</div>
              <div className="font-comic text-xl leading-none mt-1 break-all">{holder?.name || 'Open slot'}</div>
              <div className="font-comic text-3xl mt-1">{money(quote?.currentAmount || 0)}</div>
            </div>
            <div className="brut p-3 bg-[#FF5DA2] text-white">
              <div className="text-[10px] font-bold uppercase">Minimum to take #{rank}</div>
              <div className="font-comic text-3xl mt-1">{quote ? money(quote.minBid) : '…'}</div>
              <div className="text-[11px] font-bold mt-1">Your new amount {quote ? money(quote.newTotal) : ''}</div>
            </div>
          </div>
          {quote && quote.minBid <= 200 && holder && (
            <div className="brut mt-3 p-2 bg-[#A0F04D] text-black text-xs font-bold text-center">
              ⚡ ONLY {money(quote.minBid)} TO TAKE #{rank}
            </div>
          )}
        </div>

        <div className="brut p-4 flex items-center gap-3 bg-[#FFE156]">
          {listing.image
            ? <img src={listing.image} alt={listing.name} className="w-12 h-12 brut object-cover bg-white" />
            : <div className="w-12 h-12 brut bg-white flex items-center justify-center text-2xl">{listing.logo}</div>}
          <div className="min-w-0">
            <div className="font-comic text-xl sm:text-2xl leading-none break-all">{listing.name}</div>
            <div className="text-xs font-bold uppercase">
              {listing.category} • currently #{listing.rank || quote?.myRank || '—'} • {money(listing.raised || quote?.myAmount || 0)}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-xs font-bold uppercase">Your bid ({currency})</div>
            <Sticker color="#FF5DA2" rotate={-3}><span className="text-white">MIN +{quote ? money(quote.minIncrement || 100) : '₹100'}</span></Sticker>
          </div>
          <div className="flex flex-wrap gap-2">
            {(chips || []).slice(0, 6).map(c => (
              <button key={c} onClick={() => setAmount(String(c))}
                className={`brut-btn px-3 py-2 text-sm ${String(c) === String(amount) ? 'is-pink bg-[#FF5DA2] text-white' : 'is-light bg-white'}`}>
                {local(c)}
              </button>
            ))}
          </div>
          <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)}
            className="brut w-full p-3 mt-3 outline-none font-comic text-2xl" />
        </div>

        <div className="brut p-4 bg-[#4DD4E6] space-y-1 text-sm font-bold">
          <div className="flex justify-between"><span>Your required amount</span><span>{local(amt || 0)}</span></div>
          <div className="flex justify-between"><span>Platform fee (10%)</span><span>{local(fee)}</span></div>
          <div className="flex justify-between font-comic text-2xl pt-2 border-t-2 border-black"><span>Total</span><span>{local(total)}</span></div>
        </div>

        <p className="text-[11px] font-semibold opacity-70">
          Pay {local(amt || 0)} to compete for a higher position on PayToTrend. This buys visibility on PayToTrend — not Instagram followers, likes, or engagement.
        </p>

        {cardReady ? (
          <div className="brut p-2 bg-[#4DD4E6] font-bold text-xs text-center">
            🔒 Secure Stripe checkout ({currency} sandbox) — test card 4242 4242 4242 4242
          </div>
        ) : (
          <div className="brut p-2 halftone-pink text-white font-bold text-xs text-center">
            🧪 DEMO MODE — no card is charged for this amount.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="brut-btn px-4 py-2 is-light bg-white">Cancel</button>
          <button onClick={submit} disabled={loading} className="brut-btn px-6 py-3 is-pink bg-[#FF5DA2] text-white text-lg inline-flex items-center gap-2">
            <Flame size={18} strokeWidth={3} />
            {loading ? 'Processing...' : `${defending ? '🔥 DEFEND' : '🔥 TAKE'} #${rank} — ${local(amt || 0)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
