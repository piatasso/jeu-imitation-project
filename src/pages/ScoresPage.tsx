import { Link } from 'react-router-dom';
import { useGame } from '../context/GameContext';

const BG = '#f5f0e8';
const CARD = '#ffffff';
const BORDER = 'rgba(0,0,0,0.08)';
const MUTED = '#78716c';
const TEXT = '#1c1917';

export function ScoresPage() {
  const { state } = useGame();
  const { currentUser, enqueteurScores, personaScores } = state;

  const sortedEnqueteurs = [...enqueteurScores].sort((a, b) => b.totalPoints - a.totalPoints);
  const sortedPersonas = [...personaScores].sort((a, b) => b.credibilityIndex - a.credibilityIndex);

  const userRank = sortedEnqueteurs.findIndex(s => s.userId === currentUser?.id) + 1;
  const userScore = sortedEnqueteurs.find(s => s.userId === currentUser?.id);

  return (
    <div
      className="min-h-screen"
      style={{ background: BG, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            to="/"
            className="text-sm transition-colors"
            style={{ color: MUTED }}
            onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
            onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
          >
            ← Retour
          </Link>
          <span style={{ color: MUTED }}>·</span>
          <h1 className="text-xl font-bold" style={{ color: TEXT }}>Classements</h1>
        </div>

        {/* Personal stats */}
        {userScore && (
          <div
            className="grid grid-cols-4 gap-px mb-8 rounded-2xl overflow-hidden"
            style={{ background: BORDER }}
          >
            {[
              { label: 'Classement', value: `#${userRank || '-'}`, color: '#d97706' },
              { label: 'Points totaux', value: String(userScore.totalPoints), color: TEXT },
              { label: 'Détections', value: `${userScore.correctDetections}/${userScore.totalSessions}`, color: '#0891b2' },
              { label: 'Fiabilité (Rᵢ)', value: `${userScore.reliabilityIndex.toFixed(0)}%`, color: '#db2777' },
            ].map(({ label, value, color }) => (
              <div key={label} className="px-6 py-5" style={{ background: CARD }}>
                <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
                <p className="text-xs mt-1" style={{ color: MUTED }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Rankings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Enquêteurs */}
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            <div className="px-6 py-4" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366f1' }}>
                Top Enquêteurs
              </p>
            </div>
            <div style={{ background: BG }}>
              {sortedEnqueteurs.length === 0 ? (
                <p className="px-6 py-8 text-sm" style={{ color: MUTED }}>Aucune session terminée</p>
              ) : (
                sortedEnqueteurs.slice(0, 10).map((score, index) => (
                  <div
                    key={score.userId}
                    className="flex items-center justify-between px-6 py-4"
                    style={{
                      background: score.userId === currentUser?.id ? 'rgba(99,102,241,0.06)' : 'transparent',
                      borderBottom: `1px solid ${BORDER}`,
                      borderLeft: score.userId === currentUser?.id ? '3px solid #6366f1' : '3px solid transparent',
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className="text-base font-bold w-8 tabular-nums"
                        style={{
                          color: index === 0 ? '#d97706' : index === 1 ? '#78716c' : index === 2 ? '#92400e' : MUTED,
                        }}
                      >
                        #{index + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium" style={{ color: TEXT }}>
                          {score.pseudo}
                          {score.userId === currentUser?.id && (
                            <span className="ml-2 text-xs" style={{ color: '#6366f1' }}>vous</span>
                          )}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                          {score.correctDetections}/{score.totalSessions} détections · Rᵢ {score.reliabilityIndex.toFixed(0)}%
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold tabular-nums" style={{ color: TEXT }}>{score.totalPoints} pts</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Personas */}
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            <div className="px-6 py-4" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#db2777' }}>
                Meilleurs Personnas
              </p>
            </div>
            <div style={{ background: BG }}>
              {sortedPersonas.length === 0 ? (
                <p className="px-6 py-8 text-sm" style={{ color: MUTED }}>Aucun personna évalué</p>
              ) : (
                sortedPersonas.slice(0, 10).map((score, index) => (
                  <div
                    key={score.personaId}
                    className="px-6 py-4"
                    style={{ borderBottom: `1px solid ${BORDER}` }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-4">
                        <span
                          className="text-base font-bold w-8 tabular-nums"
                          style={{
                            color: index === 0 ? '#db2777' : index === 1 ? '#78716c' : index === 2 ? '#92400e' : MUTED,
                          }}
                        >
                          #{index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium" style={{ color: '#db2777' }}>{score.personaName}</p>
                          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                            {score.totalSessions} sessions · {score.timesDetectedAsAI} détections IA
                          </p>
                        </div>
                      </div>
                      <span className="text-sm font-bold tabular-nums" style={{ color: '#0891b2' }}>
                        {score.credibilityIndex.toFixed(0)}%
                      </span>
                    </div>
                    <div className="ml-12 h-1.5 rounded-full overflow-hidden" style={{ background: BORDER }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${score.credibilityIndex}%`, background: '#0891b2' }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div
          className="rounded-2xl p-6"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: MUTED }}>Légende</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm" style={{ color: MUTED }}>
            <div className="space-y-1.5">
              <p><span style={{ color: '#d97706' }}>Points</span> — +2 par détection correcte, +1 bonus pour justification argumentée. Bonus créateur : +2 pts si votre IA déjoue 3 enquêteurs de suite.</p>
              <p><span style={{ color: '#0891b2' }}>Rᵢ (Fiabilité)</span> — % de détections correctes</p>
            </div>
            <div className="space-y-1.5">
              <p><span style={{ color: '#db2777' }}>IC (Crédibilité)</span> — % de fois où le personna n'a PAS été détecté comme IA</p>
              <p>Plus l'IC est élevé, plus le personna est crédible.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
