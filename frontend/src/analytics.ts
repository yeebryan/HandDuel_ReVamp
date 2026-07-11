import posthog from 'posthog-js';

const POSTHOG_KEY  = 'phc_kCzWZTw2DxC77GRddPNLR3bWCKLQnS22Lz6ctFfbFVmR';
const POSTHOG_HOST = 'https://us.i.posthog.com';

posthog.init(POSTHOG_KEY, {
  api_host: POSTHOG_HOST,
  person_profiles: 'identified_only',
  capture_pageview: false, // we fire events manually
});

export function trackAppLoaded() {
  posthog.capture('app_loaded');
}

export function trackCameraGranted() {
  posthog.capture('camera_granted');
}

export function trackModeSelected(mode: string) {
  posthog.capture('mode_selected', { mode });
}

export function trackGameStarted(mode: string) {
  posthog.capture('game_started', { mode });
}

export function trackRoundPlayed(mode: string, winner: number) {
  posthog.capture('round_played', { mode, winner });
}

export function trackGameOver(streak: number) {
  posthog.capture('game_over', { streak });
}

export function trackStreakSubmitted(streak: number) {
  posthog.capture('streak_submitted', { streak });
}

export function trackLeaderboardViewed(context: string) {
  posthog.capture('leaderboard_viewed', { context });
}
