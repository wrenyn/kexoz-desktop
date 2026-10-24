import { ShieldCheck } from 'lucide-react'
import type { ClientSession } from '../../lib/api'
import ToggleSwitch from '../ui/ToggleSwitch'

type AuthToggleProps = {
  session: ClientSession
  gauthEnabled: boolean
  isBusy: boolean
  onToggle: () => void
  id?: string
}

export default function AuthToggle({ session, gauthEnabled, isBusy, onToggle, id }: AuthToggleProps) {
  return (
    <div className="gauth-section">
      <div className="gauth-info">
        <div className="gauth-icon" aria-hidden="true"><ShieldCheck size={24} /></div>
        <div>
          <p className="gauth-title">Google Auth Wall</p>
          <p className="gauth-desc">
            {gauthEnabled
              ? 'Require visitors to sign in with their Google account before accessing your tunnel.'
              : 'Google OAuth is not configured on this server. Set GOOGLE_CLIENT_ID to enable.'}
          </p>
        </div>
      </div>
      <ToggleSwitch
        id={id}
        checked={session.requireAuth}
        onClick={onToggle}
        disabled={isBusy || !gauthEnabled}
        title={!gauthEnabled ? 'Configure GOOGLE_CLIENT_ID on the server to enable' : ''}
      />
    </div>
  )
}
