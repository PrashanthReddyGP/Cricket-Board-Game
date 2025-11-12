// src/game.ts
import { boardLayout } from './boardLayout';
import { Player } from './player';
import {  Direction, GameMode, PlayerColor, SquareType } from './types';
import type { BoardSquare, DiceResult, GameSettings, IPlayer } from './types';

// Configuration for player colors and their home bases
const PLAYER_CONFIG = {
    [PlayerColor.Blue]:   { name: "Player 1 (Blue)",   homeBaseIndex: 0 },
    [PlayerColor.Yellow]: { name: "Player 2 (Yellow)", homeBaseIndex: 12 },
    [PlayerColor.Green]:  { name: "Player 3 (Green)",  homeBaseIndex: 24 },
    [PlayerColor.Purple]: { name: "Player 4 (Purple)", homeBaseIndex: 36 },
};

const MAX_WICKETS = 10;
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
        this.initializePlayers(playerColors, humanPlayerColor);
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
            console.log(`LEVEL UP! ${player.name}'s token ${token.id} is now level ${token.level}!`);
        }

        token.positionIndex = newPosition;
        console.log(`${player.name} moves token ${token.id} from square ${oldPosition} to ${newPosition}.`);

        // First, handle collisions and check if a kill took place.
        const aKillHappened = this.handleCollisions(player, tokenIdToMove, newPosition);

        // If a kill happened, the bonus is already awarded. The turn ends.
        if (aKillHappened) {
            player.decrementTurn();
            this.advanceToNextPlayer();
        } else {
            // If no kill, resolve the square event normally.
            const landingSquare = this.board[newPosition];
            const getsAnotherTurn = this.resolveSquareEvent(player, token.id, landingSquare);
            
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
                    victim.takeWicket();
                    victim.returnTokenToHome(victimToken .id);

                    if (this.settings.stealLevelOnKill && victimLevel > attackingToken.level) {
                        console.log(`${attacker.name}'s token ${attackingToken.id} stole level ${victimLevel} from the victim!`);
                        attackingToken.level = victimLevel;
                    }

                    // Attacker Bonus is awarded for EACH kill
                    if (landingSquare.type === SquareType.Runs) {
                        const bonusPoints = landingSquare.value * 2;
                        attacker.addScore(bonusPoints);
                        console.log(`${attacker.name} gets ${bonusPoints} bonus points for the kill!`);
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
                break;
            case SquareType.Wicket:
                // Wicket logic is unaffected by level
                player.takeWicket();
                player.returnTokenToHome(tokenId);
                break;
            case SquareType.Extra:
                // Award points equal to the token's level.
                const extraRuns = tokenLevel;
                player.addScore(extraRuns);
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

    private advanceToNextPlayer(): void {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
    
    private checkGameOver(): void {
        if (this.gameMode === GameMode.Test) {
            // Test mode ends when all players are all out
            this.isGameOver = this.players.every(p => p.isAllOut);
        } else {
            // Limited overs modes end when all players have 0 turns left
            this.isGameOver = this.players.every(p => p.turnsRemaining === 0 || p.isAllOut);
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

    public makeAIDecision(player: IPlayer, diceResult: DiceResult): 1 | 2 {
        console.log(`[AI] ${player.name} is thinking...`);
        // For now, our AI is very simple: it chooses a token randomly.
        // This is the perfect place to add more complex logic later!
        // For example, you could calculate which move yields more points or is safer.
        const choice: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
        console.log(`[AI] ${player.name} has decided to move token ${choice}.`);
        return choice;
    }
}