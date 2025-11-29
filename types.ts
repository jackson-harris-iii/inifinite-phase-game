export enum CardColor {
  RED = 'RED',
  BLUE = 'BLUE',
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
  WILD = 'WILD', // Black
  SKIP = 'SKIP'  // Special
}

export enum CardType {
  NUMBER = 'NUMBER',
  WILD = 'WILD',
  SKIP = 'SKIP'
}

export interface Card {
  id: string;
  type: CardType;
  color: CardColor;
  value: number; // 1-12 for numbers, 0 for special. Skip is 15 pts, Wild 25.
  displayValue: string;
}

export enum RequirementType {
  SET = 'SET', // n cards of same value
  RUN = 'RUN', // n cards in sequence
  COLOR = 'COLOR' // n cards of same color
}

export interface PhaseRequirement {
  type: RequirementType;
  count: number; // How many cards needed
}

export interface Phase {
  id: number;
  name: string;
  description: string;
  requirements: PhaseRequirement[];
}

export interface Meld {
  id: string;
  cards: Card[];
  type: RequirementType;
  ownerId: string;
}

export interface Player {
  id: string;
  name: string;
  isHuman: boolean;
  hand: Card[];
  melds: Meld[]; // Cards currently laid down on table
  phaseIndex: number; // Which phase they are currently on (0-indexed)
  hasLaidDownPhase: boolean; // For the current round
  score: number;
  isSkipped?: boolean;
}

export enum GameState {
  LOBBY = 'LOBBY',
  GENERATING = 'GENERATING',
  PLAYING = 'PLAYING',
  ROUND_OVER = 'ROUND_OVER',
  GAME_OVER = 'GAME_OVER'
}

export enum TurnPhase {
  DRAW = 'DRAW',
  ACTION = 'ACTION', // Meld or Discard
  DISCARD = 'DISCARD'
}

// Multiplayer Types

export type NetworkActionType = 'DRAW' | 'DISCARD' | 'MELD' | 'HIT' | 'REORDER' | 'START_GAME';

export interface NetworkActionPayload {
  action: NetworkActionType;
  playerId?: string;
  cardId?: string; // For Discard / Hit
  cardIds?: string[]; // For Meld
  meldId?: string; // For Hit
  fromIndex?: number; // For Reorder
  toIndex?: number; // For Reorder
  fromDiscard?: boolean; // For Draw
}

export interface NetworkMessage {
  type: 'STATE_UPDATE' | 'ACTION' | 'PLAYER_JOINED';
  payload: any;
  senderId?: string;
}