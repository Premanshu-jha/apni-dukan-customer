import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { authApi } from '../../api/auth'
import { messageOf } from '../../api/errors'
import { CodeInput } from '../../components/CodeInput'
import { Banner, Button, Page } from '../../components/ui'
import { formatPhone } from '../../lib/phone'
import { useSession } from '../../store/session'
import { signOutHere } from './signOut'

export function DeleteAccount() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const phone = useSession((s) => s.user?.phone)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    setError(null)
    try {
      await authApi.sendDeleteCode()
      setSent(true)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await authApi.deleteAccount(code)
      // The backend has already ended every session; just forget everything here.
      await signOutHere(qc, { skipBackend: true })
      navigate('/signin', { replace: true, state: { deleted: true } })
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }

  return (
    <Page back="/profile" title="Delete account">
      <Banner tone="warn">
        This can't be undone. Your upcoming bookings are cancelled, your name, phone and email are removed, and you are
        signed out everywhere. Salons keep a record of past visits without your details.
      </Banner>
      {!sent ? (
        <Button variant="danger" busy={busy} onClick={send}>
          Send code to +91 {formatPhone(phone)}
        </Button>
      ) : (
        <div className="flex flex-col gap-4">
          <CodeInput id="delete-code" label="SMS code" value={code} onChange={setCode} />
          <Button variant="danger" busy={busy} disabled={code.length !== 6} onClick={remove}>
            Delete my account
          </Button>
        </div>
      )}
      {error && <Banner tone="bad">{error}</Banner>}
      <Button variant="secondary" onClick={() => navigate('/profile')}>
        Keep my account
      </Button>
    </Page>
  )
}
