import { type FormEvent } from 'react'
import Button from '../ui/Button'
import Input from '../ui/Input'

type DomainFormProps = {
  domainInput: string
  setDomainInput: (v: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  isBusy: boolean
}

export default function DomainForm({ domainInput, setDomainInput, onSubmit, isBusy }: DomainFormProps) {
  return (
    <form id="domain-form" className="input-form domain-form" onSubmit={onSubmit}>
      <Input
        id="custom-domain"
        label="Use your own domain"
        type="text"
        inputMode="url"
        placeholder="dev.yourcompany.com"
        value={domainInput}
        onChange={e => setDomainInput(e.target.value)}
        disabled={isBusy}
        helpText="After mapping, create a CNAME for this hostname pointing to your Kexoz endpoint."
      />
      <Button id="map-domain-btn" type="submit" variant="secondary" disabled={isBusy || !domainInput.trim()}>
        {isBusy ? 'Mapping...' : 'Map owned domain'}
      </Button>
    </form>
  )
}
