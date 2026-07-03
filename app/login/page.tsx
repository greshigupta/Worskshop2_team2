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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-2xl shadow-lg">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Todo App</h1>
        <p className="text-sm text-gray-500 mb-6">Sign in with your passkey — no password needed.</p>

        {!supported && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
            Your browser does not support passkeys. Please use Chrome, Safari, or Edge.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleRegister}
            disabled={loading || !supported}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? '…' : 'Register'}
          </button>
          <button
            onClick={handleLogin}
            disabled={loading || !supported}
            className="flex-1 py-2 bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? '…' : 'Login'}
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-4 text-center">
          🔑 Uses WebAuthn / Passkeys — your biometric never leaves your device
        </p>
      </div>
    </div>
  );
}
