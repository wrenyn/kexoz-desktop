import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './index.css'
import App from './App.js'

if (window.kexoz) {
  document.documentElement.dataset.frame = window.kexoz.platform === 'darwin' ? 'mac' : 'overlay'
}

createRoot(document.getElementById('root')!).render(
    <App />
)
