// Single source of truth for game tuning constants. Edit here, not at call sites.
// Server-side anti-abuse upper bound for /api/game/score. Generous enough to fit any
// plausible chapter size: 1pt bigbro + 2pt roll per member, ~600+ members capacity.
export const MAX_POSSIBLE_SCORE = 2000;

// Game-page tuning constants.
export const QUESTION_TIME_LIMIT_MS = 7500;
export const QUESTION_TICK_MS = 10;
export const STARTING_LIVES = 3;
export const FEEDBACK_DELAY_MS = 800;
export const FEEDBACK_DELAY_WRONG_MS = 1000;
export const TIMER_TICK_MS = 1000;
export const BIGBRO_POINTS = 1;
export const ROLL_POINTS = 2;
