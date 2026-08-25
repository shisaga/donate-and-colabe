'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Flame, Swords } from 'lucide-react';
import { Modal } from './brut';
import { api } from '@/lib/client';
import { useMoney } from '@/lib/currency';

function loadRazorpayScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Razorpay is only available in the browser'));
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay checkout')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Could not load Razorpay checkout'));
    document.body.appendChild(script);
  });
}

function openRazorpayModal({ key, order_id, amount, currency, description, name, email }) {
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key,
      amount,
      currency,
      name: 'PayToTrend',
      description,
      order_id,
      prefill: { name: name || '', email: email || '' },
      theme: { color: '#FF5DA2' },
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => {
          const err = new Error('Payment cancelled');
          err.cancelled = true;
          reject(err);
        },
      },
    });
    rzp.on('payment.failed', (resp) => {
      reject(new Error(resp?.error?.description || 'Payment failed'));
    });
    rzp.open();
  });
}

export default function InvestModal({ open, onClose, listing, onDone, user, mode = 'SELF_PAY', targetRank = 1 }) {
  const { currency, money, local, chips, symbol, fromBase } = useMoney();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const rank = Math.max(1, Number(targetRank) || 1);

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

  const fan = mode === 'FAN' || mode === 'DONATION' || mode === 'FAN_BOOST';
  const amt = Math.floor(Number(amount) || 0);
  const total = amt;
  const defending = !fan && (quote?.isDefend || (listing.rank && listing.rank > rank));
  const holder = quote?.currentHolder;

  const finish = (d) => {
    if (d.newRank === 1) toast.success(fan ? `🏆 You pushed ${listing.name} to #1!` : `🏆 YOU ARE #1 — ${listing.name} took the top spot!`);
    else if (d.missedTarget) toast.success(`Moved to #${d.newRank}. #${rank} moved — pay more to take it.`);
    else toast.success(fan ? `🔥 Fan boost paid — ${listing.name} is now #${d.newRank}!` : `🔥 ${local(amt)} paid — you are now #${d.newRank}!`);
    onDone({
      ...listing,
      newRank: d.newRank,
      investedAmount: d.baseAmount || amt,
      raised: d.totalRaised,
      kind: fan ? 'FAN' : 'SELF_PAY',
      movedUp: d.movedUp,
    });
    onClose();
  };

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
      kind: fan ? 'FAN' : 'SELF_PAY',
      targetRank: rank,
      plan: 'weekly',
      backerName: user?.name,
    };

    try {
      await loadRazorpayScript();
      const order = await api('/create-order', { method: 'POST', body: payload });
      const key = order.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!key) throw new Error('Razorpay key is missing');
      const checkout = await openRazorpayModal({
        key,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        description: fan
          ? `Fan boost #${rank} — ${listing.name}`
          : `Take #${rank} — ${listing.name}`,
        name: user?.name,
        email: user?.email,
      });
      const verified = await api('/verify-payment', {
        method: 'POST',
        body: {
          razorpay_payment_id: checkout.razorpay_payment_id,
          razorpay_order_id: checkout.razorpay_order_id,
          razorpay_signature: checkout.razorpay_signature,
        },
      });
      finish(verified);
    } catch (e) {
      if (e.cancelled) {
        toast.message('Payment cancelled. Nothing was charged.');
      } else {
        toast.error(e.message);
      }
      if (e.status === 409) {
        api(`/challenge/quote?category=${listing.category}&listingId=${listing.id}&targetRank=${rank}`)
          .then(t => { setQuote(t); setAmount(String(Math.max(1, fromBase(t.minBid)))); })
          .catch(() => {});
      }
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} wide title={fan ? `🔥 PAY TO MAKE THEM #${rank}` : defending ? `🔥 DEFEND #${rank}` : `🔥 PAY TO TAKE #${rank}`}>
      <div className="space-y-4">
        <div className="brut p-4 bg-black text-white">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-[#FFE156]">
            <Swords size={14} strokeWidth={3} /> {fan ? `Fan boost — pay to push ${listing.name} to #${rank}` : defending ? 'Defend your position' : `Pay to take #${rank}`}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="brut p-3 bg-[#FFE156] text-black">
              <div className="text-[10px] font-bold uppercase">Current #{rank}</div>
              <div className="font-comic text-xl leading-none mt-1 break-all">{holder?.name || 'Open slot'}</div>
              <div className="font-comic text-3xl mt-1">{money(quote?.currentAmount || 0)}</div>
            </div>
            <div className="brut p-3 bg-[#FF5DA2] text-white">
              <div className="text-[10px] font-bold uppercase">To take #{rank}</div>
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
            <div className="text-xs font-bold uppercase">Your bid ({currency}) — any amount from {symbol}1</div>
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
          <div className="flex justify-between font-comic text-2xl pt-2 border-t-2 border-black"><span>Total</span><span>{local(total)}</span></div>
        </div>

        <p className="text-[11px] font-semibold opacity-70">
          {fan
            ? `Pay ${local(amt || 0)} as a fan to push ${listing.name} higher. Rank is always live — there is no contest end date. This buys visibility on PayToTrend, not Instagram followers.`
            : `Pay ${local(amt || 0)} to move your profile higher. Rank is always live — pay more anytime to take #1. This buys visibility on PayToTrend, not Instagram followers, likes, or engagement.`}
        </p>

        <div className="brut p-2 bg-[#4DD4E6] font-bold text-xs text-center">
          🔒 Secure Razorpay checkout — test cards work with this key
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="brut-btn px-4 py-2 is-light bg-white">Cancel</button>
          <button onClick={submit} disabled={loading} className="brut-btn px-6 py-3 is-pink bg-[#FF5DA2] text-white text-lg inline-flex items-center gap-2">
            <Flame size={18} strokeWidth={3} />
            {loading ? 'Processing...' : fan ? `🔥 PAY TO BOOST #${rank} — ${local(amt || 0)}` : `${defending ? '🔥 DEFEND' : '🔥 PAY TO TAKE'} #${rank} — ${local(amt || 0)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
