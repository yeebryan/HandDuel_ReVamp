export type Gesture = 'rock' | 'paper' | 'scissors' | 'none';
export type GameMode = 'pvc' | 'pvp-local' | 'pvp-online';
export type GamePhase = 'idle' | 'waiting' | 'countdown' | 'show' | 'reveal' | 'result';
export type RoundWinner = 1 | 2 | 0; // 0 = draw

export interface HandResult {
  gesture: Gesture;
  handedness: 'Left' | 'Right';
  confidence: number;
}

export interface RoundResult {
  p1Gesture: Gesture;
  p2Gesture: Gesture;
  winner: RoundWinner;
}

export interface LeaderboardEntry {
  name: string;
  consecutiveWins: number;
  bestStreak: number;
  totalWins: number;
}

export interface MatchedEvent {
  roomId: string;
  opponentName: string;
  playerSide: 1 | 2;
}

export interface RevealEvent {
  p1Gesture: Gesture;
  p2Gesture: Gesture;
  winner: RoundWinner;
  p1Score: number;
  p2Score: number;
}

export interface MatchOverEvent {
  winner: 1 | 2;
  consecutiveWins: number;
}

export function rpsResult(p1: Gesture, p2: Gesture): RoundWinner {
  if (p1 === p2) return 0;
  if (
    (p1 === 'rock' && p2 === 'scissors') ||
    (p1 === 'scissors' && p2 === 'paper') ||
    (p1 === 'paper' && p2 === 'rock')
  ) return 1;
  return 2;
}
