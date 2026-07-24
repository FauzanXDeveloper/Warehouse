'use client'

import { useState } from 'react'

export default function DBConnectionModal({ dbName, onClose, onConnect }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleConnect = () => {
    if (!username.trim()) { setError('Username is required'); return }
    if (!password.trim()) { setError('Password is required'); return }
    const result = onConnect(dbName, username, password)
    if (result?.success === false) {
      setError(result.error || 'Unable to connect with provided credentials.')
      return
    }
    setUsername('')
    setPassword('')
    setError('')
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }}>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Connect to {dbName}</h2>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Username</label>
          <input
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setError('') }}
            placeholder="Enter username"
            style={{ width: '100%', padding: '8px 12px', fontSize: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            placeholder="Enter password"
            style={{ width: '100%', padding: '8px 12px', fontSize: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {error && <div style={{ marginBottom: 16, padding: 10, background: 'rgba(248,81,73,0.1)', border: '1px solid #f85149', borderRadius: 4, color: '#f85149', fontSize: 11 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', fontSize: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            style={{ padding: '8px 16px', fontSize: 12, background: '#1f6feb', border: 'none', borderRadius: 4, cursor: 'pointer', color: 'white', fontWeight: 600 }}
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  )
}
