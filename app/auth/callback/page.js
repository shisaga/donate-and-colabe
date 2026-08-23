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
        const params = new URLSearchParams(window.location.search);
        if (params.get('error')) {
          throw new Error(params.get('error_description') || 'Google login was cancelled.');
        }
        const code = params.get('code');
        const state = params.get('state');
        if (!code) throw new Error('Google login was cancelled or the authorization code is missing.');
        const res = await fetch('/api/auth/google/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
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
