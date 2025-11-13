// src/LobbyScreen.tsx

import { useState } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext'; // Import useSettings
import { Game } from './game'; // Import the Game class
import { GameMode, PlayerColor } from './types'; // Import necessary types

type LobbyScreenProps = {
    onGameStart: (gameId: string) => void;
};

export const LobbyScreen = ({ onGameStart }: LobbyScreenProps) => {
    const { user } = useAuth();
    const { settings } = useSettings(); // Get current game settings
    const [gameCode, setGameCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleCreateGame = async () => {
        if (!user) return;
        setLoading(true);
        setError('');

        try {
            // Get a unique game code from our DB function
            const { data: codeData, error: codeError } = await supabase.rpc('generate_game_code');
            if (codeError) throw codeError;

            // ========================================================================
            // NEW LOGIC: Initialize the game state
            // ========================================================================
            
            // Define the players for this new game.
            // For now, we'll hardcode 2 players.
            const playerInfo = [
                { userId: user.id, id: 1, name: `Player 1 (Blue)`, color: PlayerColor.Blue },
                // We will add Player 2 when they join
            ];

            // Create a new Game class instance.
            // We pass an empty array for colors because we will set players manually.
            const newGameInstance = new Game(GameMode.T20, [], settings);
            
            // Manually set the players in the instance
            newGameInstance.players = playerInfo.map(p => {
                const player = newGameInstance.players.find(pl => pl.color === p.color)!;
                // You would need to add a method to your Player class or manually set these properties
                // Let's assume we can modify the player object for now. This is a simplification.
                // In a real app, you would have a more robust player management system.
                // For now, let's just create a new game state with the host.
                return player;
            });

            // For a simpler start, let's instantiate the game with just the host.
            // The logic to add players can be a separate step.
            const initialGame = new Game(GameMode.T20, [PlayerColor.Blue, PlayerColor.Yellow], settings);
            
            // Serialize the initial game state to JSON
            const initialGameStateJSON = initialGame.toJSON();


            const newGameData = {
                game_code: codeData,
                host_id: user.id,
                // The `players` column stores info about who is in the game (user IDs, colors)
                players: [{ userId: user.id, id: 1, color: 'Blue' }], 
                // The `game_state` column stores the full serialized game object
                game_state: initialGameStateJSON, // <-- ADD THIS LINE
            };

            const { data, error } = await supabase
                .from('games')
                .insert(newGameData)
                .select()
                .single();

            if (error) throw error;
            
            // The rest is the same...
            alert(`Game created! Share code: ${data.game_code}`);
            onGameStart(data.id);

        } catch (err: any) {
            setError(err.message);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleJoinGame = async () => {
        if (!user || !gameCode) return;
        setLoading(true);
        setError('');

        try {
            // Call our secure Edge Function instead of updating from the client
            const { data, error } = await supabase.functions.invoke('join-game', {
                body: { gameCode: gameCode.toUpperCase() }
            });

            if (error) throw new Error(error.message); // Handles network errors
            if (data.error) throw new Error(data.error); // Handles errors from inside the function

            // The function returns the gameId on success
            onGameStart(data.gameId);

        } catch (err: any) {
            setError(err.message);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="screen lobby-screen">
            <h2>Multiplayer Lobby</h2>
            <div className="lobby-actions">
                <button onClick={handleCreateGame} disabled={loading}>
                    {loading ? 'Creating...' : 'Create Game'}
                </button>
                <div className="join-game">
                    <input
                        type="text"
                        placeholder="Enter Game Code"
                        value={gameCode}
                        onChange={(e) => setGameCode(e.target.value)}
                        disabled={loading}
                    />
                    <button onClick={handleJoinGame} disabled={loading}>
                        {loading ? 'Joining...' : 'Join Game'}
                    </button>
                </div>
            </div>
            {error && <p className="error-message">{error}</p>}
        </div>
    );
};