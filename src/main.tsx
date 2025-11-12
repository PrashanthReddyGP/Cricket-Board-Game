// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { SettingsProvider } from './SettingsContext.tsx'; // Import the provider

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider> {/* Wrap App with the provider */}
      <App />
    </SettingsProvider>
  </React.StrictMode>,
)