import { boardLayout } from './boardLayout.ts';
import { Player } from './player.ts';   
import { Direction, GameMode, PlayerColor, SquareType } from './types.ts';
import type { BoardSquare, DiceResult, GameSettings, IPlayer } from './types.ts';

// Configuration for player colors and their home bases
const PLAYER_CONFIG = {
    [PlayerColor.Blue]:   { name: "Player 1 (Blue)",   homeBaseIndex: 0 },
    [PlayerColor.Yellow]: { name: "Player 2 (Yellow)", homeBaseIndex: 12 },
    [PlayerColor.Green]:  { name: "Player 3 (Green)",  homeBaseIndex: 24 },
    [PlayerColor.Purple]: { name: "Player 4 (Purple)", homeBaseIndex: 36 },
};

// const MAX_WICKETS = 10;
const BOARD_SIZE = 48;

export class Game {
    public readonly board: Readonly<BoardSquare[]> = boardLayout;
    public players: Player[] = [];
    public currentPlayerIndex: number = 0;
    public isGameOver: boolean = false;
    private readonly gameMode: GameMode;
    private readonly settings: GameSettings;

    constructor(mode: GameMode, playerColors: PlayerColor[], settings: GameSettings, humanPlayerColor?: PlayerColor) {
        this.gameMode = mode;
        this.settings = settings;
        // Only initialize players if playerColors are provided. This is for the fromJSON method.
        if (playerColors.length > 0) {
            this.initializePlayers(playerColors, humanPlayerColor);
        }
    }

    /**
     * Sets up the players for the game based on the selected colors and game mode.
     */
    private initializePlayers(playerColors: PlayerColor[], humanPlayerColor?: PlayerColor): void {
        const initialTurns = this.getInitialTurnsForMode();
        playerColors.forEach((color, index) => {
            const config = PLAYER_CONFIG[color];
            if (config) {
                // A player is an AI if a human player is defined AND it's not them.
                const isAI = !!humanPlayerColor && color !== humanPlayerColor;
                this.players.push(
                    new Player(index + 1, config.name, color, config.homeBaseIndex, initialTurns, isAI)
                );
            }
        });
    }

    /**
     * Determines the number of turns per player for the selected game mode.
     */
    private getInitialTurnsForMode(): number | null {
        switch (this.gameMode) {
            case GameMode.T20: return 20;
            case GameMode.FiftyFifty: return 50;
            case GameMode.Test: return null; // Unlimited turns
        }
    }

    /**
     * Simulates a dice roll, returning a number (1-6) and a direction.
     */
    public rollDice(): DiceResult {
        const movement = Math.floor(Math.random() * 6) + 1;
        // --- USE THE SETTING TO DETERMINE DIRECTION ---
        const direction = this.settings.allowAntiClockwise && Math.random() < 0.5
        ? Direction.AntiClockwise
        : Direction.Clockwise;
        
        return { movement, direction };
    }

    /**
     * Plays a single turn for the current player.
     * @param tokenIdToMove The ID (1 or 2) of the token the player chose to move.
     */
    // We are adding `diceResult` as a parameter to make debugging precise.
    public playTurn(tokenIdToMove: number, diceResult: DiceResult): void {
        if (this.isGameOver) {
            console.log("Game is over. Cannot play another turn.");
            return;
        }

        const player = this.getCurrentPlayer();
        if (player.isAllOut) {
            console.log(`${player.name} is all out and skips their turn.`);
            this.advanceToNextPlayer();
            return;
        }
        
        const token = player.tokens.find(t => t.id === tokenIdToMove)!;
        const oldPosition = token.positionIndex;

        // --- LAP DETECTION LOGIC ---
        // We get the full path of the move to check if it crosses the home base.
        const movementPath = this.getMovementPath(oldPosition, diceResult);
        const newPosition = movementPath[movementPath.length - 1]; // The final destination

        // Check if the player's home base is one of the squares they passed through.
        const didLevelUp = movementPath.includes(player.homeBaseIndex) && oldPosition !== player.homeBaseIndex;
        if (didLevelUp) {
            token.level++;
            playSound('levelUp', 0.6)
            console.log(`LEVEL UP! ${player.name}'s token ${token.id} is now level ${token.level}!`);
        }

        token.positionIndex = newPosition;
        console.log(`${player.name} moves token ${token.id} from square ${oldPosition} to ${newPosition}.`);

        // 1. First, handle collisions. This will add any kill bonuses.
        const aKillHappened = this.handleCollisions(player, tokenIdToMove, newPosition);
        
        // 2. Second, resolve the square's primary event (base score, wicket, etc.) This happens ALWAYS.
        const landingSquare = this.board[newPosition];
        const getsAnotherTurn = this.resolveSquareEvent(player, token.id, landingSquare);
        
        // 3. Finally, determine the turn flow. A kill overrides an extra turn.
        if (aKillHappened) {
            // If a kill happened, the turn always ends.
            player.decrementTurn();
            this.advanceToNextPlayer();
        } else {
            // If no kill, check if the square granted an extra turn.
            if (getsAnotherTurn) {
                console.log(`EXTRA! ${player.name} gets to roll again.`);
            } else {
                player.decrementTurn();
                this.advanceToNextPlayer();
            }
        }

        this.checkGameOver();
    }
        
    public getMovementPath(startPosition: number, diceResult: DiceResult): number[] {
        const path: number[] = [];
        let currentPosition = startPosition;
        const step = diceResult.direction === Direction.Clockwise ? 1 : -1;

        for (let i = 0; i < diceResult.movement; i++) {
            currentPosition = (currentPosition + step + BOARD_SIZE) % BOARD_SIZE;
            path.push(currentPosition);
        }
        return path;
    }

    public getReturnPath(startPosition: number, homeBaseIndex: number): number[] {
        const path: number[] = [];
        let currentPosition = startPosition;

        // If anti-clockwise movement is disallowed by settings, the return path MUST be anti-clockwise (a "rewind").
        if (!this.settings.allowAntiClockwise) {
            const antiClockwiseDistance = (startPosition - homeBaseIndex + BOARD_SIZE) % BOARD_SIZE;
            const step = -1;
            for (let i = 0; i < antiClockwiseDistance; i++) {
                currentPosition = (currentPosition + step + BOARD_SIZE) % BOARD_SIZE;
                path.push(currentPosition);
            }
        } else {
            // Otherwise, if both directions are allowed, choose the shortest path back.
            const clockwiseDistance = (homeBaseIndex - startPosition + BOARD_SIZE) % BOARD_SIZE;
            const antiClockwiseDistance = (startPosition - homeBaseIndex + BOARD_SIZE) % BOARD_SIZE;

            if (clockwiseDistance <= antiClockwiseDistance) {
                // Go clockwise
                const step = 1;
                for (let i = 0; i < clockwiseDistance; i++) {
                    currentPosition = (currentPosition + step + BOARD_SIZE) % BOARD_SIZE;
                    path.push(currentPosition);
                }
            } else {
                // Go anti-clockwise
                const step = -1;
                for (let i = 0; i < antiClockwiseDistance; i++) {
                    currentPosition = (currentPosition + step + BOARD_SIZE) % BOARD_SIZE;
                    path.push(currentPosition);
                }
            }
        }
        return path;
    }


    /**
     * Checks if the moved token landed on an opponent's token.
     */
    // This method now returns 'true' if a kill happened, and 'false' otherwise.
    private handleCollisions(attacker: Player, attackingTokenId: number, position: number): boolean {
        const landingSquare = this.board[position];
        let collisionOccurred = false;

        if (landingSquare.type === SquareType.SafeZone) {
            console.log(`Landed on a Safe Zone. No collisions can occur here.`);
            return false; // No collision happened.
        }

        const attackingToken = attacker.tokens.find(t => t.id === attackingTokenId)!;

        this.players.forEach(victim => {
            if (victim.id === attacker.id) return;

            if (this.settings.killRule === 'fortress') {
                const victimTokensOnSquare = victim.tokens.filter(t => t.positionIndex === position);
                if (victimTokensOnSquare.length >= 2) {
                console.log(`${attacker.name} lands on a fortress created by ${victim.name}. The tokens are safe!`);
                return; // Skip this victim
                }
            }

            victim.tokens.forEach(victimToken  => {
                if (victimToken .positionIndex === position) {
                    collisionOccurred = true; // A collision has officially happened!

                    const victimLevel = victimToken .level; // Store level before it's reset

                    // Victim Penalty
                    console.log(`COLLISION! ${attacker.name} knocked out ${victim.name}'s token ${victimToken .id}!`);
                    playSound('collision', 0.8)
                    victim.takeWicket();
                    victim.returnTokenToHome(victimToken .id);

                    if (this.settings.stealLevelOnKill && victimLevel > attackingToken.level) {
                        console.log(`${attacker.name}'s token ${attackingToken.id} stole level ${victimLevel} from the victim!`);
                        attackingToken.level = victimLevel;
                    }

                    // Attacker Bonus is awarded for EACH kill
                    if (landingSquare.type === SquareType.Runs) {
                        const bonusPoints = landingSquare.value; // Bonus is just the square's value.
                        attacker.addScore(bonusPoints);
                        console.log(`${attacker.name} gets a bonus of ${bonusPoints} runs for the kill!`);
                    }
                }
            });
        });

        return collisionOccurred;
    }

    /**
     * Processes the event of the square the player landed on.
     * @returns {boolean} - True if the player gets another turn, false otherwise.
     */
    private resolveSquareEvent(player: Player, tokenId: number, square: BoardSquare): boolean {
        // Find the specific token that moved to get its level.
        const movingToken = player.tokens.find(t => t.id === tokenId);
        if (!movingToken) return false; // Safety check

        const tokenLevel = movingToken.level;

        console.log(`Landed on a "${square.type}" square (Token Level: ${tokenLevel}x).`);

        switch (square.type) {
            case SquareType.Runs:
                const runsScored = square.value * tokenLevel;
                player.addScore(runsScored);
                if (square.value > 3) playSound('score');
                break;
            case SquareType.Wicket:
                // Wicket logic is unaffected by level
                player.takeWicket();
                playSound('wicket', 0.7);
                player.returnTokenToHome(tokenId);
                break;
            case SquareType.Extra:
                // Award points equal to the token's level.
                const extraRuns = tokenLevel;
                player.addScore(extraRuns);
                if (extraRuns > 0) playSound('extra');
                return true;
            case SquareType.DotBall:
            case SquareType.SafeZone:
                // No action needed
                break;
        }
        return false;
    }

    public getCurrentPlayer(): Player {
        return this.players[this.currentPlayerIndex];
    }

    /**
     * Advances the game to the next player. Made public to allow UI to skip turns.
     */
    public advanceToNextPlayer(): void {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
    
    private checkGameOver(): void {
        // --- Condition 1: The "Hard Stop" ---
        // The game definitively ends if all players are finished (all out or out of turns).
        // This is the final state regardless of scores.
        if (this.gameMode === GameMode.Test) {
            if (this.players.every(p => p.isAllOut)) {
                this.isGameOver = true;
                return; // Exit early, game is over.
            }
        } else {
            if (this.players.every(p => p.turnsRemaining === 0 || p.isAllOut)) {
                this.isGameOver = true;
                return; // Exit early, game is over.
            }
        }

        // --- Condition 2: The "Chase" or "Early Victory" ---
        // This condition applies if there's exactly one player left who is not all out.
        const allOutPlayers = this.players.filter(p => p.isAllOut);

        if (allOutPlayers.length === this.players.length - 1) {
            const lastPlayer = this.players.find(p => !p.isAllOut);
            
            // This should always find a player, but it's a safe check.
            if (!lastPlayer) return;

            // Find the highest score among the defeated players. This is the target to beat.
            const topScoreToBeat = Math.max(0, ...allOutPlayers.map(p => p.score));

            // If the last player's current score has already surpassed the target, they win immediately.
            if (lastPlayer.score > topScoreToBeat) {
                console.log(`GAME OVER: ${lastPlayer.name} has surpassed the top score of ${topScoreToBeat}!`);
                this.isGameOver = true;
            }
            // If their score is not higher, the game is NOT over yet.
            // They must continue playing until they either beat the score, get all out, or run out of turns.
            // The "Hard Stop" condition above will catch those final states.
        }
    }
        
    public printGameSummary(): void {
        console.log("\n--- GAME OVER ---");
        
        // Sort players by score in descending order
        const sortedPlayers = [...this.players].sort((a, b) => b.score - a.score);

        console.log("Final Scores:");
        sortedPlayers.forEach((player, index) => {
            console.log(
                `${index + 1}. ${player.name}: ${player.score} runs for ${player.wickets} wickets.`
            );
        });

        if (sortedPlayers.length > 0) {
            console.log(`\n🎉 ${sortedPlayers[0].name} wins the game! 🎉`);
        }
    }

    public makeAIDecision(player: IPlayer): 1 | 2 {
        console.log(`[AI] ${player.name} is thinking...`);
        // For now, our AI is very simple: it chooses a token randomly.
        // This is the perfect place to add more complex logic later!
        // For example, you could calculate which move yields more points or is safer.
        const choice: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
        console.log(`[AI] ${player.name} has decided to move token ${choice}.`);
        return choice;
    }

    // ========================================================================
    // NEW SERIALIZATION METHODS
    // ========================================================================

    /**
     * Converts the entire Game instance into a plain JSON object.
     */
    public toJSON() {
        return {
            players: this.players.map(p => p.toJSON()), // Use the new method on each player
            currentPlayerIndex: this.currentPlayerIndex,
            isGameOver: this.isGameOver,
            gameMode: this.gameMode,
            settings: this.settings,
        };
    }

    /**
     * Creates a Game instance from a plain JSON object.
     */
    public static fromJSON(data: any): Game {
        // Create a new game instance without initializing players
        const game = new Game(data.gameMode, [], data.settings);
        
        // Re-hydrate the state from the JSON data
        game.players = data.players.map((playerData: any) => Player.fromJSON(playerData));
        game.currentPlayerIndex = data.currentPlayerIndex;
        game.isGameOver = data.isGameOver;

        return game;
    }
}