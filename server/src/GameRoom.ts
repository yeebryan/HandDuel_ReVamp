import type { Server } from 'socket.io';
import type { OnlineLeaderboard } from './OnlineLeaderboard.js';

type Gesture = 'rock' | 'paper' | 'scissors' | 'none';
type RoundWinner = 0 | 1 | 2;

function rps(p1: Gesture, p2: Gesture): RoundWinner {
  if (p1 === p2) return 0;
  if (
    (p1 === 'rock' && p2 === 'scissors') ||
    (p1 === 'scissors' && p2 === 'paper') ||
    (p1 === 'paper' && p2 === 'rock')
  ) return 1;
  return 2;
}

function randomGesture(): Gesture {
  return (['rock', 'paper', 'scissors'] as Gesture[])[Math.floor(Math.random() * 3)];
}

interface Player {
  socketId: string;
  name: string;
  gesture: Gesture;
  score: number;
  side: 1 | 2;
}

const COUNTDOWN_FROM = 3;
const SHOW_DURATION  = 1200; // ms after show signal before forcing resolve
const WINS_NEEDED    = 2;

export class GameRoom {
  readonly id: string;
  private p1: Player;
  private p2: Player;
  private countdownTimer: NodeJS.Timeout | null = null;
  private showTimer: NodeJS.Timeout | null = null;
  private resolved = false;

  constructor(
    id: string,
    p1Socket: string, p1Name: string,
    p2Socket: string, p2Name: string,
    private io: Server,
    private ns: string, // socket.io namespace prefix ('comp' | 'casual')
    private leaderboard: OnlineLeaderboard | null,
    private onGameOver: (roomId: string) => void,
  ) {
    this.id = id;
    this.p1 = { socketId: p1Socket, name: p1Name, gesture: 'none', score: 0, side: 1 };
    this.p2 = { socketId: p2Socket, name: p2Name, gesture: 'none', score: 0, side: 2 };
  }

  hasSocket(socketId: string): boolean {
    return this.p1.socketId === socketId || this.p2.socketId === socketId;
  }

  start(): void {
    this.io.to(this.p1.socketId).emit(`${this.ns}:matched`, {
      roomId: this.id, opponentName: this.p2.name, playerSide: 1,
    });
    this.io.to(this.p2.socketId).emit(`${this.ns}:matched`, {
      roomId: this.id, opponentName: this.p1.name, playerSide: 2,
    });
    setTimeout(() => this.startRound(), 800);
  }

  private startRound(): void {
    this.p1.gesture = 'none';
    this.p2.gesture = 'none';
    this.resolved = false;

    let countdown = COUNTDOWN_FROM;
    this.emit(`${this.ns}:countdown`, { value: countdown });

    this.countdownTimer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        this.emit(`${this.ns}:countdown`, { value: countdown });
      } else {
        clearInterval(this.countdownTimer!);
        this.countdownTimer = null;
        this.beginShow();
      }
    }, 1000);
  }

  private beginShow(): void {
    this.emit(`${this.ns}:show`, {});
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      this.resolveRound();
    }, SHOW_DURATION);
  }

  receiveGesture(socketId: string, gesture: Gesture): void {
    if (this.resolved) return;
    if (socketId === this.p1.socketId && gesture !== 'none') this.p1.gesture = gesture;
    if (socketId === this.p2.socketId && gesture !== 'none') this.p2.gesture = gesture;

    // Resolve early if both players have submitted
    if (this.p1.gesture !== 'none' && this.p2.gesture !== 'none') {
      if (this.showTimer) { clearTimeout(this.showTimer); this.showTimer = null; }
      this.resolveRound();
    }
  }

  private resolveRound(): void {
    if (this.resolved) return;
    this.resolved = true;

    if (this.p1.gesture === 'none') this.p1.gesture = randomGesture();
    if (this.p2.gesture === 'none') this.p2.gesture = randomGesture();

    const winner = rps(this.p1.gesture, this.p2.gesture);
    if (winner === 1) this.p1.score++;
    if (winner === 2) this.p2.score++;

    this.emit(`${this.ns}:reveal`, {
      p1Gesture: this.p1.gesture,
      p2Gesture: this.p2.gesture,
      winner,
      p1Score: this.p1.score,
      p2Score: this.p2.score,
    });

    setTimeout(() => {
      if (this.p1.score >= WINS_NEEDED || this.p2.score >= WINS_NEEDED) {
        void this.endMatch();
      } else {
        this.startRound();
      }
    }, 2500);
  }

  private async endMatch(): Promise<void> {
    const matchWinner: 1 | 2 = this.p1.score >= WINS_NEEDED ? 1 : 2;
    const winnerPlayer = matchWinner === 1 ? this.p1 : this.p2;
    const loserPlayer  = matchWinner === 1 ? this.p2 : this.p1;

    if (this.leaderboard) {
      const [streak] = await Promise.all([
        this.leaderboard.recordWin(winnerPlayer.name),
        this.leaderboard.resetStreak(loserPlayer.name),
      ]);
      this.emit(`${this.ns}:match_over`, { winner: matchWinner, consecutiveWins: streak });
    } else {
      this.emit(`${this.ns}:match_over`, { winner: matchWinner, consecutiveWins: 0 });
    }

    this.onGameOver(this.id);
  }

  handleDisconnect(socketId: string): void {
    this.clearTimers();
    const remainingSocket = socketId === this.p1.socketId ? this.p2.socketId : this.p1.socketId;
    this.io.to(remainingSocket).emit(`${this.ns}:opponent_disconnected`, {});

    if (this.leaderboard) {
      const disconnected = socketId === this.p1.socketId ? this.p1 : this.p2;
      void this.leaderboard.resetStreak(disconnected.name);
    }

    this.onGameOver(this.id);
  }

  private emit(event: string, data: object): void {
    this.io.to(this.p1.socketId).emit(event, data);
    this.io.to(this.p2.socketId).emit(event, data);
  }

  private clearTimers(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    if (this.showTimer) clearTimeout(this.showTimer);
    this.countdownTimer = null;
    this.showTimer = null;
  }

  destroy(): void {
    this.clearTimers();
  }
}
