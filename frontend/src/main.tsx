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
