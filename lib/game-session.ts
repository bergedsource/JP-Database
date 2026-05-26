import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 20 minutes: covers worst-case slow play (~10 min) with ample buffer.
const SESSION_TTL_SEC = 20 * 60;

export interface GameSession {
  ip: string;
  startedAt: number; // ms epoch
  // Cap on submitted score for THIS specific question set (sum of 1pt per bigbro + 2pt per roll).
  // Server-side, this is what /score validates against — NOT the global MAX_POSSIBLE_SCORE.
  maxPossibleScore: number;
}

const KEY = (token: string) => `game-session:${token}`;

export async function createGameSession(ip: string, maxPossibleScore: number): Promise<string> {
  const token = crypto.randomUUID();
  await redis.set<GameSession>(
    KEY(token),
    { ip, startedAt: Date.now(), maxPossibleScore },
    { ex: SESSION_TTL_SEC },
  );
  return token;
}

// Atomic GET+DEL: only one caller wins if /score is fired twice for the same token.
export async function consumeGameSession(token: string): Promise<GameSession | null> {
  if (!token || typeof token !== "string") return null;
  const session = await redis.getdel<GameSession>(KEY(token));
  return session ?? null;
}
