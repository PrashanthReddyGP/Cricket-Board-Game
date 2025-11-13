import { useState, useMemo, useEffect, useRef } from 'react'; // Import useRef
import { Game } from './game';
import { GameMode, PlayerColor, SquareType, Direction } from './types';
import type { DiceResult, PlayerToken, IPlayer, AnimatingToken as AnimatingTokenData, GameSettings, BoardSquare } from './types';
import './App.css';
import { boardLayout } from './boardLayout';
import { useSettings } from './SettingsContext';
import { playSound } from './soundManager';
import { LobbyScreen } from './LobbyScreen';
import { MultiplayerGameScreen } from './MultiplayerGameScreen';

const AI_THINKING_TIME = 1000; // 1 second delay for AI moves

// Animation Constants
const LIFT_DURATION = 200;
const MOVE_DURATION = 180;
const LAND_DURATION = 300;
const MOVE_BACK_DURATION = 100;

// Type for our simple router
type GameState = 'home' | 'settings' | 'lobby' | 'playing' | 'end';
type GameType = 'human-vs-ai' | 'multiplayer';

//================================================================================
// MAIN APP COMPONENT (ACTS AS A ROUTER)
//================================================================================
function App() {
  const [gameState, setGameState] = useState<GameState>('home');
  const gameType: GameType = 'human-vs-ai';
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.T20);
  const [gameId, setGameId] = useState(1);
  const { settings } = useSettings(); // Get settings from context

  const startGame = (mode: GameMode) => { setGameMode(mode); setGameState('playing'); };
  const endGame = () => { setGameState('end'); };
  const restartGame = () => { setGameId(id => id + 1); setGameState('playing'); };
  const goHome = () => { setGameId(id => id + 1); setGameState('home'); };
  const showSettings = () => { setGameState('settings'); };

  // Store the current multiplayer game ID
  const [multiplayerGameId, setMultiplayerGameId] = useState<string | null>(null);

  const showLobby = () => setGameState('lobby');
  const startMultiplayerGame = (gameId: string) => {
      setMultiplayerGameId(gameId);
      setGameState('playing');
  }

  // The game instance is now part of the GameScreen
  const gameInstance = useMemo(() => {
    const humanPlayer = gameType === 'human-vs-ai' ? PlayerColor.Blue : undefined;
    return new Game(gameMode, [PlayerColor.Blue, PlayerColor.Yellow, PlayerColor.Green, PlayerColor.Purple], settings, humanPlayer);
  }, [gameId, gameMode, settings, gameType]);

  return (
    <div className="app-container">
      <h1>Cricket Board Game</h1>
      {gameState === 'home' && <HomeScreen onStartGame={startGame} onShowSettings={showSettings} onShowLobby={showLobby} />}
      {gameState === 'lobby' && <LobbyScreen onGameStart={startMultiplayerGame} />}
      {gameState === 'settings' && <SettingsScreen onGoHome={goHome} />}
      {gameState === 'playing' && (
          multiplayerGameId 
          ? <MultiplayerGameScreen gameId={multiplayerGameId} onGameEnd={endGame} />
          : <GameScreen key={gameId} gameInstance={gameInstance} onGameEnd={endGame} />
      )}
      {gameState === 'end' && <EndScreen gameInstance={gameInstance} onRestart={restartGame} onGoHome={goHome} />}
    </div>
  );
}

//================================================================================
// HOME SCREEN COMPONENT
//================================================================================
const HomeScreen = ({ onStartGame, onShowSettings, onShowLobby }: { 
  onStartGame: (mode: GameMode, type: GameType) => void; 
  onShowSettings: () => void;
  onShowLobby: () => void;
}) => (
  <div className="screen home-screen">
    <h2>Multiplayer</h2>
    <div className="mode-selection">
        <button onClick={() => { playSound('click'); onShowLobby(); }}>Lobby</button>
    </div>
    <h2>Single Player (vs AI)</h2>
    <div className="mode-selection">
      <button onClick={() => { playSound('click'); onStartGame(GameMode.T20, 'human-vs-ai'); }}>T20</button>
      <button onClick={() => { playSound('click'); onStartGame(GameMode.FiftyFifty, 'human-vs-ai'); }}>50-50</button>
      <button onClick={() => { playSound('click'); onStartGame(GameMode.Test, 'human-vs-ai'); }}>Test Match</button>
    </div>
    {/* You can add a multiplayer section here later */}
    <div className="home-buttons">
        <button className="secondary" onClick={() => { playSound('click'); onShowSettings(); }}>Settings</button>
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
  const [animatingToken, setAnimatingToken] = useState<AnimatingTokenData | null>(null);
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [returningTokens, setReturningTokens] = useState<AnimatingTokenData[]>([]);

  const currentPlayer = gameInstance.getCurrentPlayer();
  const isAnimating = !!animatingToken || returningTokens.length > 0;

  // We filter out players who are all out before creating the list of tokens to render.
  const allTokens = gameInstance.players
    .filter(p => !p.isAllOut)
    .flatMap(p => p.tokens.map(t => ({ ...t, color: p.color })));

  // This runs whenever the player changes and handles skipping their turn if they are all out.
  useEffect(() => {
    if (currentPlayer.isAllOut && !isAnimating && !gameInstance.isGameOver) {
      console.log(`--- Turn Skipped (All Out): ${currentPlayer.name} ---`);
      const skipDelay = currentPlayer.isAI ? 100 : 100;

      const timeoutId = setTimeout(() => {
        gameInstance.advanceToNextPlayer();
        setGameVersion(v => v + 1);
      }, skipDelay);

      return () => clearTimeout(timeoutId);
    }
  }, [gameVersion, currentPlayer.id, currentPlayer.isAllOut]);

  // --- AI TURN AUTOMATION ---
  useEffect(() => {
    if (currentPlayer.isAI && !isAnimating && !isDiceRolling && !gameInstance.isGameOver && !currentPlayer.isAllOut) {
      console.log(`--- AI Turn Start: ${currentPlayer.name} ---`);
      
      setTimeout(() => {
        setIsDiceRolling(true);
        playSound('dice');
        const aiDiceResult = gameInstance.rollDice();
        
        setTimeout(() => {
          setIsDiceRolling(false);
          setDiceResult(aiDiceResult);
          const chosenTokenId = gameInstance.makeAIDecision(currentPlayer);
          
          setTimeout(() => {
            handleTokenMove(chosenTokenId, aiDiceResult);
          }, 1000);

        }, 500);

      }, AI_THINKING_TIME);
    }
  }, [gameVersion, currentPlayer.id]);

  // --- PRIMARY MOVE FINALIZATION ---
  useEffect(() => {
    if (animatingToken?.phase === 'landing') {
      const { tokenId } = animatingToken;
      const finalDiceResult = diceResult!;
      const landingPosition = animatingToken.path[animatingToken.path.length - 1];
      const landingSquare = boardLayout[landingPosition];
      const movingPlayer = gameInstance.getCurrentPlayer();

      setTimeout(() => {
        const potentialVictims = gameInstance.players
          .flatMap(p => p.tokens.map(t => ({ ...t, player: p })))
          .filter(t => t.positionIndex === landingPosition && t.player.color !== movingPlayer.color);

        // Run the turn logic, which updates all game state (scores, wickets, positions, isAllOut status)
        gameInstance.playTurn(tokenId, finalDiceResult);

        const returnAnims: AnimatingTokenData[] = [];
        const actualVictims = potentialVictims.filter(victim => {
          const tokenAfterTurn = victim.player.tokens.find(t => t.id === victim.id)!;
          return tokenAfterTurn.positionIndex === victim.player.homeBaseIndex;
        });

        actualVictims.forEach(victim => {
          const returnPath = gameInstance.getReturnPath(landingPosition, victim.player.homeBaseIndex);
          returnAnims.push({ playerColor: victim.player.color, tokenId: victim.id as 1 | 2, path: returnPath, currentStep: 0, phase: 'lifting', startPosition: landingPosition, level: victim.level });
        });

        const movedTokenAfterTurn = movingPlayer.tokens.find(t => t.id === tokenId)!;
        if (landingSquare.type === SquareType.Wicket && movedTokenAfterTurn.positionIndex === movingPlayer.homeBaseIndex) {
          const returnPath = gameInstance.getReturnPath(landingPosition, movingPlayer.homeBaseIndex);
          returnAnims.push({ playerColor: movingPlayer.color, tokenId: tokenId as 1 | 2, path: returnPath, currentStep: 0, phase: 'lifting', startPosition: landingPosition, level: animatingToken.level });
        }

        setAnimatingToken(null);
        setDiceResult(null);

        if (returnAnims.length > 0) {
          handleReturnAnimations(returnAnims);
        } else {
          // If no return animations, the turn is over. Advance the game.
          setGameVersion(v => v + 1);
        }
      }, LAND_DURATION);
    }
  }, [animatingToken?.phase]);

  // --- ADVANCE GAME STATE *AFTER* RETURN ANIMATIONS FINISH ---
  const prevReturningTokensRef = useRef<AnimatingTokenData[]>([]);
  useEffect(() => {
    // Check if the previous state had tokens and the current one is empty.
    // This means the return animations have just finished.
    if (prevReturningTokensRef.current.length > 0 && returningTokens.length === 0) {
      console.log("All return animations finished. Advancing to next turn.");
      setGameVersion(v => v + 1);
    }
    // Update the ref to the current state for the next render.
    prevReturningTokensRef.current = returningTokens;
  }, [returningTokens]);


  if (gameInstance.isGameOver) { onGameEnd(); }
  
  const handleRollDice = () => {
    if (isDiceRolling || isAnimating || waitingForTokenChoice || currentPlayer.isAI || currentPlayer.isAllOut) return;
    setIsDiceRolling(true);
    playSound('dice');
    const result = gameInstance.rollDice();
    setTimeout(() => {
      setIsDiceRolling(false);
      setDiceResult(result);
      setWaitingForTokenChoice(true);
    }, 500);
  };
  
  const handleTokenMove = (tokenId: number, moveDiceResult = diceResult) => {
    if (!moveDiceResult || isAnimating) return;

    const player = gameInstance.getCurrentPlayer();
    const token = player.tokens.find(t => t.id === tokenId)!;
    const path = gameInstance.getMovementPath(token.positionIndex, moveDiceResult);
    
    setWaitingForTokenChoice(false);
    
    setAnimatingToken({ playerColor: player.color, tokenId: tokenId as 1 | 2, path, currentStep: 0, phase: 'lifting', startPosition: token.positionIndex, level: token.level });
    
    setTimeout(() => {
      path.forEach((_, index) => {
        setTimeout(() => {
          playSound('tokenMove', 0.3);
          setAnimatingToken(prev => prev ? { ...prev, currentStep: index + 1, phase: 'moving' } : null)
        }, index * MOVE_DURATION);
      });
      
      const totalMoveTime = path.length * MOVE_DURATION;
      setTimeout(() => {
        playSound('tokenLand', 0.6);
        setAnimatingToken(prev => prev ? { ...prev, phase: 'landing' } : null);
      }, totalMoveTime);

    }, LIFT_DURATION);
  };
  
  const handleReturnAnimations = (returnAnims: AnimatingTokenData[]) => {
    setReturningTokens(prev => [...prev, ...returnAnims]);

    returnAnims.forEach(tokenToAnimate => {
      const { path, tokenId, playerColor } = tokenToAnimate;
      path.forEach((_, index) => {
        setTimeout(() => {
          playSound('tokenMove', 0.2);
          setReturningTokens(prev => prev.map(t =>
            (t.tokenId === tokenId && t.playerColor === playerColor)
              ? { ...t, currentStep: index + 1, phase: 'moving' }
              : t
          ));
        }, (index + 1) * MOVE_BACK_DURATION);
      });

      const totalMoveTime = path.length * MOVE_BACK_DURATION;
      setTimeout(() => {
        playSound('tokenLand', 0.4);
        setReturningTokens(prev => prev.filter(t => !(t.tokenId === tokenId && t.playerColor === playerColor)));
      }, totalMoveTime + LAND_DURATION);
    });
  };

  return (
    <Board
      tokens={allTokens}
      players={gameInstance.players}
      currentPlayer={currentPlayer}
      animatingToken={animatingToken}
      returningTokens={returningTokens}
      onRollDice={handleRollDice}
      onTokenMove={handleTokenMove}
      waitingForTokenChoice={waitingForTokenChoice}
      isGameOver={gameInstance.isGameOver}
      diceResult={diceResult}
      isDiceRolling={isDiceRolling}
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
// DICE COMPONENT
//================================================================================
export const Dice = ({ number, color, isRolling, isIdle }: { number: number; color?: string; isRolling?: boolean; isIdle?: boolean }) => {
  return (
    <div 
      className={`dice-face ${isRolling ? 'rolling' : ''} ${isIdle ? 'idle' : ''} ${!isRolling && !isIdle ? 'final-result' : ''}`} 
      style={{ color }}
      data-number={number}
    >
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
  onTokenMove: (tokenId: number) => void;
  animatingToken: AnimatingTokenData | null;
  returningTokens: AnimatingTokenData[];
  onRollDice: () => void;
  isDiceRolling: boolean;
  diceResult: DiceResult | null;
};

export const Board = ({ tokens, players, currentPlayer, animatingToken, returningTokens, onRollDice, onTokenMove, waitingForTokenChoice, isGameOver, isDiceRolling, diceResult }: BoardProps) => {
  // Filter out the primary moving token
  let staticTokens = animatingToken 
    ? tokens.filter(t => !(t.color === animatingToken.playerColor && t.id === animatingToken.tokenId))
    : tokens;
  
  // Filter out any tokens that are currently animating their return
  staticTokens = staticTokens.filter(t => 
    !returningTokens.some(rt => rt.playerColor === t.color && rt.tokenId === t.id)
  );

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
          isAnimating={!!animatingToken || returningTokens.length > 0}
        />
      ))}

      {animatingToken && <AnimatingToken token={animatingToken} />}
      {returningTokens.map(token => {
        const key = `${token.playerColor}-${token.tokenId}`;
        return <AnimatingToken key={key} token={token} isReturning={true} />
      })}
      
      <ControlHub 
        isGameOver={isGameOver} 
        waitingForTokenChoice={waitingForTokenChoice} 
        diceResult={diceResult} 
        onRollDice={onRollDice} 
        isDiceRolling={isDiceRolling}
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
export const AnimatingToken = ({ token, isReturning = false }: { token: AnimatingTokenData; isReturning?: boolean }) => {
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
    top: `calc( (var(--gap-size) * 2) + ${coords.row} * (var(--square-size) + var(--gap-size)) )`,
    left: `calc( (var(--gap-size) * 2) + ${coords.col} * (var(--square-size) + var(--gap-size)) )`,
  };

  return (
    <div className={`animating-token-wrapper ${token.phase} ${isReturning ? 'is-returning' : ''}`} style={style}>
        <div className={`token ${token.playerColor.toLowerCase()}`}>{token.level}x</div>
    </div>
  );
};

// --- Define Props for the Square component ---
type SquareProps = {
  squareInfo: BoardSquare;
  tokens: (PlayerToken & { color: PlayerColor })[];
  isWaitingForChoice: boolean;
  currentPlayerColor: PlayerColor;
  onTokenMove: (tokenId: number) => void;
  isAnimating: boolean;
};

export const Square = ({ squareInfo, tokens, isWaitingForChoice, currentPlayerColor, onTokenMove, isAnimating }: SquareProps) => {
  const tokensOnSquare = tokens.filter(t => t.positionIndex === squareInfo.index);
  const hasTokens = tokensOnSquare.length > 0;
  const gridStyle = { gridColumn: squareInfo.coords.col + 1, gridRow: squareInfo.coords.row + 1 };

  let typeClassName = squareInfo.type.toLowerCase();
  if (squareInfo.type === SquareType.SafeZone && squareInfo.ownerColor) {
    // Generates "safezone-blue", "safezone-yellow", etc.
    typeClassName = `safezone-${squareInfo.ownerColor.toLowerCase()}`;
  }

  return (
    <div style={gridStyle} className={`square playable ${typeClassName} ${hasTokens ? 'occupied' : ''}`}>
      <SquareContent type={squareInfo.type} value={squareInfo.value} ownerColor={squareInfo.ownerColor} />
      <div className="token-container" style={{ pointerEvents: isAnimating ? 'none' : 'auto' }}>
        {tokensOnSquare.map(token => {
          const isSelectable = isWaitingForChoice && token.color === currentPlayerColor;
          const uniqueKey = `${token.color}-${token.id}`;
          return (
            <div
              key={uniqueKey}
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

export const ControlHub = ({ isGameOver, waitingForTokenChoice, diceResult, onRollDice, currentPlayer, isDiceRolling }: any) => {
    const diceColorVar = diceResult?.direction === Direction.Clockwise ? 'var(--action-green)' : `var(--red)`;
    
    // Show a randomly cycling die face during the rolling animation
    const [rollingNumber, setRollingNumber] = useState(1);
    useEffect(() => {
        if (isDiceRolling) {
            const interval = setInterval(() => {
                setRollingNumber(Math.floor(Math.random() * 6) + 1);
            }, 80); // Rapidly change the number
            return () => clearInterval(interval);
        }
    }, [isDiceRolling]);

    if (currentPlayer.isAllOut) {
        return <div className="control-hub"><div className="ai-thinking">ALL OUT</div></div>;
    }

    if (isGameOver) {
        return <div className="control-hub"><h3>Game Over</h3></div>;
    }

    return (
        <div className={`control-hub ${waitingForTokenChoice ? 'waiting' : ''}`}>
            {/* Condition 1: Time to roll (Human's turn) */}
            {!diceResult && !isDiceRolling && !currentPlayer.isAI && (
                <div className="clickable-die" onClick={onRollDice}>
                    <Dice number={6} isIdle={true} />
                </div>
            )}
            
            {/* Condition 1.5: AI's turn (show nothing or a "thinking" state) */}
            {!diceResult && !isDiceRolling && currentPlayer.isAI && (
                <div className="ai-thinking">AI</div>
            )}

            {/* Condition 2: Dice is currently rolling */}
            {isDiceRolling && <Dice number={rollingNumber} isRolling={true} />}

            {/* Condition 3: Final result is shown */}
            {diceResult && !isDiceRolling && (
                <Dice number={diceResult.movement} color={diceColorVar} />
            )}
        </div>
    );
};

export const QuadrantScore = ({ player, isCurrent, position }: { player: IPlayer; isCurrent: boolean; position: string }) => (
  <div className={`quadrant-scoreboard ${position} ${isCurrent ? 'current-player' : ''} ${player.isAI ? 'is-ai' : ''} ${player.isAllOut ? 'all-out' : ''}`}>
    {/* <div className="player-id" style={{ color: `var(--${player.color.toLowerCase()})`}}>{player.id}</div> */}
    <div className="player-score">{player.score}-{player.wickets}</div>
    {player.turnsRemaining !== null && <div className="player-turns">{player.turnsRemaining} balls left</div>}
  </div>
);

export const SquareContent = ({ type, value, ownerColor }: { type: SquareType; value: number; ownerColor?: PlayerColor }) => {
  // If it's a safe zone, render the Home Icon SVG
  if (type === SquareType.SafeZone && ownerColor) {
    const colorClass = ownerColor.toLowerCase();
    return (
      <div className={`square-content home-icon ${colorClass}`}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z" />
        </svg>
      </div>
    );
  }

  // Otherwise, render the text content as before
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