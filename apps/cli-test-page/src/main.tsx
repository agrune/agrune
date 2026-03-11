import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initializeBrowserClient } from '@webcli-dom/browser-client'
import App from './App.tsx'

void import('@webcli-dom/build-core/register')

initializeBrowserClient({
  appId: '@webcli-apps/cli-test-page',
  onGuideRequired: reason => {
    if (reason === 'companion-unavailable') {
      console.warn('[cli-test-page] companion이 실행되지 않았습니다. webcli-companion start를 실행하세요.')
    }
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
