import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import App from './App.js'

if (window.kexoz) {
  document.documentElement.dataset.frame = window.kexoz.platform === 'darwin' ? 'mac' : 'overlay'
}

createRoot(document.getElementById('root')!).render(
  <App />
)

// Drop the HTML boot splash once React has painted, so first launch never
// flashes Electron's default page or a blank chrome surface.
requestAnimationFrame(() => {
  const boot = document.getElementById('boot')
  if (!boot) return
  boot.hidden = true
  boot.remove()
})
