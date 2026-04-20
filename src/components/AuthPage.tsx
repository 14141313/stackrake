import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Field, Label, ErrorMessage } from './ui/fieldset'

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
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-gray-900">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl text-gray-900 mb-2">Check your email</h1>
          <p className="text-gray-500 text-sm mb-6">
            We sent a confirmation link to <span className="text-gray-700">{email}</span>.
            Click it to activate your account, then sign in.
          </p>
          <button
            onClick={() => { setConfirmation(false); setMode('signin') }}
            className="text-brand text-sm hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-gray-900">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl text-gray-900 mb-1">Stackrake</h1>
          <p className="text-gray-500 text-sm">PLO analytics · GGPoker & Natural8 · Client-side</p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-gray-200 mb-6 overflow-hidden">
          {(['signin', 'signup'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null) }}
              className={`flex-1 py-2 text-xs transition-colors ${
                mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {m === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field>
            <Label className="text-xs text-gray-500">Email</Label>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>

          <Field>
            <Label className="text-xs text-gray-500">Password</Label>
            <Input
              type="password"
              required
              minLength={mode === 'signup' ? 8 : undefined}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <Button
            type="submit"
            variant="solid"
            disabled={loading}
            className="w-full py-2.5"
          >
            {loading ? '…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Your hand histories never leave your browser — only aggregated session data is stored.
        </p>
      </div>
    </div>
  )
}
