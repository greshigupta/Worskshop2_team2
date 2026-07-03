'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export default function LoginPage() {
  const router   = useRouter();
  const [username, setUsername] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [supported, setSupported] = useState(true);

  // Redirect to / if already authenticated
  useEffect(() => {
    fetch('/api/auth/me').then((r) => {
      if (r.ok) router.replace('/');
    });
    // Check WebAuthn support
    if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
      setSupported(false);
    }
  }, [router]);

  async function handleRegister() {
    if (!username.trim()) { setError('Please enter a username.'); return; }
    setError(''); setLoading(true);
    try {
      const optRes = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const options = await optRes.json();
      if (!optRes.ok) { setError(options.error); return; }

      const regResponse = await startRegistration({ optionsJSON: options });

      const verRes = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), response: regResponse }),
      });
      const result = await verRes.json();

      if (result.success) {
        router.push('/');
      } else {
        setError(result.error ?? 'Registration failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (!username.trim()) { setError('Please enter a username.'); return; }
    setError(''); setLoading(true);
    try {
      const optRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const options = await optRes.json();
      if (!optRes.ok) { setError(options.error); return; }

      const authResponse = await startAuthentication({ optionsJSON: options });

      const verRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), response: authResponse }),
      });
      const result = await verRes.json();

      if (result.success) {
        router.push('/');
      } else {
        setError(result.error ?? 'Login failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-200 rounded-full opacity-20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-200 rounded-full opacity-20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl shadow-blue-100 border border-white/60 p-8">
          {/* Logo / Icon */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <span className="text-white text-xl">✓</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">Todo App</h1>
              <p className="text-xs text-gray-400">Powered by passkeys</p>
            </div>
          </div>

          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Sign in or create your account using your device's biometric — no password required.
          </p>

          {!supported && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
              <span className="mt-0.5 flex-shrink-0">⚠️</span>
              <span>Your browser doesn't support passkeys. Please use Chrome, Safari, or Edge.</span>
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
              <span className="mt-0.5 flex-shrink-0">❌</span>
              <span>{error}</span>
            </div>
          )}

          <div className="mb-5">
            <label htmlFor="username" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="e.g. alice"
              disabled={loading || !supported}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white disabled:opacity-50"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRegister}
              disabled={loading || !supported}
              className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-200 hover:shadow-blue-300 hover:-translate-y-0.5 active:translate-y-0"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Working…
                </span>
              ) : '🔑 Register'}
            </button>
            <button
              onClick={handleLogin}
              disabled={loading || !supported}
              className="flex-1 py-3 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg shadow-gray-200 hover:shadow-gray-300 hover:-translate-y-0.5 active:translate-y-0"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Working…
                </span>
              ) : '🔓 Login'}
            </button>
          </div>

          <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-center gap-2 text-xs text-gray-400">
            <span>🔒</span>
            <span>Biometric never leaves your device</span>
          </div>
        </div>
      </div>
    </div>
  );
}
