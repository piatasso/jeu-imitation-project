import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import type { Persona } from '../types';

const BG = '#faf7f2';
const CARD = '#ffffff';
const PANEL = '#f5f0e8';
const BORDER = 'rgba(0,0,0,0.08)';
const MUTED = '#78716c';
const SUBTLE = '#a8a29e';
const TEXT = '#1c1917';
const ACCENT = '#6366f1';
const PINK = '#db2777';

type DetailPanel = 'sessions' | 'personas' | 'points' | 'reliability' | null;

export function HomePage() {
  const { state, logout, dispatch } = useGame();
  const { currentUser, personas, sessions, votes, enqueteurScores, knownUsers } = state;

  const [panel, setPanel] = useState<DetailPanel>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', age: '', description: '', traits: '', interests: '', speakingStyle: '',
  });

  const sortedEnqueteurs = [...enqueteurScores].sort((a, b) => b.totalPoints - a.totalPoints);
  const userRank = sortedEnqueteurs.findIndex(s => s.userId === currentUser?.id) + 1;
  const userScore = enqueteurScores.find(s => s.userId === currentUser?.id);
  const studentNeedsPersona =
    currentUser?.role === 'student' &&
    !personas.some(p => p.createdBy === currentUser?.id);

  // Per-user counts — match by pseudo to handle multiple login UUIDs
  const myPseudo = currentUser?.pseudo.toLowerCase();
  const sameNameIds = new Set(
    knownUsers.filter(u => u.pseudo.toLowerCase() === myPseudo).map(u => u.id)
  );
  const myPersonas = personas.filter(p => sameNameIds.has(p.createdBy));
  const mySessions = sessions
    .filter(s => s.status === 'completed' && s.enqueteurId === currentUser?.id)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  const myVotes = votes.filter(v => v.enqueteurId === currentUser?.id);

  const togglePanel = (p: DetailPanel) => {
    setPanel(prev => prev === p ? null : p);
    setEditingId(null);
  };

  const startEdit = (p: Persona) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name, age: String(p.age), description: p.description,
      traits: p.traits.join(', '), interests: p.interests.join(', '), speakingStyle: p.speakingStyle,
    });
  };

  const saveEdit = (p: Persona) => {
    dispatch({
      type: 'UPDATE_PERSONA',
      payload: {
        ...p,
        name: editForm.name.trim(),
        age: parseInt(editForm.age) || p.age,
        description: editForm.description.trim(),
        traits: editForm.traits.split(',').map(t => t.trim()).filter(Boolean),
        interests: editForm.interests.split(',').map(i => i.trim()).filter(Boolean),
        speakingStyle: editForm.speakingStyle.trim(),
      },
    });
    setEditingId(null);
  };

  const deletePersona = (id: string) => {
    if (confirm('Supprimer ce persona ?')) dispatch({ type: 'DELETE_PERSONA', payload: id });
  };

  return (
    <div className="min-h-screen" style={{ background: BG, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-10 flex justify-between items-center px-8 py-5"
        style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="flex items-baseline gap-4">
          <span className="text-2xl font-bold tracking-tight" style={{ color: TEXT }}>Jeu de l'Imitation</span>
          <span className="text-sm" style={{ color: MUTED }}>
            {currentUser?.pseudo}
            {currentUser?.classId && (
              <><span className="mx-2" style={{ color: SUBTLE }}>·</span>{currentUser.classId}</>
            )}
          </span>
        </div>
        <button
          onClick={logout}
          className="text-sm transition-colors px-3 py-1.5 rounded-lg"
          style={{ color: MUTED, border: `1px solid ${BORDER}` }}
          onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
          onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
        >
          Se déconnecter
        </button>
      </header>

      {/* ── Scrollable content ── */}
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* ── Personal stats (3 clickable, 1 display) ── */}
        <div className="grid grid-cols-4 gap-px rounded-2xl overflow-hidden" style={{ background: BORDER }}>

          {/* Sessions — clickable */}
          <button
            onClick={() => togglePanel('sessions')}
            className="px-6 py-5 text-left transition-colors"
            style={{ background: panel === 'sessions' ? '#f0f0ff' : CARD, borderTop: panel === 'sessions' ? `3px solid ${ACCENT}` : '3px solid transparent' }}
          >
            <p className="text-3xl font-bold tabular-nums" style={{ color: panel === 'sessions' ? ACCENT : TEXT }}>{mySessions.length}</p>
            <p className="text-sm mt-1 font-semibold" style={{ color: panel === 'sessions' ? ACCENT : MUTED }}>Mes sessions</p>
            <p className="text-xs mt-0.5" style={{ color: SUBTLE }}>voir l'historique ↓</p>
          </button>

          {/* Personas — clickable */}
          <button
            onClick={() => togglePanel('personas')}
            className="px-6 py-5 text-left transition-colors"
            style={{ background: panel === 'personas' ? '#fff0f8' : CARD, borderTop: panel === 'personas' ? `3px solid ${PINK}` : '3px solid transparent' }}
          >
            <p className="text-3xl font-bold tabular-nums" style={{ color: panel === 'personas' ? PINK : TEXT }}>{myPersonas.length}</p>
            <p className="text-sm mt-1 font-semibold" style={{ color: panel === 'personas' ? PINK : MUTED }}>Mes personas</p>
            <p className="text-xs mt-0.5" style={{ color: SUBTLE }}>voir et modifier ↓</p>
          </button>

          {/* Mes points — clickable */}
          <button
            onClick={() => togglePanel('points')}
            className="px-6 py-5 text-left transition-colors"
            style={{ background: panel === 'points' ? '#f0f0ff' : '#f0f0ff', borderTop: panel === 'points' ? `3px solid ${ACCENT}` : `3px solid ${ACCENT}` }}
          >
            <p className="text-3xl font-bold tabular-nums" style={{ color: ACCENT }}>{userScore?.totalPoints ?? 0}</p>
            <p className="text-sm mt-1 font-semibold" style={{ color: ACCENT }}>Mes points</p>
            <p className="text-xs mt-0.5" style={{ color: SUBTLE }}>voir le détail ↓</p>
          </button>

          {/* Fiabilité — clickable */}
          <button
            onClick={() => togglePanel('reliability')}
            className="px-6 py-5 text-left transition-colors"
            style={{ background: panel === 'reliability' ? '#f0fdf4' : CARD, borderTop: panel === 'reliability' ? '3px solid #10b981' : '3px solid transparent' }}
          >
            <p className="text-3xl font-bold tabular-nums" style={{ color: panel === 'reliability' ? '#10b981' : TEXT }}>
              {userScore?.reliabilityIndex.toFixed(0) ?? 0}%
            </p>
            <p className="text-sm mt-1 font-semibold" style={{ color: panel === 'reliability' ? '#10b981' : MUTED }}>Fiabilité</p>
            <p className="text-xs mt-0.5" style={{ color: SUBTLE }}>{userRank > 0 ? `#${userRank} au classement` : 'qu\'est-ce ?'} ↓</p>
          </button>
        </div>

        {/* ── Detail panels ── */}

        {/* Sessions history */}
        {panel === 'sessions' && (
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            <div className="px-6 py-4" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: ACCENT }}>Historique des parties</p>
            </div>
            {mySessions.length === 0 ? (
              <p className="px-6 py-8 text-sm" style={{ color: MUTED, background: CARD }}>
                Vous n'avez encore joué aucune partie.
              </p>
            ) : (
              mySessions.map(s => {
                const vote = votes.find(v => v.sessionId === s.id);
                const pA = personas.find(p => p.id === s.personaIdA);
                const pB = personas.find(p => p.id === s.personaIdB);
                const isSolo = s.aiIsInChat === 'both';
                const isCorrect = vote?.isCorrect ?? false;
                const pts = vote ? (isCorrect ? 2 + (vote.justification.length > 50 ? 1 : 0) : 0) : null;
                const dateStr = new Date(s.startTime).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-6 py-4"
                    style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                        style={{
                          background: isCorrect ? 'rgba(16,185,129,0.1)' : vote ? 'rgba(239,68,68,0.1)' : PANEL,
                          color: isCorrect ? '#10b981' : vote ? '#ef4444' : MUTED,
                        }}
                      >
                        {vote ? (isCorrect ? '✓' : '✗') : '—'}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: TEXT }}>
                          {isSolo
                            ? `${pA?.name ?? '?'} vs ${pB?.name ?? '?'}`
                            : `IA : ${s.aiIsInChat === 'A' ? pA?.name : pB?.name ?? '?'}`}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                          {dateStr} · {isSolo ? 'Solo' : 'Multi'}
                          {vote?.justification && vote.justification.length > 50 && (
                            <span style={{ color: ACCENT }}> · justification +1</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <span
                      className="text-sm font-bold tabular-nums"
                      style={{ color: pts === null ? SUBTLE : pts > 0 ? '#10b981' : MUTED }}
                    >
                      {pts === null ? '—' : pts > 0 ? `+${pts} pts` : '0 pt'}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Personas list + edit */}
        {panel === 'personas' && (
          <div className="space-y-3">
            {/* What is a persona? */}
            <div className="rounded-2xl px-5 py-4" style={{ background: `${PINK}10`, border: `1px solid ${PINK}30` }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: PINK }}>C'est quoi un persona IA ?</p>
              <p className="text-sm" style={{ color: TEXT }}>Un persona IA est une identité fictive donnée à un modèle d'intelligence artificielle — un nom, une personnalité, un style de communication. L'IA adopte ce rôle et répond comme si elle était ce personnage.</p>
            </div>
            {myPersonas.length === 0 ? (
              <div className="rounded-2xl px-6 py-8 text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-sm mb-4" style={{ color: MUTED }}>Vous n'avez encore créé aucun persona.</p>
                <Link to="/personas" className="text-sm font-medium px-4 py-2 rounded-xl text-white" style={{ background: PINK }}>
                  Créer un persona
                </Link>
              </div>
            ) : (
              myPersonas.map(p => (
                <div key={p.id} className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  {editingId === p.id ? (
                    <div className="p-6 space-y-4">
                      <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: PINK }}>Modifier le persona</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Prénom</label>
                          <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                            style={{ background: PANEL, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Âge</label>
                          <input type="number" value={editForm.age} onChange={e => setEditForm(f => ({ ...f, age: e.target.value }))}
                            min={14} max={19}
                            className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                            style={{ background: PANEL, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Description</label>
                        <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                          rows={3}
                          className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                          style={{ background: PANEL, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Traits (séparés par des virgules)</label>
                        <input value={editForm.traits} onChange={e => setEditForm(f => ({ ...f, traits: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                          style={{ background: PANEL, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Centres d'intérêt (séparés par des virgules)</label>
                        <input value={editForm.interests} onChange={e => setEditForm(f => ({ ...f, interests: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                          style={{ background: PANEL, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Style d'écriture</label>
                        <textarea value={editForm.speakingStyle} onChange={e => setEditForm(f => ({ ...f, speakingStyle: e.target.value }))}
                          rows={2}
                          className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                          style={{ background: PANEL, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => saveEdit(p)}
                          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                          style={{ background: PINK }}
                        >
                          Enregistrer
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-4 py-2.5 rounded-xl text-sm font-medium"
                          style={{ background: PANEL, color: MUTED }}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 mr-4">
                          <p className="text-base font-bold" style={{ color: PINK }}>{p.name}, {p.age} ans</p>
                          <p className="text-sm mt-1 leading-relaxed" style={{ color: MUTED }}>{p.description}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => startEdit(p)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium"
                            style={{ background: '#f0f0ff', color: ACCENT }}
                          >
                            Modifier
                          </button>
                          <button
                            onClick={() => deletePersona(p.id)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium"
                            style={{ background: '#fee2e2', color: '#ef4444' }}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                      {p.traits.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {p.traits.map(t => (
                            <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#f0f0ff', color: ACCENT }}>{t}</span>
                          ))}
                        </div>
                      )}
                      {p.interests.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {p.interests.map(i => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: PANEL, color: MUTED }}>{i}</span>
                          ))}
                        </div>
                      )}
                      {p.speakingStyle && (
                        <p className="text-xs italic" style={{ color: SUBTLE }}>"{p.speakingStyle}"</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
            {myPersonas.length > 0 && (
              <Link
                to="/personas"
                className="block text-center text-sm font-medium py-3 rounded-xl transition-colors"
                style={{ background: CARD, color: MUTED, border: `1px solid ${BORDER}` }}
                onMouseEnter={e => (e.currentTarget.style.background = PANEL)}
                onMouseLeave={e => (e.currentTarget.style.background = CARD)}
              >
                Créer un nouveau persona →
              </Link>
            )}
          </div>
        )}

        {/* Points breakdown */}
        {panel === 'points' && (
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-px" style={{ background: BORDER }}>
              <div className="px-6 py-5" style={{ background: CARD }}>
                <p className="text-2xl font-bold" style={{ color: '#10b981' }}>
                  {userScore?.correctDetections ?? 0} × +2
                </p>
                <p className="text-xs mt-1" style={{ color: MUTED }}>Détections correctes</p>
              </div>
              <div className="px-6 py-5" style={{ background: CARD }}>
                <p className="text-2xl font-bold" style={{ color: ACCENT }}>
                  {userScore?.bonusPoints ?? 0} × +1
                </p>
                <p className="text-xs mt-1" style={{ color: MUTED }}>Bonus justification</p>
              </div>
              <div className="px-6 py-5" style={{ background: CARD }}>
                <p className="text-2xl font-bold" style={{ color: '#d97706' }}>
                  +{userScore?.creatorBonusPoints ?? 0} pts
                </p>
                <p className="text-xs mt-1" style={{ color: MUTED }}>Bonus créateur</p>
              </div>
            </div>
            {/* Per-vote list */}
            {myVotes.length === 0 ? (
              <p className="px-6 py-8 text-sm" style={{ color: MUTED, background: CARD }}>
                Aucun vote enregistré pour l'instant.
              </p>
            ) : (
              <div>
                <div className="px-6 py-3" style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>Détail par partie</p>
                </div>
                {myVotes.slice().reverse().map((v, i) => {
                  const session = sessions.find(s => s.id === v.sessionId);
                  const hasJustifBonus = v.isCorrect && v.justification.length > 50;
                  const pts = v.isCorrect ? 2 + (hasJustifBonus ? 1 : 0) : 0;
                  const dateStr = new Date(v.timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                  return (
                    <div
                      key={v.id}
                      className="flex items-center justify-between px-6 py-3"
                      style={{ background: i % 2 === 0 ? CARD : BG, borderBottom: `1px solid ${BORDER}` }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold" style={{ color: v.isCorrect ? '#10b981' : '#ef4444' }}>
                          {v.isCorrect ? '✓' : '✗'}
                        </span>
                        <div>
                          <p className="text-xs font-medium" style={{ color: TEXT }}>
                            {v.isCorrect ? 'Bonne détection' : 'Mauvaise détection'}
                            {hasJustifBonus && <span style={{ color: ACCENT }}> + justification</span>}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                            {dateStr}{session ? ` · ${session.gameMode === 'solo' ? 'Solo' : 'Multi'}` : ''}
                          </p>
                          {v.justification && (
                            <p className="text-xs mt-0.5 italic truncate max-w-xs" style={{ color: SUBTLE }}>
                              "{v.justification}"
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className="text-sm font-bold tabular-nums"
                        style={{ color: pts > 0 ? '#10b981' : MUTED }}
                      >
                        {pts > 0 ? `+${pts}` : '0'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Reliability explanation */}
        {panel === 'reliability' && (
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            <div className="px-6 py-5" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#10b981' }}>Indice de fiabilité</p>
              <p className="text-sm leading-relaxed" style={{ color: MUTED }}>
                C'est votre taux de réussite brut : le pourcentage de parties où vous avez correctement identifié quelle conversation était menée par l'IA.
              </p>
            </div>
            {/* Formula */}
            <div className="px-6 py-5" style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
              <p className="text-xs font-semibold mb-3" style={{ color: MUTED }}>Formule</p>
              <div className="flex items-center gap-3 text-sm font-mono">
                <span className="px-3 py-1.5 rounded-lg font-bold" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>Fiabilité %</span>
                <span style={{ color: SUBTLE }}>=</span>
                <span style={{ color: TEXT }}>
                  (détections correctes ÷ parties jouées) × 100
                </span>
              </div>
            </div>
            {/* Your numbers */}
            <div className="grid grid-cols-3 gap-px" style={{ background: BORDER }}>
              <div className="px-6 py-5" style={{ background: CARD }}>
                <p className="text-2xl font-bold tabular-nums" style={{ color: TEXT }}>{userScore?.correctDetections ?? 0}</p>
                <p className="text-xs mt-1" style={{ color: MUTED }}>Détections correctes</p>
              </div>
              <div className="px-6 py-5" style={{ background: CARD }}>
                <p className="text-2xl font-bold tabular-nums" style={{ color: TEXT }}>{userScore?.totalSessions ?? 0}</p>
                <p className="text-xs mt-1" style={{ color: MUTED }}>Parties jouées</p>
              </div>
              <div className="px-6 py-5" style={{ background: '#f0fdf4' }}>
                <p className="text-2xl font-bold tabular-nums" style={{ color: '#10b981' }}>{userScore?.reliabilityIndex.toFixed(0) ?? 0}%</p>
                <p className="text-xs mt-1" style={{ color: MUTED }}>Votre fiabilité</p>
              </div>
            </div>
            {/* Context */}
            <div className="px-6 py-4" style={{ background: CARD }}>
              <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                Ce score n'est pas lié aux points — il mesure votre capacité à détecter l'IA indépendamment de la qualité de vos justifications ou des bonus créateur. Un score de 100 % signifie que vous avez toujours trouvé la bonne réponse.
                {userRank > 0 && <span> Votre rang actuel au classement général est <strong style={{ color: TEXT }}>#{userRank}</strong>.</span>}
              </p>
            </div>
          </div>
        )}

        {/* ── Step cards ── */}
        <div className="grid grid-cols-2 gap-4">
          <StepCard
            step="01"
            title="Créer un persona"
            description="Construis un persona fictif de lycéen — nom, traits, centres d'intérêt, façon de parler. L'IA l'incarnera pendant le jeu."
            to="/personas"
            accent="#ec4899"
            cta={studentNeedsPersona ? 'Commencer' : 'Voir les personas'}
            urgent={studentNeedsPersona}
          />
          <StepCard
            step="02"
            title="Jouer"
            description="Interrogez deux interlocuteurs pendant 5 minutes. L'un est humain, l'autre est une IA. Identifiez-la et justifiez votre réponse."
            to="/play"
            accent={ACCENT}
            cta="Lancer une partie"
            urgent={false}
          />
        </div>

        {/* ── Scoring system ── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>
            Système de points
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                pts: '+2 pts',
                label: 'Bonne détection',
                desc: "Identifiez correctement lequel des deux interlocuteurs est l'IA.",
                color: '#10b981',
              },
              {
                pts: '+1 pt',
                label: 'Justification argumentée',
                desc: 'Rédigez une justification de plus de 50 caractères après votre vote.',
                color: ACCENT,
              },
              {
                pts: '+2 bonus',
                label: 'Bonus créateur',
                desc: "Votre persona convainc 3 enquêteurs de suite qu'il est humain.",
                color: '#d97706',
              },
            ].map(item => (
              <div key={item.label} className="rounded-2xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-2xl font-bold mb-2" style={{ color: item.color }}>{item.pts}</p>
                <p className="text-sm font-semibold mb-1" style={{ color: TEXT }}>{item.label}</p>
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Leaderboard ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: ACCENT }}>Classement</p>
            <Link
              to="/scores"
              className="text-xs font-medium transition-colors"
              style={{ color: MUTED }}
              onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
              onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
            >
              Voir tout →
            </Link>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            {sortedEnqueteurs.length === 0 ? (
              <p className="px-6 py-8 text-sm" style={{ color: MUTED, background: CARD }}>
                Aucune session terminée pour l'instant.
              </p>
            ) : (
              <div>
                {sortedEnqueteurs.slice(0, 10).map((s, i) => (
                  <div
                    key={s.userId}
                    className="flex items-center justify-between px-6 py-4"
                    style={{
                      background: s.userId === currentUser?.id ? 'rgba(99,102,241,0.06)' : CARD,
                      borderBottom: `1px solid ${BORDER}`,
                      borderLeft: s.userId === currentUser?.id ? `3px solid ${ACCENT}` : '3px solid transparent',
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold w-8 tabular-nums"
                        style={{ color: i === 0 ? '#d97706' : i === 1 ? '#78716c' : i === 2 ? '#92400e' : MUTED }}
                      >#{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium" style={{ color: TEXT }}>
                          {s.pseudo}
                          {s.userId === currentUser?.id && (
                            <span className="ml-2 text-xs" style={{ color: ACCENT }}>vous</span>
                          )}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                          {s.correctDetections}/{s.totalSessions} détections · {s.reliabilityIndex.toFixed(0)}% fiabilité
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-bold tabular-nums" style={{ color: TEXT }}>{s.totalPoints} pts</span>
                  </div>
                ))}
                {userRank > 10 && userScore && (
                  <>
                    <div className="px-6 py-2 text-center" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
                      <span className="text-xs" style={{ color: MUTED }}>···</span>
                    </div>
                    <div
                      className="flex items-center justify-between px-6 py-4"
                      style={{ background: 'rgba(99,102,241,0.06)', borderLeft: `3px solid ${ACCENT}` }}
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold w-8 tabular-nums" style={{ color: MUTED }}>#{userRank}</span>
                        <p className="text-sm font-medium" style={{ color: TEXT }}>
                          {userScore.pseudo} <span className="ml-2 text-xs" style={{ color: ACCENT }}>vous</span>
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums" style={{ color: TEXT }}>{userScore.totalPoints} pts</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {currentUser?.role === 'teacher' && (
          <Link
            to="/dashboard"
            className="flex items-center justify-between px-8 py-6 rounded-2xl group transition-colors"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}
            onMouseEnter={e => (e.currentTarget.style.background = PANEL)}
            onMouseLeave={e => (e.currentTarget.style.background = CARD)}
          >
            <div>
              <p className="text-base font-bold" style={{ color: TEXT }}>Tableau de bord</p>
              <p className="text-xs mt-1" style={{ color: MUTED }}>Gérez les sessions</p>
            </div>
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" style={{ color: MUTED }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}

        <p className="text-xs pb-4" style={{ color: SUBTLE }}>Test de Turing — Projet pédagogique</p>

      </main>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StepCard({ step, title, description, to, accent, cta, urgent }: {
  step: string; title: string; description: string;
  to: string; accent: string; cta: string; urgent: boolean;
}) {
  return (
    <Link to={to} className="block group rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
      <div
        className="flex justify-between items-stretch transition-all min-h-[180px]"
        style={{ background: BG, borderLeft: `3px solid ${urgent ? accent : 'transparent'}` }}
        onMouseEnter={e => (e.currentTarget.style.borderLeftColor = accent)}
        onMouseLeave={e => (e.currentTarget.style.borderLeftColor = urgent ? accent : 'transparent')}
      >
        <div className="flex flex-col justify-between p-8 flex-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: accent }}>Étape {step}</p>
            <h2 className="text-xl font-bold leading-tight mb-3" style={{ color: TEXT }}>{title}</h2>
            <p className="text-sm leading-relaxed" style={{ color: MUTED }}>{description}</p>
          </div>
          <div className="mt-6">
            <span
              className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full"
              style={{ background: `${accent}15`, color: accent }}
            >
              {cta}
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
        <div className="flex items-center justify-center pr-8 select-none">
          <span className="font-bold tabular-nums leading-none" style={{ fontSize: '6rem', color: `${accent}18` }}>{step}</span>
        </div>
      </div>
    </Link>
  );
}
