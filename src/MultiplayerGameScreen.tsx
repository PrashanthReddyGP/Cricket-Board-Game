// src/MultiplayerGameScreen.tsx

import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { Game } from './game';
import type { DiceResult, IPlayer, AnimatingToken as AnimatingTokenData, PlayerToken } from './types';
import { playSound } from './soundManager';
import { boardLayout } from './boardLayout';

import {
  Board,
  AnimatingToken,
  Square,
  ControlHub,
  QuadrantScore,
  Dice,
  SquareContent,
} from './App';

// Animation Constants
const LIFT_DURATION = 200;
const MOVE_DURATION = 180;
const LAND_DURATION = 300;
const MOVE_BACK_DURATION = 100;


type MultiplayerGameScreenProps = {
    gameId: string;
    onGameEnd: () => void;
};

export const MultiplayerGameScreen = ({ gameId, onGameEnd }: MultiplayerGameScreenProps) => {
    const { user } = useAuth();
    const [game, setGame] = useState<Game | null>(null);
    const [loading, setLoading] = useState(true);
    const [localPlayerId, setLocalPlayerId] = useState<number | null>(null);

    // --- All UI/Animation state from the original GameScreen ---
    const [diceResult, setDiceResult] = useState<DiceResult | null>(null);
    const [waitingForTokenChoice, setWaitingForTokenChoice] = useState(false);
    const [animatingToken, setAnimatingToken] = useState<AnimatingTokenData | null>(null);
    const [isDiceRolling, setIsDiceRolling] = useState(false);
    const [returningTokens, setReturningTokens] = useState<AnimatingTokenData[]>([]);

    const previousGameRef = useRef<Game | null>(null);

    // --- EFFECT 1: Fetch initial game state and subscribe to real-time updates ---
    useEffect(() => {
        const fetchAndSubscribe = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('games')
                .select('game_state, players') // Also fetch players to identify self
                .eq('id', gameId)
                .single();

            if (error || !data || !data.game_state) {
                console.error("Could not fetch game", error);
                // TODO: Handle error, maybe navigate away
                return;
            }

            const initialGame = Game.fromJSON(data.game_state);
            setGame(initialGame);
            previousGameRef.current = initialGame;

            // Find out which player this user is
            const self = data.players.find((p: any) => p.userId === user?.id);
            if (self) {
                setLocalPlayerId(self.id);
            }

            setLoading(false);

            const channel = supabase
                .channel(`game:${gameId}`)
                .on('postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
                    (payload) => {
                        console.log('Real-time: Game state updated!');
                        const newGameState = (payload.new as any).game_state;
                        setGame(Game.fromJSON(newGameState));
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        };

        fetchAndSubscribe();
    }, [gameId, user?.id]);


    // --- EFFECT 2: Detect changes between game states to trigger animations for remote moves ---
    useEffect(() => {
        const previousGame = previousGameRef.current;
        if (!game || !previousGame || game === previousGame) {
            previousGameRef.current = game;
            return;
        }

        const currentPlayer = game.getCurrentPlayer();
        const isMyTurn = localPlayerId === currentPlayer.id;

        // If it's my turn, my own actions will have already triggered animations (Optimistic UI)
        // This effect should primarily handle animations for OTHER players' moves.
        if (isMyTurn) {
            previousGameRef.current = game;
            return;
        }

        // TODO: Advanced logic to detect remote moves and animate them.
        // For now, the state will just snap to the new positions for remote players,
        // which is acceptable for a first version. The core logic is in place.

        previousGameRef.current = game;
    }, [game, localPlayerId]);


    if (loading || !game) {
        return <div className="screen"><h2>Loading Game...</h2></div>;
    }

    if (game.isGameOver) { onGameEnd(); }

    const currentPlayer = game.getCurrentPlayer();
    const isMyTurn = localPlayerId === currentPlayer.id && !currentPlayer.isAllOut;
    const isAnimating = !!animatingToken || returningTokens.length > 0;

    const allTokens = game.players
        .filter(p => !p.isAllOut)
        .flatMap(p => p.tokens.map(t => ({ ...t, color: p.color })));

    // --- Rewired handler functions ---
    const handleRollDice = () => {
        if (!isMyTurn || isDiceRolling || isAnimating || waitingForTokenChoice) return;

        setIsDiceRolling(true);
        playSound('dice');
        // We roll the dice client-side for immediate feedback. The server will validate the final move.
        const result = game.rollDice();
        setTimeout(() => {
            setIsDiceRolling(false);
            setDiceResult(result);
            setWaitingForTokenChoice(true);
        }, 500);
    };

    const handleTokenMove = async (tokenId: number) => {
        if (!diceResult || !isMyTurn || isAnimating) return;

        setWaitingForTokenChoice(false);

        // --- OPTIMISTIC UI: Start animating immediately ---
        const player = game.getCurrentPlayer();
        const token = player.tokens.find(t => t.id === tokenId)!;
        const path = game.getMovementPath(token.positionIndex, diceResult);
        
        // Use the same animation logic as single-player
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
                // After landing animation, clear it. The real-time update handles the final state.
                 setTimeout(() => {
                    setAnimatingToken(null);
                 }, LAND_DURATION);
            }, totalMoveTime);
        }, LIFT_DURATION);


        // --- SERVER ACTION: Concurrently, send the move to the server ---
        try {
            const { error } = await supabase.functions.invoke('make-move', {
                body: {
                    gameId,
                    action: 'PLAY_TURN',
                    payload: { tokenId, diceResult }
                }
            });

            if (error) throw error;
            console.log('Move successfully sent to server.');
        } catch (err) {
            console.error('Error making move:', err);
            // TODO: Here you would handle a failed move, e.g., reverting the optimistic UI change.
        } finally {
            // Reset local dice state. The game state will be updated by the subscription.
            setDiceResult(null);
        }
    };


    return (
        <Board
            tokens={allTokens}
            players={game.players}
            currentPlayer={currentPlayer}
            animatingToken={animatingToken}
            returningTokens={returningTokens}
            onRollDice={handleRollDice}
            onTokenMove={handleTokenMove}
            // A player can only make a choice if it's their turn
            waitingForTokenChoice={isMyTurn && waitingForTokenChoice}
            isGameOver={game.isGameOver}
            diceResult={diceResult}
            isDiceRolling={isDiceRolling}
        />
    );
};