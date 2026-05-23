import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('password'); // 'password' | 'magic'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (mode === 'magic') {
      const { error: err } = await supabase.auth.signInWithOtp({ email });
      setLoading(false);
      if (err) return setError(err.message);
      setMessage('Check your email for a login link.');
      return;
    }

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) return setError(err.message);
    navigate('/');
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-slate-800 rounded-lg">
      <h1 className="text-2xl mb-6 font-semibold">Sign in</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1 text-sm text-slate-300">Email</label>
          <input
            type="email"
            required
            className="w-full px-3 py-2 rounded bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        {mode === 'password' && (
          <div>
            <label className="block mb-1 text-sm text-slate-300">Password</label>
            <input
              type="password"
              required
              className="w-full px-3 py-2 rounded bg-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {message && <p className="text-green-400 text-sm">{message}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded font-medium transition-colors"
        >
          {loading ? 'Please wait…' : mode === 'magic' ? 'Send magic link' : 'Sign in'}
        </button>
      </form>

      <button
        className="mt-4 text-sm text-slate-400 hover:text-slate-200 underline"
        onClick={() => { setMode(mode === 'password' ? 'magic' : 'password'); setError(''); setMessage(''); }}
      >
        {mode === 'password' ? 'Sign in with magic link instead' : 'Sign in with password instead'}
      </button>
    </div>
  );
}
