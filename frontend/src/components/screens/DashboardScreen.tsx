import { motion } from 'motion/react'
import { type FormEvent } from 'react'
import type { ClientSession, ConnectionState } from '../../lib/api'
import StatusGrid from '../dashboard/StatusGrid'
import PortForm from '../dashboard/PortForm'
import DomainForm from '../dashboard/DomainForm'
import BandwidthMeter from '../dashboard/BandwidthMeter'
import AuthToggle from '../dashboard/AuthToggle'
import Divider from '../ui/Divider'

type DashboardScreenProps = {
  session: ClientSession
  connState: ConnectionState
  portInput: string
  setPortInput: (v: string) => void
  onPortSubmit: (e: FormEvent<HTMLFormElement>) => void
  domainInput: string
  setDomainInput: (v: string) => void
  onDomainSubmit: (e: FormEvent<HTMLFormElement>) => void
  gauthEnabled: boolean
  onAuthToggle: () => void
  isBusy: boolean
}

export default function DashboardScreen({
  session, connState, portInput, setPortInput, onPortSubmit,
  domainInput, setDomainInput, onDomainSubmit,
  gauthEnabled, onAuthToggle, isBusy
}: DashboardScreenProps) {
  return (
    <motion.section
      className="panel"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <p className="panel-kicker">Port Dashboard</p>
      <h1>Expose a local port</h1>
      <p className="panel-text">Set the local port that should be forwarded to your public URL.</p>

      <StatusGrid connState={connState} session={session} />
      <BandwidthMeter session={session} />
      
      <div style={{ marginTop: '32px' }}>
        <PortForm
          portInput={portInput}
          setPortInput={setPortInput}
          onSubmit={onPortSubmit}
          isBusy={isBusy}
        />
      </div>

      <Divider />

      <DomainForm
        domainInput={domainInput}
        setDomainInput={setDomainInput}
        onSubmit={onDomainSubmit}
        isBusy={isBusy}
      />

      <Divider />

      <AuthToggle
        id="gauth-toggle-btn-dashboard"
        session={session}
        gauthEnabled={gauthEnabled}
        isBusy={isBusy}
        onToggle={onAuthToggle}
      />
    </motion.section>
  )
}
