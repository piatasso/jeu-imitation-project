import { useState, useRef, useEffect } from 'react';
import type { FormEvent, CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { v4 as uuidv4 } from 'uuid';
import type { Persona } from '../types';

const PERSONA_CHAT_URL = import.meta.env.PROD
  ? '/api/persona-chat'
  : (import.meta.env.VITE_API_URL?.replace('/chat', '/persona-chat') || '/api/persona-chat');

const BG = '#faf7f2';
const CARD = '#ffffff';
const PANEL = '#f5f0e8';
const BORDER = 'rgba(0,0,0,0.08)';
const TEXT = '#1c1917';
const MUTED = '#78716c';
const ACCENT = '#6366f1';
const PINK = '#db2777';

// ─── Feedback types ─────────────────────────────────────────────────────────

interface PersonaFeedback {
  justification: string;
  wasDetected: boolean;
  timestamp: string;
}

// ─── Chatbot helpers ────────────────────────────────────────────────────────

interface ConversationMessage {
  id: string;
  content: string;
  isFromUser: boolean;
}

const OPENING_MESSAGE =
  "Salut ! Je suis là pour t'aider à créer un persona fictif pour le Jeu de l'Imitation. " +
  "Ce persona sera joué par une IA, et les autres élèves devront deviner si c'est une IA ou un humain — " +
  "donc plus il est réaliste, mieux c'est ! " +
  "Pour commencer : comment s'appelle ton persona ?";

// ─── Manual form helpers ────────────────────────────────────────────────────

const TRAIT_SUGGESTIONS = [
  'timide', 'extraverti', 'curieux', 'réservé', 'bavard',
  'sportif', 'créatif', 'studieux', 'rêveur', 'pragmatique',
  'optimiste', 'réaliste', 'enthousiaste', 'calme', 'énergique',
];

const INTEREST_SUGGESTIONS = [
  'jeux vidéo', 'musique', 'lecture', 'sport', 'cinéma',
  'séries', 'dessin', 'photographie', 'cuisine', 'mode',
  'sciences', 'histoire', 'voyages', 'animaux', 'technologie',
  'manga', 'danse', 'théâtre', 'écriture', 'jardinage',
];

const STYLE_SUGGESTIONS = [
  'utilise beaucoup de "genre" et "trop"',
  'parle avec des abréviations (mdr, tkt, stp...)',
  'pose souvent des questions en retour',
  'utilise peu d\'émojis',
  'fait des phrases courtes',
  'utilise un vocabulaire soutenu',
  'hésite souvent (euh, hm, ben...)',
  'change parfois de sujet',
];

// ─── Main component ──────────────────────────────────────────────────────────

type Tab = 'chatbot' | 'manual' | 'list';

export function PersonaPage() {
  const { state, createPersona, dispatch } = useGame();
  const { currentUser, personas, knownUsers } = state;

  const [tab, setTab] = useState<Tab>('chatbot');
  const [listSubTab, setListSubTab] = useState<'mine' | 'classmates'>('mine');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; age: string; description: string; traits: string; interests: string; speakingStyle: string }>({ name: '', age: '', description: '', traits: '', interests: '', speakingStyle: '' });
  const [personaFeedback, setPersonaFeedback] = useState<Record<string, PersonaFeedback[]>>({});

  // Match by pseudo so personas stay visible even if the user logged in under a different UUID
  const myPseudo = currentUser?.pseudo.toLowerCase();
  const sameNameIds = new Set(
    knownUsers.filter(u => u.pseudo.toLowerCase() === myPseudo).map(u => u.id)
  );
  const myPersonas = personas.filter(p => sameNameIds.has(p.createdBy));
  const classmatesPersonas = personas.filter(p => !sameNameIds.has(p.createdBy));

  const deletePersona = (id: string) => {
    if (confirm('Supprimer ce persona ?')) {
      dispatch({ type: 'DELETE_PERSONA', payload: id });
    }
  };

  const startEdit = (p: Persona) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, age: String(p.age), description: p.description, traits: p.traits.join(', '), interests: p.interests.join(', '), speakingStyle: p.speakingStyle });
  };

  const saveEdit = (p: Persona) => {
    dispatch({ type: 'UPDATE_PERSONA', payload: { ...p, name: editForm.name.trim(), age: parseInt(editForm.age) || p.age, description: editForm.description.trim(), traits: editForm.traits.split(',').map(t => t.trim()).filter(Boolean), interests: editForm.interests.split(',').map(i => i.trim()).filter(Boolean), speakingStyle: editForm.speakingStyle.trim() } });
    setEditingId(null);
  };

  const myPersonaIdsKey = myPersonas.map(p => p.id).join(',');
  useEffect(() => {
    if (!myPersonaIdsKey) return;
    myPersonas.forEach(p => {
      fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-persona-feedback', personaId: p.id }),
      })
        .then(r => r.json())
        .then((data: { feedback?: PersonaFeedback[] }) => {
          setPersonaFeedback(prev => ({ ...prev, [p.id]: data.feedback || [] }));
        })
        .catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPersonaIdsKey]);

  const MAX_PERSONAS = 1;
  const atLimit = myPersonas.length >= MAX_PERSONAS;

  const TABS = [
    { id: 'chatbot' as Tab, label: atLimit ? 'Améliorer' : 'Chatbot' },
    { id: 'manual' as Tab, label: 'Formulaire' },
    { id: 'list' as Tab, label: `Personas (${personas.length})` },
  ];

  return (
    <div
      className="min-h-screen"
      style={{ background: BG, fontFamily: 'Inter, system-ui, sans-serif', color: TEXT }}
    >
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
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
          <h1 className="text-xl font-bold" style={{ color: TEXT }}>Création de persona</h1>
        </div>

        {/* Limit banner */}
        {atLimit && (
          <div className="mb-5 px-4 py-3 rounded-xl text-sm" style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #fde047' }}>
            Tu as déjà un persona. Utilise l'onglet "Améliorer" pour le modifier avec le chatbot, ou supprime-le pour en créer un nouveau.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit" style={{ background: PANEL }}>
          {TABS.map(t => {
            const disabled = t.id === 'manual' && atLimit;
            return (
              <button
                key={t.id}
                onClick={() => !disabled && setTab(t.id)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: tab === t.id ? CARD : 'transparent',
                  color: disabled ? MUTED : tab === t.id ? TEXT : MUTED,
                  boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  opacity: disabled ? 0.4 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'chatbot' && (
          <ChatbotCreator
            classId={currentUser?.classId || 'default'}
            onSaved={() => setTab('list')}
            createPersona={createPersona}
            existingPersona={atLimit && myPersonas.length > 0 ? myPersonas[0] : undefined}
          />
        )}

        {tab === 'manual' && (
          <ManualCreator
            classId={currentUser?.classId || 'default'}
            onSaved={() => setTab('list')}
            createPersona={createPersona}
          />
        )}

        {tab === 'list' && (
          <div>
            {/* Sub-tabs */}
            <div className="flex gap-1 p-1 rounded-xl mb-5 w-fit" style={{ background: PANEL }}>
              {([
                { id: 'mine' as const, label: `Mes personas (${myPersonas.length})` },
                { id: 'classmates' as const, label: `Camarades (${classmatesPersonas.length})` },
              ]).map(st => (
                <button
                  key={st.id}
                  onClick={() => setListSubTab(st.id)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: listSubTab === st.id ? CARD : 'transparent',
                    color: listSubTab === st.id ? TEXT : MUTED,
                    boxShadow: listSubTab === st.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {listSubTab === 'mine' && (
              myPersonas.length === 0 ? (
                <div className="rounded-2xl p-12 text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <p className="text-sm font-medium mb-2" style={{ color: TEXT }}>Aucun persona créé</p>
                  <p className="text-sm mb-5" style={{ color: MUTED }}>Utilise le chatbot ou le formulaire pour commencer.</p>
                  <button onClick={() => setTab('chatbot')} className="px-5 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: ACCENT }}>
                    Créer un persona
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {myPersonas.map(persona => (
                    <PersonaCard
                      key={persona.id}
                      persona={persona}
                      onDelete={() => deletePersona(persona.id)}
                      onEdit={() => startEdit(persona)}
                      isEditing={editingId === persona.id}
                      editForm={editForm}
                      onEditFormChange={f => setEditForm(prev => ({ ...prev, ...f }))}
                      onSaveEdit={() => saveEdit(persona)}
                      onCancelEdit={() => setEditingId(null)}
                      feedback={personaFeedback[persona.id]}
                    />
                  ))}
                </div>
              )
            )}

            {listSubTab === 'classmates' && (
              classmatesPersonas.length === 0 ? (
                <div className="rounded-2xl p-8 text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <p className="text-sm" style={{ color: MUTED }}>Aucun persona créé par tes camarades pour l'instant.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {classmatesPersonas.map(persona => (
                    <PersonaCard key={persona.id} persona={persona} />
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Chatbot creator ──────────────────────────────────────────────────────────

function buildEditOpeningMsg(p: Persona): string {
  const traitsStr = p.traits.length > 0 ? ` Traits : ${p.traits.join(', ')}.` : '';
  const interestsStr = p.interests.length > 0 ? ` Intérêts : ${p.interests.join(', ')}.` : '';
  const styleStr = p.speakingStyle ? ` Style d'expression : ${p.speakingStyle}.` : '';
  return `Ton persona actuel s'appelle ${p.name}, ${p.age} ans. ${p.description}${traitsStr}${interestsStr}${styleStr}\n\nQu'est-ce que tu voudrais améliorer ou changer ?`;
}

function ChatbotCreator({
  classId,
  onSaved,
  createPersona,
  existingPersona,
}: {
  classId: string;
  onSaved: () => void;
  createPersona: (p: Omit<Persona, 'id' | 'createdAt' | 'createdBy'>) => void;
  existingPersona?: Persona;
}) {
  const { dispatch } = useGame();
  const openingMessage = existingPersona ? buildEditOpeningMsg(existingPersona) : OPENING_MESSAGE;
  const [messages, setMessages] = useState<ConversationMessage[]>([
    { id: uuidv4(), content: openingMessage, isFromUser: false },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [canFinish, setCanFinish] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extracted, setExtracted] = useState<Omit<Persona, 'id' | 'createdAt' | 'createdBy' | 'classId'> | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, isLoading]);

  const userMessageCount = messages.filter(m => m.isFromUser).length;
  useEffect(() => {
    if (userMessageCount >= 5 && !canFinish) setCanFinish(true);
  }, [userMessageCount, canFinish]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    const userMsg: ConversationMessage = { id: uuidv4(), content: text, isFromUser: true };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsLoading(true);
    try {
      const res = await fetch(PERSONA_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'chat',
          conversationHistory: messages.map(m => ({ content: m.content, isFromUser: m.isFromUser })),
          userMessage: text,
        }),
      });
      const data = await res.json();
      if (!res.ok) console.error('[persona-chat] API error', res.status, data);
      if (res.ok && data.usage) dispatch({ type: 'ADD_TOKEN_USAGE', payload: { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } });
      setMessages(prev => [...prev, {
        id: uuidv4(),
        content: res.ok
          ? (data.response || "Réponse vide reçue")
          : `Erreur ${res.status} : ${data.error ?? "inconnue"}${data.details ? " — " + String(data.details).slice(0, 120) : ""}`,
        isFromUser: false,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: uuidv4(),
        content: "Problème de connexion. Vérifie et réessaie.",
        isFromUser: false,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const finishCreation = async () => {
    setIsExtracting(true);
    setExtracted(null);
    try {
      const res = await fetch(PERSONA_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'extract',
          conversationHistory: messages.map(m => ({ content: m.content, isFromUser: m.isFromUser })),
        }),
      });
      const data = await res.json();
      const raw = data.response.replace(/```json?/gi, '').replace(/```/g, '').trim();
      setExtracted(JSON.parse(raw));
    } catch {
      alert("Erreur lors de la génération du persona. Continue la conversation et réessaie.");
    } finally {
      setIsExtracting(false);
    }
  };

  const savePersona = () => {
    if (!extracted) return;
    if (existingPersona) {
      dispatch({ type: 'UPDATE_PERSONA', payload: { ...existingPersona, ...extracted } });
    } else {
      createPersona({ ...extracted, classId });
    }
    setMessages([{ id: uuidv4(), content: openingMessage, isFromUser: false }]);
    setExtracted(null);
    setCanFinish(false);
    onSaved();
  };

  // ── Confirmation card ────────────────────────────────────────────────────

  if (extracted) {
    return (
      <div className="rounded-2xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-2 mb-5">
          <div className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} />
          <p className="text-sm font-semibold" style={{ color: TEXT }}>{existingPersona ? 'Persona mis à jour' : 'Persona généré'}</p>
        </div>
        <div className="space-y-3 mb-6">
          {[
            { label: 'Prénom', value: extracted.name },
            { label: 'Âge', value: `${extracted.age} ans` },
            { label: 'Description', value: extracted.description },
            { label: 'Style', value: extracted.speakingStyle },
          ].filter(({ value }) => value).map(({ label, value }) => (
            <div key={label} className="flex gap-4 items-start">
              <span
                className="text-xs font-semibold uppercase tracking-wide w-20 shrink-0 mt-0.5"
                style={{ color: MUTED }}
              >
                {label}
              </span>
              <span className="text-sm" style={{ color: TEXT }}>{value}</span>
            </div>
          ))}
          <div className="flex gap-4 items-start">
            <span className="text-xs font-semibold uppercase tracking-wide w-20 shrink-0 mt-1" style={{ color: MUTED }}>
              Traits
            </span>
            <div className="flex flex-wrap gap-1.5">
              {extracted.traits.map(t => (
                <span
                  key={t}
                  className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: `${ACCENT}12`, color: ACCENT }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <span className="text-xs font-semibold uppercase tracking-wide w-20 shrink-0 mt-1" style={{ color: MUTED }}>
              Intérêts
            </span>
            <div className="flex flex-wrap gap-1.5">
              {extracted.interests.map(i => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: `${PINK}12`, color: PINK }}
                >
                  {i}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={savePersona}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: ACCENT }}
            onMouseEnter={e => (e.currentTarget.style.background = '#4f46e5')}
            onMouseLeave={e => (e.currentTarget.style.background = ACCENT)}
          >
            {existingPersona ? 'Mettre à jour le persona' : 'Sauvegarder le persona'}
          </button>
          <button
            onClick={() => setExtracted(null)}
            className="px-5 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: PANEL, color: TEXT }}
          >
            Modifier
          </button>
        </div>
      </div>
    );
  }

  // ── Chat UI ──────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      {/* Chat messages */}
      <div
        ref={chatRef}
        className="px-5 py-5 space-y-5"
        style={{ height: '400px', overflowY: 'auto', background: BG }}
      >
        {messages.map(msg =>
          msg.isFromUser ? (
            <div key={msg.id} className="flex justify-end">
              <div
                className="max-w-sm px-4 py-2.5 text-sm leading-relaxed text-white"
                style={{ background: ACCENT, borderRadius: '18px 18px 4px 18px' }}
              >
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={msg.id} className="flex gap-3">
              <div
                className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5"
                style={{ background: ACCENT }}
              >
                A
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-xs font-semibold mb-1.5" style={{ color: MUTED }}>Assistant</p>
                <p className="text-sm leading-relaxed" style={{ color: TEXT }}>{msg.content}</p>
              </div>
            </div>
          )
        )}
        {isLoading && (
          <div className="flex gap-3">
            <div
              className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
              style={{ background: ACCENT }}
            >
              A
            </div>
            <div className="flex items-center gap-1.5 pt-2">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-4" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Décris ton persona..."
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
            style={{
              background: PANEL,
              border: `1px solid ${BORDER}`,
              color: TEXT,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-40"
            style={{ background: ACCENT }}
          >
            Envoyer
          </button>
        </div>

        {canFinish ? (
          <button
            onClick={finishCreation}
            disabled={isExtracting}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: TEXT }}
          >
            {isExtracting ? 'Génération en cours…' : "J'ai terminé — Créer le persona"}
          </button>
        ) : (
          <p className="text-xs text-center" style={{ color: MUTED }}>
            Continue la conversation — le bouton de finalisation apparaît après 5 échanges.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Manual form creator ──────────────────────────────────────────────────────

function ManualCreator({
  classId,
  onSaved,
  createPersona,
}: {
  classId: string;
  onSaved: () => void;
  createPersona: (p: Omit<Persona, 'id' | 'createdAt' | 'createdBy'>) => void;
}) {
  const [name, setName] = useState('');
  const [age, setAge] = useState(16);
  const [description, setDescription] = useState('');
  const [traits, setTraits] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [speakingStyle, setSpeakingStyle] = useState('');
  const [customTrait, setCustomTrait] = useState('');
  const [customInterest, setCustomInterest] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || traits.length === 0 || interests.length === 0) return;
    createPersona({
      name: name.trim(),
      age,
      description: description.trim(),
      traits,
      interests,
      speakingStyle: speakingStyle.trim(),
      classId,
    });
    setName(''); setAge(16); setDescription('');
    setTraits([]); setInterests([]); setSpeakingStyle('');
    onSaved();
  };

  const toggleTrait = (t: string) =>
    setTraits(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const toggleInterest = (i: string) =>
    setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);

  const addCustomTrait = () => {
    if (customTrait.trim() && !traits.includes(customTrait.trim())) {
      setTraits(prev => [...prev, customTrait.trim()]);
      setCustomTrait('');
    }
  };

  const addCustomInterest = () => {
    if (customInterest.trim() && !interests.includes(customInterest.trim())) {
      setInterests(prev => [...prev, customInterest.trim()]);
      setCustomInterest('');
    }
  };

  const fieldStyle: CSSProperties = {
    background: PANEL,
    border: `1px solid ${BORDER}`,
    color: TEXT,
    borderRadius: '12px',
    padding: '10px 14px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    fontFamily: 'Inter, system-ui, sans-serif',
    transition: 'border-color 0.15s',
  };

  const chipStyle = (active: boolean, activeColor: string) => ({
    background: active ? activeColor : 'transparent',
    color: active ? 'white' : TEXT,
    border: `1px solid ${active ? activeColor : BORDER}`,
    borderRadius: '999px',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: 500 as const,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'Inter, system-ui, sans-serif',
  });

  return (
    <div className="rounded-2xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: TEXT }}>Prénom</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              style={fieldStyle}
              placeholder="Ex: Naïma, Lucas, Chloé..."
              required
              onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
              onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: TEXT }}>Âge (14–19)</label>
            <input
              type="number"
              value={age}
              onChange={e => setAge(parseInt(e.target.value))}
              style={fieldStyle}
              min={14}
              max={19}
              onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
              onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: TEXT }}>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{ ...fieldStyle, minHeight: '80px', resize: 'none' } as CSSProperties}
            placeholder="Ex: Lycéen en première, passionné de musique..."
            onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
          />
        </div>

        <div>
          <div className="flex items-baseline gap-2 mb-3">
            <label className="text-sm font-medium" style={{ color: TEXT }}>Traits de caractère</label>
            {traits.length > 0 && <span className="text-xs" style={{ color: MUTED }}>{traits.length} sélectionnés</span>}
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {TRAIT_SUGGESTIONS.map(trait => (
              <button key={trait} type="button" onClick={() => toggleTrait(trait)} style={chipStyle(traits.includes(trait), ACCENT)}>
                {trait}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customTrait}
              onChange={e => setCustomTrait(e.target.value)}
              style={{ ...fieldStyle, width: undefined, flex: 1 } as CSSProperties}
              placeholder="Trait personnalisé..."
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomTrait())}
              onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
              onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
            />
            <button
              type="button"
              onClick={addCustomTrait}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: ACCENT }}
            >
              +
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-baseline gap-2 mb-3">
            <label className="text-sm font-medium" style={{ color: TEXT }}>Centres d'intérêt</label>
            {interests.length > 0 && <span className="text-xs" style={{ color: MUTED }}>{interests.length} sélectionnés</span>}
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {INTEREST_SUGGESTIONS.map(interest => (
              <button key={interest} type="button" onClick={() => toggleInterest(interest)} style={chipStyle(interests.includes(interest), PINK)}>
                {interest}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customInterest}
              onChange={e => setCustomInterest(e.target.value)}
              style={{ ...fieldStyle, width: undefined, flex: 1 } as CSSProperties}
              placeholder="Intérêt personnalisé..."
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomInterest())}
              onFocus={e => (e.currentTarget.style.borderColor = PINK)}
              onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
            />
            <button
              type="button"
              onClick={addCustomInterest}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
              style={{ background: PINK }}
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-3" style={{ color: TEXT }}>Style de langage</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {STYLE_SUGGESTIONS.map(style => (
              <button key={style} type="button" onClick={() => setSpeakingStyle(style)} style={chipStyle(speakingStyle === style, '#0891b2')}>
                {style}
              </button>
            ))}
          </div>
          <textarea
            value={speakingStyle}
            onChange={e => setSpeakingStyle(e.target.value)}
            style={{ ...fieldStyle, minHeight: '70px', resize: 'none' } as CSSProperties}
            placeholder="Décris comment ce persona s'exprime..."
            onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
          />
        </div>

        {name && (
          <div className="rounded-xl p-4" style={{ background: PANEL }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: MUTED }}>Aperçu</p>
            <p className="text-sm leading-relaxed" style={{ color: TEXT }}>
              "{name}, {age} ans.{description && ` ${description}`}
              {traits.length > 0 && ` Personnalité : ${traits.join(', ')}.`}
              {interests.length > 0 && ` Passions : ${interests.join(', ')}.`}
              {speakingStyle && ` Style : ${speakingStyle}.`}"
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!name.trim() || traits.length === 0 || interests.length === 0}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: ACCENT }}
          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = '#4f46e5'; }}
          onMouseLeave={e => (e.currentTarget.style.background = ACCENT)}
        >
          Créer le persona
        </button>
      </form>
    </div>
  );
}

// ─── Persona card ─────────────────────────────────────────────────────────────

function PersonaCard({
  persona, onDelete, onEdit, isEditing, editForm, onEditFormChange, onSaveEdit, onCancelEdit, feedback,
}: {
  persona: Persona;
  onDelete?: () => void;
  onEdit?: () => void;
  isEditing?: boolean;
  editForm?: { name: string; age: string; description: string; traits: string; interests: string; speakingStyle: string };
  onEditFormChange?: (f: Partial<typeof editForm>) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  feedback?: PersonaFeedback[];
}) {
  return (
    <div className="rounded-2xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-base font-bold" style={{ color: TEXT }}>{persona.name}, {persona.age} ans</h3>
          {persona.description && !isEditing && (
            <p className="text-sm mt-0.5" style={{ color: MUTED }}>{persona.description}</p>
          )}
        </div>
        {(onDelete || onEdit) && (
          <div className="flex items-center gap-1">
            {onEdit && !isEditing && (
              <button
                onClick={onEdit}
                className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                style={{ background: PANEL, color: MUTED }}
                onMouseEnter={e => { e.currentTarget.style.background = `${ACCENT}15`; e.currentTarget.style.color = ACCENT; }}
                onMouseLeave={e => { e.currentTarget.style.background = PANEL; e.currentTarget.style.color = MUTED; }}
              >
                Modifier
              </button>
            )}
            {onDelete && !isEditing && (
              <button
                onClick={onDelete}
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm transition-colors"
                style={{ color: MUTED, background: PANEL }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {!isEditing && (
        <>
          {persona.traits.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {persona.traits.map(trait => (
                <span key={trait} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: `${ACCENT}12`, color: ACCENT }}>{trait}</span>
              ))}
            </div>
          )}
          {persona.interests.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {persona.interests.map(interest => (
                <span key={interest} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: `${PINK}12`, color: PINK }}>{interest}</span>
              ))}
            </div>
          )}
          {persona.speakingStyle && (
            <p className="text-xs mt-2" style={{ color: MUTED }}>
              <span style={{ fontWeight: 500 }}>Style :</span> {persona.speakingStyle}
            </p>
          )}

          {feedback !== undefined && (
            <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
              {feedback.length === 0 ? (
                <p className="text-xs" style={{ color: MUTED }}>Aucune partie jouée avec ce persona pour l'instant.</p>
              ) : (
                <>
                  <div className="flex gap-4 mb-3">
                    <div className="text-center">
                      <p className="text-lg font-bold" style={{ color: TEXT }}>{feedback.length}</p>
                      <p className="text-xs" style={{ color: MUTED }}>partie{feedback.length > 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold" style={{ color: '#16a34a' }}>{feedback.filter(f => !f.wasDetected).length}</p>
                      <p className="text-xs" style={{ color: MUTED }}>fois non détecté</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold" style={{ color: '#dc2626' }}>{feedback.filter(f => f.wasDetected).length}</p>
                      <p className="text-xs" style={{ color: MUTED }}>fois détecté</p>
                    </div>
                  </div>
                  <p className="text-xs font-medium mb-2" style={{ color: MUTED }}>Commentaires des enquêteurs :</p>
                  <div className="space-y-2">
                    {feedback.slice(-5).reverse().map((fb, i) => (
                      <div key={i} className="rounded-lg px-3 py-2 text-xs" style={{
                        background: fb.wasDetected ? '#fef2f2' : '#f0fdf4',
                        borderLeft: `3px solid ${fb.wasDetected ? '#fca5a5' : '#86efac'}`,
                        color: TEXT,
                      }}>
                        <span className="font-medium" style={{ color: fb.wasDetected ? '#dc2626' : '#16a34a' }}>
                          {fb.wasDetected ? 'Détecté · ' : 'Non détecté · '}
                        </span>
                        {fb.justification}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {isEditing && editForm && onEditFormChange && onSaveEdit && onCancelEdit && (
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Prénom</label>
              <input className="retro-input text-xs" value={editForm.name} onChange={e => onEditFormChange({ name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Âge</label>
              <input className="retro-input text-xs" type="number" min={14} max={19} value={editForm.age} onChange={e => onEditFormChange({ age: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Description</label>
            <textarea className="retro-input text-xs w-full resize-none" rows={2} value={editForm.description} onChange={e => onEditFormChange({ description: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Traits (séparés par des virgules)</label>
            <input className="retro-input text-xs" value={editForm.traits} onChange={e => onEditFormChange({ traits: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Centres d'intérêt (séparés par des virgules)</label>
            <input className="retro-input text-xs" value={editForm.interests} onChange={e => onEditFormChange({ interests: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Style d'expression</label>
            <textarea className="retro-input text-xs w-full resize-none" rows={2} value={editForm.speakingStyle} onChange={e => onEditFormChange({ speakingStyle: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onSaveEdit} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ background: ACCENT }}>Sauvegarder</button>
            <button onClick={onCancelEdit} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: PANEL, color: MUTED }}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
