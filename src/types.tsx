export const Direction = {
    Clockwise: "Green",
    AntiClockwise: "Red",
} as const;

export type Direction = typeof Direction[keyof typeof Direction];

export const SquareType = {
    SafeZone: "SafeZone",
    Runs: "Runs",
    DotBall: "DotBall",
    Wicket: "Wicket",
    Extra: "Extra",
} as const;

export type SquareType = typeof SquareType[keyof typeof SquareType];

export const PlayerColor = {
    Blue: "Blue",
    Yellow: "Yellow",
    Green: "Green",
    Purple: "Purple",
} as const;

export type PlayerColor = typeof PlayerColor[keyof typeof PlayerColor];

export const GameMode = {
    T20: "T20",
    FiftyFifty: "50-50",
    Test: "Test",
} as const;

export interface BoardSquare {
    readonly index: number;
    readonly coords: { row: number; col: number };
    readonly type: SquareType;
    readonly value: number; // For runs, 0 otherwise
    readonly ownerColor?: PlayerColor;
}

export interface PlayerToken {
    id: number;
    positionIndex: number;
    level: number;
}

export interface DiceResult {
    movement: number; // 1 to 6
    direction: Direction;
}

// We will use a class for the Player, but here is the interface for its properties
export interface IPlayer {
    readonly id: number;
    readonly name: string;
    readonly color: PlayerColor;
    readonly isAI: boolean;
    score: number;
    wickets: number;
    turnsRemaining: number | null; // null for Test mode
    readonly homeBaseIndex: number;
    tokens: [PlayerToken, PlayerToken];
    isAllOut: boolean;
}

// Type for the animation state
export type AnimatingToken = {
  playerColor: PlayerColor;
  tokenId: 1 | 2;
  path: number[];
  currentStep: number;
  phase: AnimationPhase;
  startPosition: number;
  level: number;
};

export type AnimationPhase = 'lifting' | 'moving' | 'landing';

export interface GameSettings {
    allowAntiClockwise: boolean;
    killRule: 'jackpot' | 'fortress';
    stealLevelOnKill: boolean;
}