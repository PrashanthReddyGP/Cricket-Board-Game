// supabase/functions/make-move/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '_shared/cors.ts'
import { Game } from '_shared/game.ts';

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error('Unauthorized');
    
    const { gameId, action, payload } = await req.json();
    if (!gameId || !action) throw new Error('Missing gameId or action');

    // 1. Fetch the current game state from the DB
    const { data: gameData, error: fetchError } = await supabaseClient
      .from('games')
      .select('game_state, players')
      .eq('id', gameId)
      .single();
    
    if (fetchError) throw fetchError;

    // 2. Deserialize the JSON into our Game class instance
    const game = Game.fromJSON(gameData.game_state);

    // 3. VALIDATE THE MOVE (critical!)
    const currentPlayerInGame = game.getCurrentPlayer();
    const playerMakingRequest = gameData.players.find(p => p.userId === user.id);
    
    if (!playerMakingRequest || currentPlayerInGame.id !== playerMakingRequest.id) {
        throw new Error("It's not your turn!");
    }

    // 4. Perform the action using Game class methods
    switch (action) {
        case 'ROLL_DICE':
            // In a real scenario, you'd roll the dice on the server
            // and return the result, then wait for a 'MOVE_TOKEN' action.
            // Let's simplify and assume the client sends the whole move.
            break;
        case 'PLAY_TURN':
            const { tokenId, diceResult } = payload;
            game.playTurn(tokenId, diceResult);
            break;
        // Add other actions like 'START_GAME'
    }

    // 5. Serialize the new game state
    const newGameState = game.toJSON();

    // 6. Update the database
    const { error: updateError } = await supabaseClient
      .from('games')
      .update({ game_state: newGameState })
      .eq('id', gameId);

    if (updateError) throw updateError;
      
    return new Response(JSON.stringify({ success: true, newState: newGameState }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})