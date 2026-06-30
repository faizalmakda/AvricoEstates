import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { Card, PageHeader } from '../components/ui'
import birdSrc from '../assets/logo-mark.png'

// --- A self-contained, branded Flappy-style game. No farm data is touched. ---
const W = 360, H = 560
const GRAVITY = 0.45, FLAP = -7.6, R = 18, BIRD_X = 92
const PIPE_W = 60, GAP = 165, SPEED = 2.3, SPAWN = 215, GROUND = 44

export default function Game() {
  const { user, profile } = useAuth()
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const g = useRef({ y: H / 2, v: 0, pipes: [], score: 0, mode: 'ready' })
  const [mode, setMode] = useState('ready')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [board, setBoard] = useState([])

  const loadBoard = () =>
    supabase.from('game_scores').select('player_name,score')
      .order('score', { ascending: false }).limit(10)
      .then(({ data }) => setBoard(data ?? []))

  useEffect(() => {
    setBest(Number(localStorage.getItem('avrico:flappy:best') || 0))
    loadBoard()
    const img = new Image(); img.src = birdSrc; imgRef.current = img
  }, [])

  const gameOver = () => {
    const s = g.current
    s.mode = 'over'; setMode('over'); setScore(s.score)
    if (s.score > Number(localStorage.getItem('avrico:flappy:best') || 0)) {
      localStorage.setItem('avrico:flappy:best', String(s.score)); setBest(s.score)
    }
    if (s.score > 0 && user) {
      supabase.from('game_scores')
        .insert({ user_id: user.id, player_name: profile?.full_name || 'Player', score: s.score })
        .then(loadBoard)
    }
  }

  const flap = () => {
    const s = g.current
    if (s.mode === 'ready') { s.mode = 'playing'; s.v = FLAP; setMode('playing') }
    else if (s.mode === 'playing') { s.v = FLAP }
    else if (s.mode === 'over') {
      g.current = { y: H / 2, v: FLAP, pipes: [], score: 0, mode: 'playing' }
      setScore(0); setMode('playing')
    }
  }

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d')
    let raf
    const hitRect = (cx, cy, rx, ry, rw, rh) => {
      const nx = Math.max(rx, Math.min(cx, rx + rw))
      const ny = Math.max(ry, Math.min(cy, ry + rh))
      return (cx - nx) ** 2 + (cy - ny) ** 2 < R * R
    }
    const loop = () => {
      const s = g.current
      if (s.mode === 'playing') {
        s.v += GRAVITY; s.y += s.v
        if (s.y < R) { s.y = R; s.v = 0 }
        s.pipes.forEach((p) => { p.x -= SPEED })
        if (s.pipes.length === 0 || s.pipes[s.pipes.length - 1].x < W - SPAWN) {
          s.pipes.push({ x: W, top: 60 + Math.random() * (H - GROUND - GAP - 120), scored: false })
        }
        s.pipes = s.pipes.filter((p) => p.x + PIPE_W > -2)
        for (const p of s.pipes) {
          if (!p.scored && p.x + PIPE_W < BIRD_X) { p.scored = true; s.score += 1 }
          if (hitRect(BIRD_X, s.y, p.x, 0, PIPE_W, p.top) ||
              hitRect(BIRD_X, s.y, p.x, p.top + GAP, PIPE_W, H)) { gameOver(); break }
        }
        if (s.y + R > H - GROUND) { s.y = H - GROUND - R; gameOver() }
      }
      // ---- draw ----
      ctx.fillStyle = '#f4f1e9'; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = '#4d7a32'
      for (const p of s.pipes) {
        ctx.fillRect(p.x, 0, PIPE_W, p.top)
        ctx.fillRect(p.x, p.top + GAP, PIPE_W, H - GROUND - (p.top + GAP))
      }
      ctx.fillStyle = '#3a5d26'; ctx.fillRect(0, H - GROUND, W, GROUND)
      const img = imgRef.current
      if (img && img.complete) {
        ctx.save(); ctx.translate(BIRD_X, s.y)
        ctx.rotate(Math.max(-0.4, Math.min(1.0, s.v * 0.05)))
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.clip()
        ctx.drawImage(img, -R, -R, R * 2, R * 2); ctx.restore()
        ctx.beginPath(); ctx.arc(BIRD_X, s.y, R, 0, Math.PI * 2)
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke()
      }
      ctx.fillStyle = '#24432f'; ctx.font = 'bold 30px system-ui, sans-serif'
      ctx.textAlign = 'center'
      if (s.mode !== 'ready') ctx.fillText(String(s.score), W / 2, 56)
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, []) // eslint-disable-line

  return (
    <div>
      <PageHeader title="Avrico Flappy" subtitle="Tap to flap — don't hit the trees!" />
      <div className="game-cols">
        <div className="game-wrap" onPointerDown={(e) => { e.preventDefault(); flap() }}>
          <canvas ref={canvasRef} width={W} height={H} className="game-canvas" />
          {mode === 'ready' && (
            <div className="game-overlay"><div className="game-card">
              <h2>Ready?</h2><p>Tap anywhere to flap.</p><p className="muted small">Your best: {best}</p>
            </div></div>
          )}
          {mode === 'over' && (
            <div className="game-overlay"><div className="game-card">
              <h2>Game over</h2><p>Score: <strong>{score}</strong> · Best: {best}</p>
              <p className="muted small">Tap to play again</p>
            </div></div>
          )}
        </div>
        <Card className="leaderboard">
          <h2>🏆 Leaderboard</h2>
          {board.length === 0 ? <p className="muted small">No scores yet — be the first!</p> : (
            <ol className="board-list">
              {board.map((r, i) => (
                <li key={i}><span>{r.player_name}</span><strong>{r.score}</strong></li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  )
}
