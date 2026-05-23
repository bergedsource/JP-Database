"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GameQuestion, LeaderboardEntry } from "@/lib/types";
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
  const [lives, setLives] = useState(3);
  const [startTime, setStartTime] = useState<number>(0);
  const [now, setNow] = useState<number>(0);
  const [feedback, setFeedback] = useState<{ kind: "correct" | "wrong"; text: string } | null>(null);
  const [locked, setLocked] = useState(false);
  const [rollInput, setRollInput] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [finalRank, setFinalRank] = useState<number | null>(null);
  const [submitErr, setSubmitErr] = useState("");
  const [startErr, setStartErr] = useState("");
  const submitRef = useRef(false);

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
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state]);

  async function handleStart() {
    setUsernameError("");
    setStartErr("");
    const trimmed = username.trim();
    if (!/^[A-Za-z0-9 ]{1,16}$/.test(trimmed)) {
      setUsernameError("1-16 characters, letters/digits/spaces only");
      return;
    }
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
      setIndex(0);
      setScore(0);
      setLives(3);
      setRollInput("");
      setFeedback(null);
      setLocked(false);
      submitRef.current = false;
      const t = Date.now();
      setStartTime(t);
      setNow(t);
      setState("playing");
    } catch {
      setStartErr("Network error starting game");
    }
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
  }

  function answerBigbro(pickedRoll: number) {
    if (locked) return;
    const q = questions[index];
    setLocked(true);
    const correct = pickedRoll === q.correct_answer;
    if (correct) {
      setFeedback({ kind: "correct", text: "Correct!" });
      setTimeout(() => advanceOrEnd(score + 1, lives), 800);
    } else {
      const correctName = q.options?.find((o) => o.roll === q.correct_answer)?.name ?? `#${q.correct_answer}`;
      setFeedback({ kind: "wrong", text: `Wrong! Answer: ${correctName}` });
      setTimeout(() => advanceOrEnd(score, lives - 1), 800);
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
      setTimeout(() => advanceOrEnd(score + 2, lives), 800);
    } else {
      setFeedback({ kind: "wrong", text: `Wrong! Answer: #${q.correct_answer}` });
      setTimeout(() => advanceOrEnd(score, lives - 1), 800);
    }
  }

  // Submit score on entering 'over' (once)
  useEffect(() => {
    if (state !== "over" || submitRef.current) return;
    submitRef.current = true;
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
    fetch("/api/game/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), score, time_seconds: elapsedSec }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setSubmitErr(data.error ?? "Couldn't save score");
          return;
        }
        setFinalRank(typeof data.rank === "number" ? data.rank : null);
      })
      .catch(() => setSubmitErr("Network error saving score"));
  }, [state, startTime, score, username]);

  // Render: start
  if (state === "start") {
    return (
      <main className="game-shell">
        <div className="game-card">
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
          {usernameError && <p style={{ color: "#EF4444", fontSize: 12, margin: "0 0 12px" }}>{usernameError}</p>}
          {startErr && <p style={{ color: "#EF4444", fontSize: 12, margin: "0 0 12px" }}>{startErr}</p>}
          <button className="game-btn" onClick={handleStart} disabled={!username.trim()}>
            Start
          </button>
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
          <span>{"💀".repeat(lives)}</span>
          <span>SCORE {score}</span>
        </div>
        <div className="game-card">
          <div style={{ fontSize: 12, color: "var(--text-dim, #9a917f)" }}>
            Question {index + 1} of {questions.length}
          </div>
          {q.type === "bigbro" ? (
            <>
              <p className="game-question">Who is the big brother of <strong>{q.member_name}</strong>?</p>
              <div className="game-options">
                {q.options?.map((o) => {
                  const showResult = locked;
                  const isCorrect = o.roll === q.correct_answer;
                  const cls = showResult && isCorrect ? "correct" : "";
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
                  autoFocus
                />
                <button className="game-btn" onClick={answerRoll} disabled={locked || !rollInput.trim()}>
                  Submit
                </button>
              </div>
            </>
          )}
          {feedback && <div className={`game-feedback ${feedback.kind}`}>{feedback.text}</div>}
        </div>
      </main>
    );
  }

  // Render: over
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  const allDone = lives > 0 && index >= questions.length - 1;
  return (
    <main className="game-shell">
      <div className="game-card">
        <h1 className="game-title">{allDone ? "ALL DONE!" : "GAME OVER"}</h1>
        <p className="game-rules">
          Score: <strong style={{ color: "var(--gold, #c9a85a)" }}>{score}</strong> · Time: <strong style={{ color: "var(--gold, #c9a85a)" }}>{formatTime(elapsedSec)}</strong>
        </p>
        {finalRank != null && (
          <p style={{ color: "#c9a85a", fontSize: 16, margin: "0 0 16px" }}>
            🏆 You made #{finalRank} on the leaderboard!
          </p>
        )}
        {submitErr && <p style={{ color: "#EF4444", fontSize: 12 }}>{submitErr}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="game-btn" onClick={() => { setState("start"); setSubmitErr(""); setFinalRank(null); }}>
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
