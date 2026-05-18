import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'
import { LanguageProvider } from './i18n.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 5000 }} containerStyle={{ pointerEvents: 'none' }} toastOptions={{ duration: 5000, style: { pointerEvents: 'auto' } }} />
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </StrictMode>
)
