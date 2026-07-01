import { useState, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider, useGame } from './context/GameContext';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { LobbyPage } from './pages/LobbyPage';
import { PersonaPage } from './pages/PersonaPage';
import { PlayPage } from './pages/PlayPage';
import { ScoresPage } from './pages/ScoresPage';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { state } = useGame();
  if (!state.currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function TeacherRoute({ children }: { children: React.ReactNode }) {
  const { state } = useGame();
  if (!state.currentUser) return <Navigate to="/login" replace />;
  if (state.currentUser.role !== 'teacher' && state.currentUser.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { state } = useGame();
  return (
    <Routes>
      <Route path="/login" element={state.currentUser ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          {(state.currentUser?.role === 'teacher' || state.currentUser?.role === 'admin') ? <Navigate to="/dashboard" replace /> : <HomePage />}
        </ProtectedRoute>
      } />
      <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
      <Route path="/personas" element={<ProtectedRoute><PersonaPage /></ProtectedRoute>} />
      <Route path="/play" element={<ProtectedRoute><PlayPage /></ProtectedRoute>} />
      <Route path="/scores" element={<ProtectedRoute><ScoresPage /></ProtectedRoute>} />
      <Route path="/dashboard" element={<TeacherRoute><DashboardPage /></TeacherRoute>} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

type PodiumEntry = { rank: number; pseudo: string; points: number };

function PodiumOverlay({ podium, onClose }: { podium: PodiumEntry[]; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 30); return () => clearTimeout(t); }, []);

  const confettiPieces = useMemo(() => {
    const colors = ['#6366f1','#d97706','#fbbf24','#10b981','#f472b6','#0891b2','#a78bfa','#34d399','#fb923c','#e879f9'];
    return Array.from({ length: 90 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: colors[i % colors.length],
      w: 7 + Math.random() * 7,
      h: 5 + Math.random() * 9,
      delay: Math.random() * 5,
      dur: 2.8 + Math.random() * 3,
      isCircle: Math.random() > 0.6,
      drift: (Math.random() - 0.5) * 60,
    }));
  }, []);

  const ordered = [2, 1, 3].map(r => podium.find(p => p.rank === r)).filter(Boolean) as PodiumEntry[];
  const barHeights: Record<number, number> = { 1: 145, 2: 105, 3: 78 };
  const rankLabel: Record<number, string> = { 1: '1er', 2: '2e', 3: '3e' };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, overflow: 'hidden',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.5s ease',
    }}>
      <style>{`
        @keyframes confettiFall {
          0%   { opacity: 1;   transform: translateY(-30px)  rotate(0deg)   translateX(0px); }
          25%  {               transform: translateY(25vh)   rotate(200deg) translateX(var(--dx)); }
          50%  {               transform: translateY(55vh)   rotate(390deg) translateX(calc(var(--dx) * -0.6)); }
          75%  { opacity: 1;   transform: translateY(80vh)   rotate(560deg) translateX(var(--dx)); }
          100% { opacity: 0;   transform: translateY(115vh)  rotate(720deg) translateX(0px); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(60px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes popIn {
          0%   { transform: scale(0.4); opacity: 0; }
          55%  { transform: scale(1.12); opacity: 1; }
          75%  { transform: scale(0.96); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes goldGlow {
          0%, 100% { box-shadow: 0 -4px 24px rgba(217,119,6,0.45); filter: brightness(1); }
          50%       { box-shadow: 0 -4px 40px rgba(217,119,6,0.8);  filter: brightness(1.2); }
        }
        @keyframes starSpin {
          0%   { transform: scale(1)    rotate(0deg); }
          25%  { transform: scale(1.25) rotate(20deg); }
          50%  { transform: scale(1)    rotate(0deg); }
          75%  { transform: scale(1.15) rotate(-15deg); }
          100% { transform: scale(1)    rotate(0deg); }
        }
        @keyframes titlePop {
          0%   { opacity: 0; transform: scale(0.7) translateY(10px); }
          60%  { transform: scale(1.06) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {/* Confetti */}
      {visible && confettiPieces.map(c => (
        <div key={c.id} style={{
          position: 'fixed', top: 0,
          left: `${c.left}%`,
          width: c.w, height: c.isCircle ? c.w : c.h,
          borderRadius: c.isCircle ? '50%' : 2,
          background: c.color,
          pointerEvents: 'none',
          zIndex: 10000,
          ['--dx' as string]: `${c.drift}px`,
          animation: `confettiFall ${c.dur}s ${c.delay}s ease-in infinite`,
        }} />
      ))}

      {/* Card */}
      <div style={{
        background: 'linear-gradient(160deg, #faf7f2 0%, #ffffff 60%, #faf7f2 100%)',
        borderRadius: 28,
        padding: '2.5rem 2.5rem 2rem',
        maxWidth: 480, width: '100%', textAlign: 'center',
        boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
        animation: 'slideUp 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s both',
        fontFamily: 'Inter, system-ui, sans-serif',
        position: 'relative', zIndex: 10001,
      }}>
        <div style={{ fontSize: 36, lineHeight: 1, marginBottom: 10, display: 'inline-block', animation: 'starSpin 3s ease-in-out infinite', color: '#d97706' }}>
          ★
        </div>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: '#78716c', textTransform: 'uppercase', marginBottom: 8 }}>
          Session terminée
        </p>
        <h2 style={{
          fontSize: 30, fontWeight: 900, color: '#1c1917', marginBottom: 6,
          letterSpacing: '-0.03em', animation: 'titlePop 0.5s ease 0.25s both',
        }}>
          Bravo à tous !
        </h2>
        <p style={{ fontSize: 13, color: '#78716c', marginBottom: 44 }}>
          Voici le classement final de votre classe.
        </p>

        {ordered.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16, marginBottom: 44 }}>
            {ordered.map((p, i) => (
              <div key={p.rank} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                animation: `popIn 0.55s cubic-bezier(0.34,1.56,0.64,1) ${0.35 + i * 0.14}s both`,
              }}>
                <p style={{
                  fontWeight: 800, fontSize: p.rank === 1 ? 15 : 13, color: '#1c1917',
                  maxWidth: 95, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {p.pseudo}
                </p>
                <p style={{ fontSize: 12, fontWeight: 700, color: p.rank === 1 ? '#d97706' : '#78716c' }}>
                  {p.points} pts
                </p>
                <div style={{
                  width: p.rank === 1 ? 92 : 74,
                  height: barHeights[p.rank],
                  background: p.rank === 1
                    ? 'linear-gradient(180deg, #fbbf24 0%, #d97706 100%)'
                    : p.rank === 2
                      ? 'linear-gradient(180deg, #cbd5e1 0%, #94a3b8 100%)'
                      : 'linear-gradient(180deg, #d4a574 0%, #b45309 100%)',
                  borderRadius: '10px 10px 0 0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 900,
                  fontSize: p.rank === 1 ? 22 : 17,
                  animation: p.rank === 1 ? 'goldGlow 2s ease-in-out 1s infinite' : undefined,
                }}>
                  {rankLabel[p.rank]}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#78716c', marginBottom: 44, fontSize: 14 }}>Aucun score enregistré.</p>
        )}

        <button
          onClick={onClose}
          style={{
            background: '#1c1917', color: 'white', border: 'none',
            borderRadius: 14, padding: '12px 44px',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: '0.02em',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#374151')}
          onMouseLeave={e => (e.currentTarget.style.background = '#1c1917')}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

function ClassStatusWatcher() {
  const { state } = useGame();
  const [podium, setPodium] = useState<PodiumEntry[] | null>(null);
  const [podiumDismissed, setPodiumDismissed] = useState(false);

  const classId = state.currentUser?.classId;
  const isStudent = state.currentUser?.role === 'student';

  useEffect(() => {
    if (!isStudent || !classId) return;

    const check = async () => {
      try {
        const res = await fetch('/api/relay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check-class-status', classId }),
        });
        const data = await res.json() as { closed: boolean; podium?: PodiumEntry[] };
        if (data.closed) {
          setPodium(data.podium ?? []);
          localStorage.setItem(`classClosed_${classId}`, '1');
        }
      } catch {}
    };

    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [isStudent, classId]);

  if (!podium) return null;
  if (!podiumDismissed) return <PodiumOverlay podium={podium} onClose={() => setPodiumDismissed(true)} />;
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <GameProvider>
        <div className="crt-effect">
          <AppRoutes />
        </div>
        <ClassStatusWatcher />
      </GameProvider>
    </BrowserRouter>
  );
}

export default App;
