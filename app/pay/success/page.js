'use client';
import { useEffect, useState } from 'react';
import { Sticker } from '@/components/brut';
import { api } from '@/lib/client';
import { useMoney } from '@/lib/currency';

export default function PaySuccess() {
  const { money } = useMoney();
  const [state, setState] = useState({ status: 'checking' });
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let stop = false;
    let n = 0;
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (!sessionId) { setState({ status: 'error', error: 'Missing payment session' }); return; }

    const poll = async () => {
      n += 1;
      setTries(n);
      try {
        const d = await api(`/payments/status?session_id=${encodeURIComponent(sessionId)}`);
        if (stop) return;
        if (d.status === 'paid') { setState({ status: 'paid', data: d }); return; }
        if (n >= 12) { setState({ status: 'pending' }); return; }
        setTimeout(poll, 1500);
      } catch (e) {
        if (stop) return;
        if (n >= 12) { setState({ status: 'error', error: e.message }); return; }
        setTimeout(poll, 1500);
      }
    };
    poll();
    return () => { stop = true; };
  }, []);

  const d = state.data || {};

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="brut-lg bg-white w-full max-w-lg p-5 sm:p-7">
        {state.status === 'checking' && (
          <>
            <div className="font-comic text-3xl sm:text-4xl">Confirming your payment...</div>
            <p className="text-sm font-semibold mt-2">Talking to Stripe. This usually takes a second or two. ({tries})</p>
          </>
        )}

        {state.status === 'paid' && (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <Sticker color="#A0F04D">PAYMENT SUCCESSFUL</Sticker>
              <Sticker color="#4DD4E6" rotate={3}>STRIPE SANDBOX</Sticker>
            </div>
            <div className="font-comic text-3xl sm:text-4xl leading-tight">
              {d.newRank === 1 ? '🏆 YOU ARE #1' : d.missedTarget ? '⚔️ Rank moved — you still climbed' : 'You climbed the board!'}
            </div>
            <div className="brut p-4 mt-4 halftone-yellow">
              <div className="flex items-center gap-3">
                {d.listingImage
                  ? <img src={d.listingImage} alt={d.listingName} className="w-14 h-14 brut object-cover bg-white" />
                  : <div className="w-14 h-14 brut bg-white flex items-center justify-center text-3xl">{d.listingLogo}</div>}
                <div className="min-w-0">
                  <div className="font-comic text-2xl leading-none break-all">{d.listingName}</div>
                  <div className="text-xs font-bold uppercase">{d.category}</div>
                </div>
              </div>
              <div className="font-comic text-5xl mt-3">#{d.newRank}</div>
              <div className="text-sm font-bold">{money(d.amount)} bid • {money(d.totalRaised)} on the board</div>
              {d.movedUp > 0 && <div className="text-sm font-bold mt-1">📈 YOU MOVED UP {d.movedUp} POSITIONS</div>}
            </div>
            {d.missedTarget && d.quoteNow && (
              <div className="brut p-3 mt-3 bg-[#FF5C4D] text-white text-sm font-bold">
                Someone else grabbed the rank first. Minimum to take #1 now: {money(d.quoteNow.minBid)}.
              </div>
            )}
            <p className="mt-3 text-xs font-semibold opacity-70">
              You paid for visibility on PayToTrend. This does not include Instagram followers, likes, or guaranteed engagement.
            </p>
            <div className="flex gap-2 mt-4 flex-wrap">
              <a href="/" className="brut-btn px-5 py-3 is-pink bg-[#FF5DA2] text-white">Back to leaderboard</a>
              <a href="/dashboard" className="brut-btn px-5 py-3 is-light bg-white">My dashboard</a>
            </div>
          </>
        )}

        {state.status === 'pending' && (
          <>
            <div className="font-comic text-3xl">Payment still processing</div>
            <p className="text-sm font-semibold mt-2">Stripe hasn&apos;t confirmed it yet. Your rank updates automatically the moment it does.</p>
            <a href="/" className="brut-btn inline-block mt-4 px-5 py-3 is-light bg-white">Back to leaderboard</a>
          </>
        )}

        {state.status === 'error' && (
          <>
            <div className="font-comic text-3xl">Hmm, we couldn&apos;t confirm that</div>
            <p className="text-sm font-semibold mt-2">{state.error}</p>
            <a href="/" className="brut-btn inline-block mt-4 px-5 py-3 is-light bg-white">Back to leaderboard</a>
          </>
        )}
      </div>
    </div>
  );
}
