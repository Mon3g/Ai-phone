import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    // For dev purposes, just navigate to dashboard.
    navigate('/');
  };

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-slate-800 rounded-lg">
      <h1 className="text-2xl mb-4">Sign in</h1>
      <form onSubmit={handleSubmit}>
        <label className="block mb-2">Email</label>
        <input
          className="w-full mb-4 px-3 py-2 rounded bg-slate-700"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <button className="px-4 py-2 bg-indigo-600 rounded">Sign in</button>
      </form>
    </div>
  );
}
