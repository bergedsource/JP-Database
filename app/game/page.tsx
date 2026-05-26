"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GameQuestion, LeaderboardEntry } from "@/lib/types";
import { STARTING_LIVES, FEEDBACK_DELAY_MS, FEEDBACK_DELAY_WRONG_MS, TIMER_TICK_MS, BIGBRO_POINTS, ROLL_POINTS, QUESTION_TIME_LIMIT_MS, QUESTION_TICK_MS } from "@/lib/game-constants";
import "./game.css";

type GameState = "start" | "playing" | "over";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="game-leaderboard">
        <h3>Top 3</h3>
        <p style={{ color: "var(--text-dim, #9a917f)", margin: 0 }}>No entries yet — be the first.</p>
      </div>
    );
  }
  return (
    <div className="game-leaderboard">
      <h3>Top 3</h3>
      <ol>
        {entries.map((e) => (
          <li key={e.id}>
            <strong>{e.username}</strong> — {e.score} pts in {formatTime(e.time_seconds)}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function GamePage() {
  const [state, setState] = useState<GameState>("start");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [startTime, setStartTime] = useState<number>(0);
  const [now, setNow] = useState<number>(0);
  const [feedback, setFeedback] = useState<{ kind: "correct" | "wrong"; text: string } | null>(null);
  const [locked, setLocked] = useState(false);
  const [pickedRoll, setPickedRoll] = useState<number | null>(null);
  const [questionMsLeft, setQuestionMsLeft] = useState(QUESTION_TIME_LIMIT_MS);
  // Deadline lives in a ref, not state. Refs update synchronously, so the auto-fail effect
  // never sees a stale closure from the previous question after we advance.
  const questionDeadlineRef = useRef<number>(0);
  const [rollInput, setRollInput] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finalRank, setFinalRank] = useState<number | null>(null);
  const [submitErr, setSubmitErr] = useState("");
  const [startErr, setStartErr] = useState("");
  const [isCreator, setIsCreator] = useState(false);
  const [isPractice, setIsPractice] = useState(false);
  const submitRef = useRef(false);
  const autoFailFiredRef = useRef(false);

  // Load top-3 on mount and after game-over
  useEffect(() => {
    fetch("/api/game/leaderboard")
      .then((r) => r.json())
      .then((d) => setLeaderboard(Array.isArray(d.entries) ? d.entries : []))
      .catch(() => {});
  }, [state]);

  // Timer interval (1Hz) while playing
  useEffect(() => {
    if (state !== "playing") return;
    const t = setInterval(() => setNow(Date.now()), TIMER_TICK_MS);
    return () => clearInterval(t);
  }, [state]);

  // Reset per-question countdown and auto-fail guard when a new question starts.
  // Deadline is wall-clock so drift in setInterval cannot affect displayed accuracy.
  // Ref update is synchronous, so subsequent effects in the same render cycle see the new value.
  useEffect(() => {
    if (state === "playing") {
      questionDeadlineRef.current = Date.now() + QUESTION_TIME_LIMIT_MS;
      setQuestionMsLeft(QUESTION_TIME_LIMIT_MS);
      autoFailFiredRef.current = false;
    }
  }, [index, state]);

  // Recompute remaining time from the deadline at ~100Hz while the question is unanswered.
  // Read deadline from the ref so we always use the latest value, no closure staleness.
  useEffect(() => {
    if (state !== "playing" || locked) return;
    const t = setInterval(() => setQuestionMsLeft(Math.max(0, questionDeadlineRef.current - Date.now())), QUESTION_TICK_MS);
    return () => clearInterval(t);
  }, [state, locked]);

  // Auto-fail when countdown hits 0.
  // No cleanup return: the setTimeout must not be cancelled when setLocked(true) re-triggers this effect.
  // autoFailFiredRef guards against double-firing on the same question.
  // The deadlineRef check is the load-bearing guard: it prevents stale msLeft from re-firing across question boundaries.
  useEffect(() => {
    if (isCreator) return; // creator test mode: timer never auto-fails
    if (state !== "playing" || locked || autoFailFiredRef.current) return;
    if (Date.now() < questionDeadlineRef.current) return;
    if (questionMsLeft > 0) return;
    autoFailFiredRef.current = true;
    const q = questions[index];
    const capturedScore = score;
    const capturedLives = lives;
    setLocked(true);
    const correctText =
      q.type === "bigbro"
        ? `Time's up! Answer: ${q.options?.find((o) => o.roll === q.correct_answer)?.name ?? `#${q.correct_answer}`}`
        : `Time's up! Answer: #${q.correct_answer}`;
    setFeedback({ kind: "wrong", text: correctText });
    setTimeout(() => advanceOrEnd(capturedScore, isPractice ? capturedLives : capturedLives - 1), FEEDBACK_DELAY_WRONG_MS);
  }, [questionMsLeft, state, locked, isCreator, isPractice]);

  async function beginRun(practice: boolean) {
    setStartErr("");
    try {
      const res = await fetch("/api/game/start");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStartErr(data.error ?? "Failed to start game");
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        setStartErr("No questions available right now");
        return;
      }
      setQuestions(data.questions);
      setIsCreator(data.is_creator === true);
      setIsPractice(practice);
      setIndex(0);
      setScore(0);
      setLives(STARTING_LIVES);
      setRollInput("");
      setFeedback(null);
      setLocked(false);
      setPickedRoll(null);
      setQuestionMsLeft(QUESTION_TIME_LIMIT_MS);
      submitRef.current = false;
      const t = Date.now();
      setStartTime(t);
      setNow(t);
      setState("playing");
    } catch {
      setStartErr("Network error starting game");
    }
  }

  async function handleStart() {
    setUsernameError("");
    const trimmed = username.trim();
    if (!/^[A-Za-z0-9 ]{1,16}$/.test(trimmed)) {
      setUsernameError("1-16 characters, letters/digits/spaces only");
      return;
    }
    await beginRun(false);
  }

  async function handlePractice() {
    setUsernameError("");
    await beginRun(true);
  }

  function advanceOrEnd(newScore: number, newLives: number) {
    const next = index + 1;
    if (newLives <= 0 || next >= questions.length) {
      setScore(newScore);
      setLives(newLives);
      setState("over");
      return;
    }
    setScore(newScore);
    setLives(newLives);
    setIndex(next);
    setRollInput("");
    setFeedback(null);
    setLocked(false);
    setPickedRoll(null);
  }

  function answerBigbro(picked: number) {
    if (locked) return;
    const q = questions[index];
    setLocked(true);
    setPickedRoll(picked);
    const correct = picked === q.correct_answer;
    if (correct) {
      setFeedback({ kind: "correct", text: "Correct!" });
      setTimeout(() => advanceOrEnd(score + BIGBRO_POINTS, lives), FEEDBACK_DELAY_MS);
    } else {
      const correctName = q.options?.find((o) => o.roll === q.correct_answer)?.name ?? `#${q.correct_answer}`;
      setFeedback({ kind: "wrong", text: `Wrong! Answer: ${correctName}` });
      setTimeout(() => advanceOrEnd(score, isCreator || isPractice ? lives : lives - 1), FEEDBACK_DELAY_WRONG_MS);
    }
  }

  function answerRoll() {
    if (locked) return;
    const q = questions[index];
    const parsed = parseInt(rollInput.trim(), 10);
    if (!Number.isInteger(parsed)) return;
    setLocked(true);
    const correct = parsed === q.correct_answer;
    if (correct) {
      setFeedback({ kind: "correct", text: "Correct!" });
      setTimeout(() => advanceOrEnd(score + ROLL_POINTS, lives), FEEDBACK_DELAY_MS);
    } else {
      setFeedback({ kind: "wrong", text: `Wrong! Answer: #${q.correct_answer}` });
      setTimeout(() => advanceOrEnd(score, isCreator || isPractice ? lives : lives - 1), FEEDBACK_DELAY_WRONG_MS);
    }
  }

  // Submit score on entering 'over' (once). Creator + practice runs do not pollute the leaderboard.
  useEffect(() => {
    if (state !== "over" || submitRef.current) return;
    submitRef.current = true;
    if (isCreator || isPractice) return;
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
    fetch("/api/game/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), score, time_seconds: elapsedSec }),
      signal: AbortSignal.timeout(8000),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setSubmitErr(data.error ?? "Couldn't save score");
          return;
        }
        setFinalRank(typeof data.rank === "number" ? data.rank : null);
      })
      .catch((err) => {
        if (err?.name === "TimeoutError" || err?.name === "AbortError") {
          setSubmitErr("Saving score timed out — try again next round");
        } else {
          setSubmitErr("Network error saving score");
        }
      });
  }, [state, startTime, score, username]);

  // Render: start
  if (state === "start") {
    return (
      <main className="game-shell">
        <div className="game-card start-mode">
          <h1 className="game-title">Acacia Roll Number Game</h1>
          <p className="game-rules">
            3 lives. 1 point for each big brother you match. 2 points for each roll number you remember. Fastest time wins.
          </p>
          <label htmlFor="game-username" style={{ fontSize: 12, color: "var(--text-dim, #9a917f)" }}>Username</label>
          <input
            id="game-username"
            className="game-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={16}
            placeholder="1-16 chars"
            autoComplete="off"
            style={{ margin: "4px 0 12px" }}
          />
          {usernameError && <p role="alert" aria-live="polite" style={{ color: "#EF4444", fontSize: 12, margin: "0 0 12px" }}>{usernameError}</p>}
          {startErr && <p role="alert" aria-live="polite" style={{ color: "#EF4444", fontSize: 12, margin: "0 0 12px" }}>{startErr}</p>}
          <div className="game-button-row">
            <button className="game-btn" onClick={handleStart} disabled={!username.trim()}>
              Start
            </button>
            <button className="game-btn game-btn-ghost" onClick={handlePractice} title="Unlimited lives. No username. Score not saved.">
              Practice
            </button>
          </div>
          <Leaderboard entries={leaderboard} />
          <div style={{ marginTop: 24, fontSize: 12 }}>
            <Link href="/" style={{ color: "var(--text-dim, #9a917f)" }}>← Back to home</Link>
          </div>
        </div>
      </main>
    );
  }

  // Render: playing
  if (state === "playing") {
    const q = questions[index];
    const elapsedSec = Math.max(0, Math.floor((now - startTime) / 1000));
    return (
      <main className="game-shell">
        <div className="game-header-bar">
          <span>⏱ {formatTime(elapsedSec)}</span>
          <span aria-label={isCreator || isPractice ? "unlimited lives" : `${lives} ${lives === 1 ? "life" : "lives"} remaining`}>
            {isCreator || isPractice ? "∞" : "💀".repeat(lives)}
          </span>
          <span>SCORE {score}</span>
          {isCreator && <span className="game-test-badge" aria-label="creator test mode">TEST</span>}
          {!isCreator && isPractice && <span className="game-test-badge" aria-label="practice mode">PRACTICE</span>}
        </div>
        <div className="game-card playing-mode">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#9a917f" }}>
            <span>Question {index + 1} of {questions.length}</span>
            <span
              className={"game-question-timer" + (!isCreator && questionMsLeft <= 2000 ? " urgent" : "")}
              style={{ color: isCreator ? "#9a917f" : questionMsLeft <= 2000 ? "#EF4444" : "#9a917f" }}
              aria-label={isCreator ? "unlimited time" : `${Math.ceil(questionMsLeft / 1000)} seconds remaining`}
            >
              {isCreator ? "∞" : `${(questionMsLeft / 1000).toFixed(2)}s`}
            </span>
          </div>
          <div className="game-question-wrap" key={index}>
          {q.type === "bigbro" ? (
            <>
              <p className="game-question">Who is the big brother of <strong>{q.member_name}</strong>?</p>
              <div className="game-options">
                {q.options?.map((o) => {
                  const showResult = locked;
                  const isCorrect = o.roll === q.correct_answer;
                  const isPickedWrong = showResult && o.roll === pickedRoll && !isCorrect;
                  const cls = showResult && isCorrect ? "correct" : isPickedWrong ? "wrong" : "";
                  return (
                    <button key={o.roll} onClick={() => answerBigbro(o.roll)} disabled={locked} className={cls}>
                      {o.name}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p className="game-question">What is <strong>{q.member_name}</strong>'s roll number?</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="game-input"
                  type="number"
                  value={rollInput}
                  onChange={(e) => setRollInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") answerRoll(); }}
                  placeholder="e.g. 1234"
                  disabled={locked}
                  aria-label="Roll number"
                  autoFocus
                />
                <button className="game-btn" onClick={answerRoll} disabled={locked || !rollInput.trim()}>
                  Submit
                </button>
              </div>
            </>
          )}
          </div>
          {feedback && <div className={`game-feedback ${feedback.kind}`} role="status" aria-live="polite">{feedback.text}</div>}
        </div>
      </main>
    );
  }

  // Render: over
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  const allDone = lives > 0 && index >= questions.length - 1;
  return (
    <main className="game-shell">
      <div className="game-card start-mode">
        <h1 className="game-title">{allDone ? "ALL DONE!" : "GAME OVER"}</h1>
        <p className="game-rules">
          Score: <strong style={{ color: "var(--gold, #c9a85a)" }}>{score}</strong> · Time: <strong style={{ color: "var(--gold, #c9a85a)" }}>{formatTime(elapsedSec)}</strong>
        </p>
        {finalRank != null && (
          <p style={{ color: "#c9a85a", fontSize: 16, margin: "0 0 16px" }}>
            🏆 You made #{finalRank} on the leaderboard!
          </p>
        )}
        {isPractice && !isCreator && (
          <p style={{ color: "var(--text-dim, #9a917f)", fontSize: 12, fontStyle: "italic", margin: "0 0 16px" }}>
            Practice run — score not saved to the leaderboard.
          </p>
        )}
        {submitErr && <p role="alert" aria-live="polite" style={{ color: "#EF4444", fontSize: 12 }}>{submitErr}</p>}
        <div className="game-button-row">
          <button className="game-btn" onClick={() => { setState("start"); setSubmitErr(""); setFinalRank(null); setIsPractice(false); }}>
            Play Again
          </button>
          <Link href="/" className="game-btn game-btn-ghost" style={{ textDecoration: "none", display: "inline-block" }}>
            Back to Home
          </Link>
        </div>
        <Leaderboard entries={leaderboard} />
      </div>
    </main>
  );
}
