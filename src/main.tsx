import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './index.css'
import App from './App'
import { registerSW } from 'virtual:pwa-register'

// Check for a new version on every start; when one has downloaded, it takes over and the page
// reloads once. Without this, people keep seeing the previous version until their next visit.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
