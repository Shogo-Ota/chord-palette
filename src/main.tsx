import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { warnIfInsecureContext } from './utils/clipboard'

// 開発時 LAN（非 HTTPS）で起動した場合は開発者向けに console.warn する。
// ユーザー向けの UI は出さない（fallback が走るため利用には支障がない）。
warnIfInsecureContext()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
