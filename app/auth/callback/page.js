'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setToken } from '@/lib/client';

export default function GoogleCallback() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const run = async () => {
      try {
        const hash = window.location.hash || '';
        const sessionId = new URLSearchParams(hash.replace(/^#/, '')).get('session_id');
        if (!sessionId) throw new Error('Google login was cancelled or the session id is missing.');
        const res = await fetch('/api/auth/google/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Google login failed');
        setToken(data.token);
        let back = '/';
        try { back = window.sessionStorage.getItem('dc_after_login') || '/'; } catch (e) {}
        router.replace(back);
      } catch (e) {
        setError(e.message);
      }
    };
    run();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="brut-lg bg-white p-8 max-w-md text-center">
        <div className="font-comic text-4xl">{error ? 'Login failed' : 'Signing you in...'}</div>
        <p className="font-semibold mt-2 text-sm">{error || 'Hang tight, finishing up your Google login.'}</p>
        {error && <a href="/" className="brut-btn inline-block mt-4 px-5 py-2 bg-[#FFE156]">← Back home</a>}
      </div>
    </div>
  );
}
