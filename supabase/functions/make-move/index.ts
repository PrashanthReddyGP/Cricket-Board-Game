// supabase/functions/make-move/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '_shared/cors.ts'
import { Game } from '_shared/game.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Get user and request body
    const { gameId, action, payload } = await req.json();
    if (!gameId || !action || !payload) {
        throw new Error('Missing gameId, action, or payload');
    }

    // 2. Create clients
    const userSupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )
    const { data: { user } } = await userSupabaseClient.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const adminSupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SERVICE_ROLE_KEY')! // Use the powerful admin key
    );

    // 3. Fetch the CURRENT game state
    const { data: gameData, error: fetchError } = await adminSupabaseClient
      .from('games')
      .select('game_state, players')
      .eq('id', gameId)
      .single();
    
    if (fetchError) throw fetchError;

    // 4. Deserialize and validate the move
    const game = Game.fromJSON(gameData.game_state);
    const currentPlayerInGame = game.getCurrentPlayer();
    const playerMakingRequest = gameData.players.find((p: any) => p.userId === user.id);
    
    // Crucial check: Is it actually this player's turn?
    if (!playerMakingRequest || currentPlayerInGame.id !== playerMakingRequest.id) {
        throw new Error("It's not your turn!");
    }

    // 5. Perform the action
    if (action === 'PLAY_TURN') {
        const { tokenId, diceResult } = payload;
        game.playTurn(tokenId, diceResult); // Use our existing game logic!
    } else {
        throw new Error(`Unknown action: ${action}`);
    }

    // 6. Serialize the NEW game state and update the database
    const newGameState = game.toJSON();
    const { error: updateError } = await adminSupabaseClient
      .from('games')
      .update({ game_state: newGameState })
      .eq('id', gameId);

    if (updateError) throw updateError;
      
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error(error); // Log the error for debugging
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})