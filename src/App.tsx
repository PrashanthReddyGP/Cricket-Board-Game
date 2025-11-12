// src/App.tsx

import { useState, useMemo, useEffect } from 'react';
import { Game } from './game';
import { GameMode, PlayerColor, SquareType } from './types';
import type { DiceResult, PlayerToken, IPlayer, AnimatingToken, GameSettings } from './types';
import './App.css';
import { boardLayout } from './boardLayout';
import { useSettings } from './SettingsContext';

const AI_THINKING_TIME = 1000; // 1 second delay for AI moves
type AITurnPhase = 'idle' | 'thinking' | 'rolled' | 'deciding' | 'moving';

// Animation Constants
const LIFT_DURATION = 200;
const MOVE_DURATION = 180;
const LAND_DURATION = 300;

// Type for our simple router
type GameState = 'home' | 'settings' | 'playing' | 'end';
type GameType = 'human-vs-ai' | 'multiplayer';

//================================================================================
// MAIN APP COMPONENT (ACTS AS A ROUTER)
//================================================================================
function App() {
  const [gameState, setGameState] = useState<GameState>('home');
  const [gameType, setGameType] = useState<GameType>('human-vs-ai');
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.T20);
  const [gameId, setGameId] = useState(1);
  const { settings } = useSettings(); // Get settings from context

  const startGame = (mode: GameMode) => { setGameMode(mode); setGameState('playing'); };
  const endGame = () => { setGameState('end'); };
  const restartGame = () => { setGameId(id => id + 1); setGameState('playing'); };
  const goHome = () => { setGameId(id => id + 1); setGameState('home'); };
  const showSettings = () => { setGameState('settings'); };

  // The game instance is now part of the GameScreen
  const gameInstance = useMemo(() => {
    const humanPlayer = gameType === 'human-vs-ai' ? PlayerColor.Blue : undefined;
    return new Game(gameMode, [PlayerColor.Blue, PlayerColor.Yellow, PlayerColor.Green, PlayerColor.Purple], settings, humanPlayer);
  }, [gameId, gameMode, settings, gameType]);

  return (
    <div className="app-container">
      <h1>Cricket Board Game</h1>
      {gameState === 'home' && <HomeScreen onStartGame={startGame} onShowSettings={showSettings} />}
      {gameState === 'settings' && <SettingsScreen onGoHome={goHome} />}
      {gameState === 'playing' && <GameScreen key={gameId} gameInstance={gameInstance} onGameEnd={endGame} />}
      {gameState === 'end' && <EndScreen gameInstance={gameInstance} onRestart={restartGame} onGoHome={goHome} />}
    </div>
  );
}

//================================================================================
// HOME SCREEN COMPONENT
//================================================================================
const HomeScreen = ({ onStartGame, onShowSettings }: { onStartGame: (mode: GameMode, type: GameType) => void; onShowSettings: () => void; }) => (
  <div className="screen home-screen">
    <h2>Single Player (vs AI)</h2>
    <div className="mode-selection">
      <button onClick={() => onStartGame(GameMode.T20, 'human-vs-ai')}>T20</button>
      <button onClick={() => onStartGame(GameMode.FiftyFifty, 'human-vs-ai')}>50-50</button>
      <button onClick={() => onStartGame(GameMode.Test, 'human-vs-ai')}>Test Match</button>
    </div>
    {/* You can add a multiplayer section here later */}
    <div className="home-buttons">
        <button className="secondary" onClick={onShowSettings}>Settings</button>
    </div>
  </div>
);

//================================================================================
// SETTINGS SCREEN
//================================================================================
const SettingsScreen = ({ onGoHome }: { onGoHome: () => void }) => {
    const { settings, setSettings } = useSettings();

    const handleSettingChange = (setting: keyof GameSettings, value: any) => {
        setSettings(prev => ({ ...prev, [setting]: value }));
    };

    return (
        <div className="screen settings-screen">
            <h2>Game Rules</h2>
            <div className="settings-list">
                <div className="setting-row">
                    <label>Movement Direction</label>
                    <div className="toggle-switch">
                        <button className={!settings.allowAntiClockwise ? 'active' : ''} onClick={() => handleSettingChange('allowAntiClockwise', false)}>Clockwise Only</button>
                        <button className={settings.allowAntiClockwise ? 'active' : ''} onClick={() => handleSettingChange('allowAntiClockwise', true)}>Both Ways</button>
                    </div>
                </div>
                <div className="setting-row">
                    <label>Kill Rule</label>
                     <div className="toggle-switch">
                        <button className={settings.killRule === 'jackpot' ? 'active' : ''} onClick={() => handleSettingChange('killRule', 'jackpot')}>Jackpot</button>
                        <button className={settings.killRule === 'fortress' ? 'active' : ''} onClick={() => handleSettingChange('killRule', 'fortress')}>Fortress</button>
                    </div>
                </div>
                <div className="setting-row">
                    <label>Steal Level on Kill</label>
                     <div className="toggle-switch">
                        <button className={settings.stealLevelOnKill ? 'active' : ''} onClick={() => handleSettingChange('stealLevelOnKill', true)}>Enabled</button>
                        <button className={!settings.stealLevelOnKill ? 'active' : ''} onClick={() => handleSettingChange('stealLevelOnKill', false)}>Disabled</button>
                    </div>
                </div>
            </div>
            <div className="settings-buttons">
                <button onClick={onGoHome}>Back to Home</button>
            </div>
        </div>
    );
};

//================================================================================
// GAME SCREEN COMPONENT (Our previous App logic is now here)
//================================================================================
const GameScreen = ({ gameInstance, onGameEnd }: { gameInstance: Game; onGameEnd: () => void }) => {
  const [gameVersion, setGameVersion] = useState(0);
  const [diceResult, setDiceResult] = useState<DiceResult | null>(null);
  const [waitingForTokenChoice, setWaitingForTokenChoice] = useState(false);
  const [animatingToken, setAnimatingToken] = useState<AnimatingToken | null>(null);

  const currentPlayer = gameInstance.getCurrentPlayer();
  const allTokens = gameInstance.players.flatMap(p => p.tokens.map(t => ({ ...t, color: p.color })));
  const [aiTurnPhase, setAiTurnPhase] = useState<AITurnPhase>('idle');
  const [isDiceRolling, setIsDiceRolling] = useState(false);

  // --- AI TURN AUTOMATION ---
  useEffect(() => {
    // Only run this logic if it's an AI's turn and nothing else is happening.
    if (!currentPlayer.isAI || animatingToken || gameInstance.isGameOver || aiTurnPhase !== 'idle') {
      return;
    }

    // Phase 1: AI starts "thinking"
    setAiTurnPhase('thinking');
    console.log(`--- It's ${currentPlayer.name}'s (AI) turn ---`);
    
    setTimeout(() => {
      // Phase 2: AI rolls the dice.
      const aiDiceResult = gameInstance.rollDice();
      setDiceResult(aiDiceResult); // This makes the result visible in the UI
      setAiTurnPhase('rolled');
      console.log(`[AI] ${currentPlayer.name} rolled a ${aiDiceResult.movement}`);

      setTimeout(() => {
        // Phase 3: AI makes a decision.
        const chosenTokenId = gameInstance.makeAIDecision(currentPlayer, aiDiceResult);
        setAiTurnPhase('deciding');
        // We can add a visual effect for the chosen token later if desired.

        setTimeout(() => {
            // Phase 4: AI triggers the move animation.
            setAiTurnPhase('moving');
            handleTokenMove(chosenTokenId, aiDiceResult);
        }, 500); // Short delay after deciding

      }, 1500); // 1.5 second delay to show the dice result

    }, AI_THINKING_TIME); // 1 second "thinking" time before rolling

  }, [currentPlayer, animatingToken, gameInstance, aiTurnPhase]); // Depend on the phase

  // When an animation finishes, reset the AI phase to 'idle' for the next turn.
  useEffect(() => {
      if (!animatingToken) {
          setAiTurnPhase('idle');
      }
  }, [animatingToken]);

  // Check for game over condition
  if (gameInstance.isGameOver) {
    onGameEnd();
  }
  
  const handleRollDice = () => {
    if (gameInstance.isGameOver || waitingForTokenChoice || animatingToken || currentPlayer.isAI) return;
    const result = gameInstance.rollDice();
    setDiceResult(result);
    setWaitingForTokenChoice(true);
  };
  
  const handleTokenMove = (tokenId: 1 | 2, moveDiceResult = diceResult) => {
    if (!moveDiceResult || animatingToken) return;
    const player = gameInstance.getCurrentPlayer();
    const token = player.tokens.find(t => t.id === tokenId)!;
    const path = gameInstance.getMovementPath(token.positionIndex, moveDiceResult);
    setWaitingForTokenChoice(false);
    setAnimatingToken({ playerColor: player.color, tokenId, path, currentStep: 0, phase: 'lifting', startPosition: token.positionIndex, level: token.level });
    setTimeout(() => {
      path.forEach((_, index) => {
        setTimeout(() => setAnimatingToken(prev => prev ? { ...prev, currentStep: index + 1, phase: 'moving' } : null), index * MOVE_DURATION);
      });
      const totalMoveTime = path.length * MOVE_DURATION;
      setTimeout(() => {
        setAnimatingToken(prev => prev ? { ...prev, phase: 'landing' } : null);
        setTimeout(() => {
          gameInstance.playTurn(tokenId, moveDiceResult);
          setAnimatingToken(null);
          setDiceResult(null);
          setGameVersion(v => v + 1);
        }, LAND_DURATION);
      }, totalMoveTime);
    }, LIFT_DURATION);
  };

  return (
      <Board
        tokens={allTokens}
        players={gameInstance.players}
        currentPlayer={currentPlayer}
        animatingToken={animatingToken}
        onRollDice={handleRollDice}
        onTokenMove={handleTokenMove}
        waitingForTokenChoice={waitingForTokenChoice}
        isGameOver={gameInstance.isGameOver}
        diceResult={diceResult}
      />
  );
};

//================================================================================
// END SCREEN COMPONENT
//================================================================================
const EndScreen = ({ gameInstance, onRestart, onGoHome }: { gameInstance: Game; onRestart: () => void; onGoHome: () => void; }) => {
    const sortedPlayers = [...gameInstance.players].sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];

    return (
        <div className="screen end-screen">
            <h2>Game Over!</h2>
            <h3>🎉 {winner.name} wins the game! 🎉</h3>
            <div className="scoreboard">
                {sortedPlayers.map((player, index) => (
                    <div key={player.id} className="score-row">
                        <span className="rank">{index + 1}.</span>
                        <span className="name" style={{ color: `var(--${player.color.toLowerCase()})`}}>{player.name}</span>
                        <span className="score">{player.score} - {player.wickets}</span>
                    </div>
                ))}
            </div>
            <div className="end-buttons">
                <button onClick={onRestart}>Play Again</button>
                <button onClick={onGoHome}>Go to Home</button>
            </div>
        </div>
    );
};

//================================================================================
// NEW DICE COMPONENT
//================================================================================
const Dice = ({ number, color, isRolling }: { number: number; color?: string; isRolling?: boolean }) => {
  return (
    <div className={`dice-face ${isRolling ? 'rolling' : 'final-result'}`} style={{ color }}>
      {Array.from({ length: number }).map((_, i) => (
        <span key={i} className="pip" />
      ))}
    </div>
  );
};

// --- Board and UI Components ---
type BoardProps = {
  tokens: (PlayerToken & { color: PlayerColor })[];
  players: IPlayer[];
  currentPlayer: IPlayer;
  isGameOver: boolean;
  waitingForTokenChoice: boolean;
  onTokenMove: (tokenId: 1 | 2) => void;
  animatingToken: AnimatingToken | null;
  onRollDice: () => void;
  diceResult: DiceResult | null;
};

const Board = ({ tokens, players, currentPlayer, animatingToken, onRollDice, onTokenMove, waitingForTokenChoice, isGameOver, diceResult }: BoardProps) => {
  const staticTokens = animatingToken 
    ? tokens.filter(t => !(t.color === animatingToken.playerColor && t.id === animatingToken.tokenId))
    : tokens;

  return (
    <div className="board">
      {boardLayout.map(squareInfo => (
        <Square
          key={squareInfo.index}
          squareInfo={squareInfo}
          tokens={staticTokens}
          isWaitingForChoice={waitingForTokenChoice}
          currentPlayerColor={currentPlayer.color}
          onTokenMove={onTokenMove}
          isAnimating={!!animatingToken}
        />
      ))}
      
      {animatingToken && <AnimatingToken token={animatingToken} />}
      
      <ControlHub 
        isGameOver={isGameOver} 
        waitingForTokenChoice={waitingForTokenChoice} 
        diceResult={diceResult} 
        onRollDice={onRollDice} 
        currentPlayer={currentPlayer}
      />

       {players.map((p: IPlayer) => {
        let position = '';
        if (p.color === PlayerColor.Blue) position = 'tl';
        else if (p.color === PlayerColor.Purple) position = 'tr';
        else if (p.color === PlayerColor.Yellow) position = 'bl';
        else if (p.color === PlayerColor.Green) position = 'br';
        if (!position) return null;
        return <QuadrantScore key={p.id} player={p} isCurrent={currentPlayer.id === p.id} position={position} />
      })}
    </div>
  );
};

// This component renders the moving token
const AnimatingToken = ({ token }: { token: AnimatingToken }) => {
  let posIndex;
  
  if (token.phase === 'lifting') {
    posIndex = token.startPosition;
  } else {
    // Make sure we don't go out of bounds if currentStep is 0
    posIndex = token.path[Math.max(0, token.currentStep - 1)];
  }
                                                                            
  const coords = boardLayout[posIndex]?.coords;
  
  // Prevent crash if coords are not found
  if (!coords) {
    return null; 
  }

  const style = {
    top: `calc(${coords.row * (70 + 6) + 12}px)`,
    left: `calc(${coords.col * (70 + 6) + 12}px)`,
  };

  return (
    <div className={`animating-token-wrapper ${token.phase}`} style={style}>
        <div className={`token ${token.playerColor.toLowerCase()}`}>{token.level}x</div>
    </div>
  );
};

const Square = ({ squareInfo, tokens, isWaitingForChoice, currentPlayerColor, onTokenMove, isAnimating }: any) => {
  const tokensOnSquare = tokens.filter((t: any) => t.positionIndex === squareInfo.index);
  const hasTokens = tokensOnSquare.length > 0;
  const gridStyle = { gridColumn: squareInfo.coords.col + 1, gridRow: squareInfo.coords.row + 1 };

  return (
    // Add a class here if the square is occupied
    <div style={gridStyle} className={`square playable ${hasTokens ? 'occupied' : ''}`}>
      <SquareContent type={squareInfo.type} value={squareInfo.value} />
      <div className="token-container" style={{ pointerEvents: isAnimating ? 'none' : 'auto' }}>
        {tokensOnSquare.map((token: any, i: number) => {
          const isSelectable = isWaitingForChoice && token.color === currentPlayerColor;
          return (
            <div
              key={i}
              className={`token ${token.color.toLowerCase()} ${isSelectable ? 'selectable' : ''}`}
              onClick={isSelectable ? () => onTokenMove(token.id) : undefined}
            >
              {token.level}x
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ControlHub = ({ isGameOver, waitingForTokenChoice, diceResult, onRollDice, currentPlayer }: any) => {
    const diceColorVar = diceResult?.direction === 'Green' ? 'var(--action-green)' : `var(--${diceResult?.direction.toLowerCase()})`;

    return (
        <div className={`control-hub ${waitingForTokenChoice ? 'waiting' : ''}`}>
            {!waitingForTokenChoice && !currentPlayer.isAI ? (
                <button onClick={onRollDice} disabled={!!diceResult}>Roll Dice</button>
            ) : (
                // Only show the dice result if it exists
                diceResult && <div className="dice-result" style={{ color: diceColorVar }}>
                    {diceResult?.movement}
                </div>
            )}
        </div>
    );
};

const QuadrantScore = ({ player, isCurrent, position }: { player: IPlayer; isCurrent: boolean; position: string }) => (
  <div className={`quadrant-scoreboard ${position} ${isCurrent ? 'current-player' : ''} ${player.isAI ? 'is-ai' : ''}`}>
    {/* <div className="player-id" style={{ color: `var(--${player.color.toLowerCase()})`}}>{player.id}</div> */}
    <div className="player-score">{player.score} - {player.wickets}</div>
    {player.turnsRemaining !== null && <div className="player-turns">{player.turnsRemaining} balls left</div>}
  </div>
);

const SquareContent = ({ type, value }: { type: SquareType; value: number }) => {
  let content: string | number | null = null;
  switch (type) {
    case SquareType.Runs: content = value; break;
    case SquareType.Wicket: content = 'W'; break;
    case SquareType.Extra: content = '+'; break;
    case SquareType.DotBall: content = '•'; break;
  }
  return content ? <div className="square-content">{content}</div> : null;
};

export default App;