import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@webcli-dom/build-core/register'
import { initializeWebCliBrowserClient } from '@webcli-dom/browser-client'
import './index.css'
import App from './App.tsx'

initializeWebCliBrowserClient({
  appId: '@webcli-apps/cli-test-page',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
