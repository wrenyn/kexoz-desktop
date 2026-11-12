import { ArrowUpRight, Plus } from 'lucide-react'
import Logo from '../ui/Logo'

export default function WelcomePanel({ onNewShare, onCapture }: { onNewShare: () => void; onCapture?: () => void }) {
  return (
    <div className="ps-main">
      <div className="ps-page-content ps-page-content-stage">
        <section className="ps-welcome ps-welcome-calm animate-fade-up" aria-labelledby="welcome-title">
          <div className="ps-welcome-intro">
            <Logo className="ps-welcome-logo" />
            <span className="ps-welcome-eyebrow">Get started</span>
            <h1 id="welcome-title">Give your app a link.</h1>
            <p className="ps-welcome-copy">Share an app running on your computer. Send the link to anyone, collect feedback, and keep building.</p>
            <div className="ps-welcome-actions">
              <button type="button" className="ps-btn ps-btn-primary ps-btn-lg" onClick={onNewShare}><Plus size={16} aria-hidden="true" /> Create your first share</button>
              {onCapture && <button type="button" className="ps-btn ps-btn-ghost" onClick={onCapture}>Set up bug capture <ArrowUpRight size={14} aria-hidden="true" /></button>}
            </div>
          </div>
          <ol className="ps-welcome-guide">
            <li><span>01</span><div><strong>Run your app</strong><p>Start your local server and note its port.</p></div></li>
            <li><span>02</span><div><strong>Create a share</strong><p>Choose the port, address, and who can visit.</p></div></li>
            <li><span>03</span><div><strong>Send the link</strong><p>Keep Kexoz and your app running while others visit.</p></div></li>
          </ol>
        </section>
      </div>
    </div>
  )
}
