import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setConfirmation(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // App re-renders automatically via onAuthStateChange
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (confirmation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-gray-100">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-mono text-white mb-2">Check your email</h1>
          <p className="text-gray-500 text-sm mb-6">
            We sent a confirmation link to <span className="text-gray-300">{email}</span>.
            Click it to activate your account, then sign in.
          </p>
          <button
            onClick={() => { setConfirmation(false); setMode('signin') }}
            className="text-accent text-sm hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-gray-100">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-mono text-white mb-1">PLO Session Analyser</h1>
          <p className="text-gray-500 text-sm">GGPoker · Multi-table · Client-side only</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-gray-800 mb-6 overflow-hidden">
          {(['signin', 'signup'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null) }}
              className={`flex-1 py-2 text-xs font-mono transition-colors ${
                mode === m ? 'bg-[#1a1a1a] text-white' : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {m === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent/60 placeholder-gray-700"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Password</label>
            <input
              type="password"
              required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-gray-700 rounded px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-accent/60 placeholder-gray-700"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded bg-accent text-black text-sm font-mono font-semibold hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-700 mt-6">
          Your hand histories never leave your browser — only aggregated session data is stored.
        </p>
      </div>
    </div>
  )
}
