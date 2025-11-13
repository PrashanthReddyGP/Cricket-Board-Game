// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { SettingsProvider } from './SettingsContext.tsx'; // Import the provider
import { AuthProvider } from './AuthContext'; // Import AuthProvider

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <AuthProvider> {/* Wrap with AuthProvider */}
        <App />
      </AuthProvider>
    </SettingsProvider>
  </React.StrictMode>
)