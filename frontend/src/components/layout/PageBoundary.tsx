import { Component, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

/** Keep navigation and running shares available when a page fails. */
export default class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="ps-main">
        <div className="ps-page-content ps-page-content-stage">
          <div className="ps-page-error" role="alert">
            <RefreshCw size={24} aria-hidden="true" />
            <h1 className="ps-page-title">This page couldn’t open</h1>
            <p>Try opening this page again, or use the sidebar to continue. Your shares keep their current connection.</p>
            <button type="button" className="ps-btn ps-btn-primary" onClick={() => this.setState({ failed: false })}>Try again</button>
          </div>
        </div>
      </main>
    )
  }
}
