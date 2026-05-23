// Single source of truth for game tuning constants. Edit here, not at call sites.
export const QUESTIONS_PER_GAME = 25;
export const MAX_POINTS_PER_QUESTION = 2;
export const SCORE_CAP = QUESTIONS_PER_GAME * MAX_POINTS_PER_QUESTION;

// Game-page tuning constants.
export const STARTING_LIVES = 3;
export const FEEDBACK_DELAY_MS = 800;
export const TIMER_TICK_MS = 1000;
export const BIGBRO_POINTS = 1;
export const ROLL_POINTS = 2;
