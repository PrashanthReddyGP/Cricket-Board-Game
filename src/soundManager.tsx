// src/soundManager.tsx

// A type-safe list of all our sound effects
export type SoundEffect = 
  | 'click'
  | 'dice'
  | 'tokenMove'
  | 'tokenLand'
  | 'score'
  | 'extra'
  | 'wicket'
  | 'collision'
  | 'levelUp';

// Map sound names to their file paths in the /public folder
const soundFiles: Record<SoundEffect, string> = {
  click: '/sounds/click.mp3',
  dice: '/sounds/dice.mp3',
  tokenMove: '/sounds/token-move.mp3',
  tokenLand: '/sounds/token-land.mp3',
  score: '/sounds/score-2.mp3',
  extra: '/sounds/extra.mp3',
  wicket: '/sounds/collision.mp3',
  collision: '/sounds/collision.mp3',
  levelUp: '/sounds/level-up.mp3',
};

// A function to play a sound
export const playSound = (sound: SoundEffect, volume: number = 0.5) => {
  const filePath = soundFiles[sound];
  if (!filePath) {
    console.warn(`Sound not found: ${sound}`);
    return;
  }
  
  const audio = new Audio(filePath);
  audio.volume = volume;
  
  // Browsers require user interaction to play audio. This handles it gracefully.
  audio.play().catch(error => {
    // Autoplay was prevented. This is normal on the first load.
    // Subsequent plays after a user click will work.
    console.log(`Audio play failed: ${error.message}. This is expected before the first user interaction.`);
  });
};