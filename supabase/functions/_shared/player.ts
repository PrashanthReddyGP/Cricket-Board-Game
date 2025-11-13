import { PlayerColor } from './types.ts';
import type { IPlayer, PlayerToken } from './types.ts';

export class Player implements IPlayer {
    public score: number = 0;
    public wickets: number = 0;
    public turnsRemaining: number | null;
    public tokens: [PlayerToken, PlayerToken];
    public isAllOut: boolean = false;
    public readonly isAI: boolean;

    constructor(
        public readonly id: number,
        public readonly name: string,
        public readonly color: PlayerColor,
        public readonly homeBaseIndex: number,
        initialTurns: number | null,
        isAI: boolean
    ) {
        this.turnsRemaining = initialTurns;
        this.isAI = isAI;
        this.tokens = [
            { id: 1, positionIndex: homeBaseIndex, level: 1 },
            { id: 2, positionIndex: homeBaseIndex, level: 1 },
        ];
    }

    public addScore(runs: number): void {
        this.score += runs;
        console.log(`${this.name} scores ${runs}. Total score: ${this.score}`);
    }

    public takeWicket(): void {
        this.wickets++;
        console.log(`WICKET! ${this.name} loses a wicket. Total wickets: ${this.wickets}/10`);
        if (this.wickets >= 10) {
            this.isAllOut = true;
            console.log(`${this.name} is All Out!`);
        }
    }

    public returnTokenToHome(tokenId: number): void {
        const token = this.tokens.find(t => t.id === tokenId);
        if (token) {
            token.positionIndex = this.homeBaseIndex;
            token.level = 1;
            console.log(`${this.name}'s token ${tokenId} returns to home base. Its level is reset to 1.`);
        }
    }

    public decrementTurn(): void {
        if (this.turnsRemaining !== null) {
            this.turnsRemaining--;
        }
    }

    // ========================================================================
    // NEW SERIALIZATION METHODS
    // ========================================================================

    /**
     * Converts the Player instance into a plain JSON object.
     */
    public toJSON() {
        return {
            id: this.id,
            name: this.name,
            color: this.color,
            homeBaseIndex: this.homeBaseIndex,
            isAI: this.isAI,
            score: this.score,
            wickets: this.wickets,
            turnsRemaining: this.turnsRemaining,
            tokens: this.tokens,
            isAllOut: this.isAllOut,
        };
    }

    /**
     * Creates a Player instance from a plain JSON object.
     */
    public static fromJSON(data: any): Player {
        // Create a new player instance using the constructor for essential properties
        const player = new Player(data.id, data.name, data.color, data.homeBaseIndex, data.turnsRemaining, data.isAI);
        
        // Manually assign the stateful properties
        player.score = data.score;
        player.wickets = data.wickets;
        player.tokens = data.tokens;
        player.isAllOut = data.isAllOut;

        return player;
    }
}