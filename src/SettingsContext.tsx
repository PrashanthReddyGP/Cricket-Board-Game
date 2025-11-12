// src/SettingsContext.tsx
import React, { createContext, useState, useContext } from 'react';
import type { ReactNode } from 'react';

// Define the shape of our settings
export interface GameSettings {
    allowAntiClockwise: boolean;
    killRule: 'jackpot' | 'fortress';
    stealLevelOnKill: true,
}

// Define the shape of the context value
interface SettingsContextType {
  settings: GameSettings;
  setSettings: React.Dispatch<React.SetStateAction<GameSettings>>;
}

// Create the context with a default value
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Create a provider component
export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<GameSettings>({
    allowAntiClockwise: false, // Default to disabled as per our last change
    killRule: 'jackpot',     // Default to the more aggressive rule
    stealLevelOnKill: true,
  });

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

// Create a custom hook for easy access to the context
export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};