import { ArrowUpRight, Globe, Link2, MessageSquare, Plus } from 'lucide-react'
import Logo from '../ui/Logo'

export default function WelcomePanel({ onNewShare }: { onNewShare: () => void }) {
  return (
    <div className="ps-main">
      <div className="ps-page-header"><div><h1 className="ps-page-title">Your workspace</h1><p className="ps-page-subtitle">Local apps. Shared with the people who need to see them.</p></div></div>
      <div className="ps-page-content">
        <section className="ps-welcome animate-fade-up" aria-labelledby="welcome-title">
          <div className="ps-welcome-intro"><Logo style={{ width: 48, height: 48 }} /><span className="ps-welcome-eyebrow">YOUR FIRST PREVIEW</span><h2 id="welcome-title">Good work deserves<br />a second pair of eyes.</h2><p>Share the app running on this computer. Your teammates open a link in their browser, and you keep building.</p><button type="button" className="ps-btn ps-btn-primary" onClick={onNewShare}><Plus size={15} /> Create your first share</button><span className="ps-welcome-note">No deployment needed. Stop sharing whenever you’re done.</span></div>
          <ol className="ps-welcome-steps">
            <li><span className="ps-welcome-step-icon"><Globe size={18} /></span><div><span>01 / START LOCALLY</span><h3>Run your app</h3><p>Start your development server, for example on localhost:3000.</p></div></li>
            <li><span className="ps-welcome-step-icon"><Link2 size={18} /></span><div><span>02 / MAKE A LINK</span><h3>Choose a port and share</h3><p>Add the port in Kexoz. Choose who can open the link and start sharing.</p></div></li>
            <li><span className="ps-welcome-step-icon"><MessageSquare size={18} /></span><div><span>03 / REVIEW TOGETHER</span><h3>Get feedback in context</h3><p>Enable visual review to let visitors pin notes directly on your website.</p></div></li>
          </ol>
        </section>
        <div className="ps-welcome-help"><span>Keep your app and Kexoz running while people review.</span><a href="https://kexoz.dev/docs" target="_blank" rel="noreferrer">Read the getting started guide <ArrowUpRight size={13} /></a></div>
      </div>
    </div>
  )
}
