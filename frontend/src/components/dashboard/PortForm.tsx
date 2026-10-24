import { type FormEvent } from 'react'
import { QUICK_PORTS } from '../../lib/storage'
import Button from '../ui/Button'

type PortFormProps = {
  portInput: string
  setPortInput: (v: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  isBusy: boolean
}

export default function PortForm({ portInput, setPortInput, onSubmit, isBusy }: PortFormProps) {
  return (
    <form id="port-form" className="input-form" onSubmit={onSubmit}>
      <label htmlFor="port">Local port to expose</label>

      <div className="port-quickpick">
        <span className="port-quickpick-label">Quick:</span>
        {QUICK_PORTS.map(p => (
          <button
            key={p}
            type="button"
            className="port-pill"
            onClick={() => setPortInput(String(p))}
          >
            {p}
          </button>
        ))}
      </div>

      <input
        id="port"
        type="number"
        inputMode="numeric"
        min={1}
        max={65535}
        placeholder="3000"
        value={portInput}
        onChange={e => setPortInput(e.target.value)}
        disabled={isBusy}
      />
      <Button id="expose-port-btn" type="submit" jumbo disabled={isBusy}>
        {isBusy ? 'Updating...' : '⚡ Expose this port'}
      </Button>
    </form>
  )
}
