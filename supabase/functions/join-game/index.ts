// supabase/functions/join-game/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '_shared/cors.ts'
import { Game } from '_shared/game.ts'
import { Player } from '_shared/player.ts'
import { PlayerColor } from '_shared/types.ts'

// Helper function to get the next available color
function getNextAvailableColor(existingPlayers: any[]): PlayerColor {
    const colorsInUse = new Set(existingPlayers.map(p => p.color));
    const allColors = [PlayerColor.Blue, PlayerColor.Yellow, PlayerColor.Green, PlayerColor.Purple];
    
    for (const color of allColors) {
        if (!colorsInUse.has(color)) {
            return color;
        }
    }
    // Default or throw error if no colors are available
    throw new Error('Game is full. No available colors.');
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { gameCode } = await req.json();
    if (!gameCode) throw new Error('Game code is required');

    // Create a Supabase client with the user's authorization
    const userSupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user } } = await userSupabaseClient.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    // Create a service role client to bypass RLS for the update
    const adminSupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')! // Use the new secret name
    );

    // 1. Find the game by its code
    const { data: gameData, error: fetchError } = await adminSupabaseClient
      .from('games')
      .select('id, players, game_state, status')
      .eq('game_code', gameCode.toUpperCase())
      .single();
    
    if (fetchError) throw new Error('Game not found.');
    if (gameData.status !== 'waiting') throw new Error('Game has already started.');

    // 2. Check if the user is already in the game
    const isAlreadyPlayer = gameData.players.some((p: any) => p.userId === user.id);
    if (isAlreadyPlayer) {
      // If they are already in, just return the game ID so they can proceed
      return new Response(JSON.stringify({ gameId: gameData.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Add the new player
    const nextColor = getNextAvailableColor(gameData.players);
    const newPlayerInfo = {
        userId: user.id,
        id: gameData.players.length + 1, // Simple ID assignment
        color: nextColor
    };
    const updatedPlayersArray = [...gameData.players, newPlayerInfo];

    // 4. Update the game_state object
    const game = Game.fromJSON(gameData.game_state);
    // Find the placeholder player of the correct color and update their info
    const playerToUpdate = game.players.find(p => p.color === nextColor);
    if (playerToUpdate) {
        playerToUpdate.name = `Player ${newPlayerInfo.id} (${newPlayerInfo.color})`;
        // You could add other properties here if needed
    }
    
    // 5. Save the updated state and players array
    const { data: updatedGame, error: updateError } = await adminSupabaseClient
      .from('games')
      .update({
          players: updatedPlayersArray,
          game_state: game.toJSON()
      })
      .eq('id', gameData.id)
      .select('id')
      .single();

    if (updateError) throw updateError;
    
    return new Response(JSON.stringify({ gameId: updatedGame.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})