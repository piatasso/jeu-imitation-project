import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useTimer } from '../hooks/useTimer';
import { useMultiplayer } from '../hooks/useMultiplayer';
import { generateAIResponse, createAIMessage } from '../utils/aiResponder';
import { containsBannedWords } from '../utils/contentFilter';
import type { Message, ChatSession, Persona, GameMode } from '../types';
import type { MultiplayerRole } from '../hooks/useMultiplayer';
import { v4 as uuidv4 } from 'uuid';

type GamePhase = 'select' | 'waiting' | 'playing' | 'voting' | 'result';
type WaitingMode = 'generic' | 'private';

const BG = '#faf7f2';
const CARD = '#ffffff';
const PANEL = '#f5f0e8';
const BORDER = 'rgba(0,0,0,0.08)';
const TEXT = '#1c1917';
const MUTED = '#78716c';
const ACCENT = '#6366f1';
const TEAL = '#0891b2';

const OPENING_GREETINGS = ['Coucou', 'Slt', 'Salut', 'Yo', 'Bonjour', 'Coucou cv ?', 'Hello', 'Wsh', 'Ça va ?'];
function randomGreeting() { return OPENING_GREETINGS[Math.floor(Math.random() * OPENING_GREETINGS.length)]; }

function computeTypingDelay(responseText: string): number {
  const charCount = responseText.length;
  const thinkTime = 700 + Math.random() * 900;   // 0.7–1.6s pause before typing
  const msPerChar = 50 + Math.random() * 45;     // 50–95ms/char
  return Math.min(thinkTime + charCount * msPerChar, 18000); // cap at 18s
}

export function PlayPage() {
  const { state, dispatch } = useGame();
  const { currentUser, personas, sessions, enqueteurScores } = state;

  // All human messages sent directly to the AI across every completed session —
  // gives the AI a collective picture of how people talk to it
  const pastUserMessages = sessions
    .filter(s => s.status === 'completed' && s.aiIsInChat !== 'both')
    .flatMap(s => {
      const aiChat = s.aiIsInChat === 'A' ? s.messages.chatA : s.messages.chatB;
      return aiChat.filter(m => !m.isFromAI).map(m => m.content);
    })
    .slice(-100);
  const location = useLocation();

  const [phase, setPhase] = useState<GamePhase>('select');
  const [personaA, setPersonaA] = useState<Persona | null>(null);
  const [personaB, setPersonaB] = useState<Persona | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('solo');
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messagesA, setMessagesA] = useState<Message[]>([]);
  const [messagesB, setMessagesB] = useState<Message[]>([]);
  const [inputA, setInputA] = useState('');
  const [inputB, setInputB] = useState('');
  const [typingA, setTypingA] = useState(false);
  const [typingB, setTypingB] = useState(false);
  const [vote, setVote] = useState<'A' | 'B' | null>(null);
  const [justification, setJustification] = useState('');
  const [result, setResult] = useState<{ correct: boolean; points: number } | null>(null);

  const classId = currentUser?.classId;
  const [classClosed, setClassClosed] = useState(() =>
    classId ? localStorage.getItem(`classClosed_${classId}`) === '1' : false
  );
  useEffect(() => {
    if (!classId) return;
    const id = setInterval(() => {
      if (localStorage.getItem(`classClosed_${classId}`) === '1') setClassClosed(true);
    }, 5000);
    return () => clearInterval(id);
  }, [classId]);

  const [bannedWordWarning, setBannedWordWarning] = useState<string | null>(null);
  const [moderating, setModerating] = useState(false);
  const [role, setRole] = useState<'enqueteur' | 'enquete' | null>(null);
  const [enqueteMessages, setEnqueteMessages] = useState<Message[]>([]);
  const [enqueteInput, setEnqueteInput] = useState('');
  const enqueteChatRef = useRef<HTMLDivElement>(null);
  const processedMsgCountRef = useRef(0);

  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [waitingMode, setWaitingMode] = useState<WaitingMode>('generic');
  const [waitingCountdown, setWaitingCountdown] = useState(60);
  const [waitingElapsed, setWaitingElapsed] = useState(0);
  const waitingIntervalRef = useRef<number | null>(null);

  const { timeLeft, isExpired, start, formatTime } = useTimer(300);

  // All personas visible for now; when multiple schools go live, filter by persona.schoolId === currentUser.schoolId
  const availablePersonas = personas;

  const multiplayer = useMultiplayer(currentUser?.id || '');

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const roleRef = useRef(role);
  roleRef.current = role;

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const ls = location.state as { fromLobby?: boolean; roomCode?: string; role?: string; partnerId?: string } | null;
    if (!ls?.fromLobby || !ls.roomCode || !ls.role || !ls.partnerId) return;
    setPhase('waiting');
    multiplayer.rejoinRoom(ls.roomCode, ls.role as MultiplayerRole, ls.partnerId);
    window.history.replaceState({}, '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (enqueteChatRef.current) enqueteChatRef.current.scrollTop = enqueteChatRef.current.scrollHeight;
  }, [enqueteMessages]);

  useEffect(() => {
    if (isExpired && phase === 'playing' && role !== 'enquete') setPhase('voting');
  }, [isExpired, phase, role]);

  useEffect(() => {
    if (isExpired && phase === 'playing' && role === 'enquete') setPhase('result');
  }, [isExpired, phase, role]);

  useEffect(() => {
    return () => { if (waitingIntervalRef.current) clearInterval(waitingIntervalRef.current); };
  }, []);

  useEffect(() => {
    if (!multiplayer.matchData || phase !== 'waiting') return;
    const { role: assignedRole } = multiplayer.matchData;
    setRole(assignedRole);
    if (waitingIntervalRef.current) { clearInterval(waitingIntervalRef.current); waitingIntervalRef.current = null; }
    if (assignedRole === 'enqueteur') {
      startMultiplayerGame();
    } else {
      setPhase('playing');
      start();
      setEnqueteMessages([{
        id: uuidv4(), content: "Un enquêteur va vous poser des questions. Répondez naturellement, comme si vous étiez un humain ordinaire !",
        senderId: 'system', timestamp: new Date(), isFromAI: false,
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiplayer.matchData]);

  useEffect(() => {
    const msgs = multiplayer.receivedMessages;
    if (msgs.length <= processedMsgCountRef.current) return;
    const newMsgs = msgs.slice(processedMsgCountRef.current);
    processedMsgCountRef.current = msgs.length;
    for (const msg of newMsgs) {
      const currentRole = roleRef.current;
      const currentSession = sessionRef.current;
      if (currentRole === 'enqueteur' && currentSession) {
        const newMessage: Message = { id: msg.id, content: msg.content, senderId: 'human-player', timestamp: new Date(msg.timestamp), isFromAI: false };
        if (currentSession.humanChat === 'A') { setTypingA(false); setMessagesA(prev => [...prev, newMessage]); }
        else { setTypingB(false); setMessagesB(prev => [...prev, newMessage]); }
      } else if (currentRole === 'enquete') {
        setEnqueteMessages(prev => [...prev, { id: msg.id, content: msg.content, senderId: 'enqueteur', timestamp: new Date(msg.timestamp), isFromAI: false }]);
      }
    }
  }, [multiplayer.receivedMessages.length]);

  useEffect(() => {
    if (role !== 'enqueteur' || !session) return;
    if (session.humanChat === 'A') setTypingA(multiplayer.partnerTyping);
    else setTypingB(multiplayer.partnerTyping);
  }, [multiplayer.partnerTyping, role, session]);

  useEffect(() => {
    if (phase === 'voting' && multiplayer.matchData && role === 'enqueteur') multiplayer.sendGameEnd();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (multiplayer.gameEnded && role === 'enquete' && phase === 'playing') setPhase('result');
  }, [multiplayer.gameEnded, role, phase]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getRandomPersona = useCallback((excludeId?: string) => {
    const pool = availablePersonas.filter(p => p.id !== excludeId);
    return pool[Math.floor(Math.random() * pool.length)] || personas[0];
  }, [availablePersonas, personas]);

  const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  // ── Start game ────────────────────────────────────────────────────────────

  const startSoloGame = () => {
    if (!personaA) return;
    // personaB may equal personaA when falling back from a multiplayer waiting room
    const pB = (personaB && personaB.id !== personaA.id) ? personaB : getRandomPersona(personaA.id);
    setPersonaB(pB);
    setRole(null);
    const newSession: ChatSession = {
      id: uuidv4(), enqueteurId: currentUser?.id || '',
      personaIdA: personaA.id, personaIdB: pB.id, gameMode: 'solo',
      messages: { chatA: [], chatB: [] }, startTime: new Date(), duration: 300,
      status: 'active', aiIsInChat: 'both',
    };
    setSession(newSession);
    dispatch({ type: 'ADD_SESSION', payload: newSession });
    setPhase('playing');
    start();
    if (Math.random() < 0.5) setTimeout(() => setMessagesA([{ id: uuidv4(), content: randomGreeting(), senderId: 'ai-a', timestamp: new Date(), isFromAI: true }]), 2000 + Math.random() * 4000);
    if (Math.random() < 0.5) setTimeout(() => setMessagesB([{ id: uuidv4(), content: randomGreeting(), senderId: 'ai-b', timestamp: new Date(), isFromAI: true }]), 2000 + Math.random() * 4000);
  };

  const startMultiplayerGame = () => {
    const aiPersona = personaA || getRandomPersona();
    // Both state vars hold the AI persona so sendMessageA/B can both generate AI responses
    // from the correct slot — aiIsInChat determines which slot is actually AI
    setPersonaA(aiPersona);
    setPersonaB(aiPersona);
    const aiChat = Math.random() > 0.5 ? 'A' : 'B';
    const newSession: ChatSession = {
      id: uuidv4(), enqueteurId: currentUser?.id || '',
      personaIdA: aiPersona.id, personaIdB: aiPersona.id, gameMode: 'multiplayer',
      messages: { chatA: [], chatB: [] }, startTime: new Date(), duration: 300,
      status: 'active', aiIsInChat: aiChat as 'A' | 'B',
      humanChat: aiChat === 'A' ? 'B' : 'A',
    };
    setSession(newSession);
    dispatch({ type: 'ADD_SESSION', payload: newSession });
    if (waitingIntervalRef.current) clearInterval(waitingIntervalRef.current);
    setPhase('playing');
    start();
    // AI chat sometimes sends an opening greeting, sometimes waits for the human to go first
    if (Math.random() < 0.5) {
      const aiDelay = 2000 + Math.random() * 4000;
      if (aiChat === 'A') {
        setTimeout(() => setMessagesA([{ id: uuidv4(), content: randomGreeting(), senderId: 'ai-a', timestamp: new Date(), isFromAI: true }]), aiDelay);
      } else {
        setTimeout(() => setMessagesB([{ id: uuidv4(), content: randomGreeting(), senderId: 'ai-b', timestamp: new Date(), isFromAI: true }]), aiDelay);
      }
    }
  };

  // ── Waiting room ──────────────────────────────────────────────────────────

  const startWaitingRoom = (mode: WaitingMode = 'generic') => {
    const code = mode === 'private' ? generateRoomCode() : 'PUBLIC';
    setRoomCode(code);
    setWaitingMode(mode);
    setPhase('waiting');
    setWaitingCountdown(180);
    setWaitingElapsed(0);
    if (mode === 'private') multiplayer.createPrivateRoom(code);
    else multiplayer.joinGenericQueue(currentUser?.schoolId, currentUser?.classId);
    waitingIntervalRef.current = window.setInterval(() => {
      setWaitingCountdown(prev => {
        if (prev <= 1) { if (waitingIntervalRef.current) clearInterval(waitingIntervalRef.current); return 0; }
        return prev - 1;
      });
      setWaitingElapsed(prev => prev + 1);
    }, 1000);
  };

  useEffect(() => {
    if (waitingCountdown === 0 && phase === 'waiting') { multiplayer.disconnect(); startSoloGame(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingCountdown, phase]);

  const joinRoom = () => {
    if (!joinCode.trim()) return;
    if (!personaA) setPersonaA(getRandomPersona());
    const code = joinCode.trim().toUpperCase();
    setRoomCode(code);
    setPhase('waiting');
    setWaitingCountdown(60);
    setWaitingElapsed(0);
    multiplayer.joinPrivateRoom(code);
    waitingIntervalRef.current = window.setInterval(() => {
      setWaitingCountdown(prev => {
        if (prev <= 1) { if (waitingIntervalRef.current) clearInterval(waitingIntervalRef.current); return 0; }
        return prev - 1;
      });
      setWaitingElapsed(prev => prev + 1);
    }, 1000);
  };

  // ── Send messages ─────────────────────────────────────────────────────────

  const showBannedWarning = () => {
    setBannedWordWarning('Message non envoyé — langage inapproprié.');
    setTimeout(() => setBannedWordWarning(null), 3000);
  };

  const checkModeration = async (text: string): Promise<boolean> => {
    if (containsBannedWords(text)) return true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch('/api/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json() as { flagged: boolean };
      return data.flagged;
    } catch {
      return false; // fail open if API unreachable
    }
  };

  const sendMessageA = async () => {
    if (!inputA.trim() || !session || moderating) return;
    setModerating(true);
    const flagged = await checkModeration(inputA);
    setModerating(false);
    if (flagged) { showBannedWarning(); setInputA(''); return; }
    const userMessage: Message = { id: uuidv4(), content: inputA.trim(), senderId: currentUser?.id || '', timestamp: new Date(), isFromAI: false };
    setMessagesA(prev => [...prev, userMessage]);
    const question = inputA.trim();
    setInputA('');
    const isAI = session.aiIsInChat === 'A' || session.aiIsInChat === 'both';
    if (isAI && personaA) {
      setTypingA(true);
      const { response, followUp, followUp2, usage } = await generateAIResponse(personaA, messagesA, question, pastUserMessages);
      if (usage) dispatch({ type: 'ADD_TOKEN_USAGE', payload: { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens } });
      await new Promise(resolve => setTimeout(resolve, computeTypingDelay(response)));
      setTypingA(false);
      setMessagesA(prev => [...prev, createAIMessage(response)]);
      if (followUp) {
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
        setTypingA(true);
        await new Promise(resolve => setTimeout(resolve, computeTypingDelay(followUp)));
        setTypingA(false);
        setMessagesA(prev => [...prev, createAIMessage(followUp)]);
        if (followUp2) {
          await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 900));
          setTypingA(true);
          await new Promise(resolve => setTimeout(resolve, computeTypingDelay(followUp2)));
          setTypingA(false);
          setMessagesA(prev => [...prev, createAIMessage(followUp2)]);
        }
      }
    } else if (multiplayer.matchData) {
      multiplayer.sendMessage(question);
    }
  };

  const sendMessageB = async () => {
    if (!inputB.trim() || !session || moderating) return;
    setModerating(true);
    const flagged = await checkModeration(inputB);
    setModerating(false);
    if (flagged) { showBannedWarning(); setInputB(''); return; }
    const userMessage: Message = { id: uuidv4(), content: inputB.trim(), senderId: currentUser?.id || '', timestamp: new Date(), isFromAI: false };
    setMessagesB(prev => [...prev, userMessage]);
    const question = inputB.trim();
    setInputB('');
    const isAI = session.aiIsInChat === 'B' || session.aiIsInChat === 'both';
    if (isAI && personaB) {
      setTypingB(true);
      const { response, followUp, followUp2, usage } = await generateAIResponse(personaB, messagesB, question, pastUserMessages);
      if (usage) dispatch({ type: 'ADD_TOKEN_USAGE', payload: { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens } });
      await new Promise(resolve => setTimeout(resolve, computeTypingDelay(response)));
      setTypingB(false);
      setMessagesB(prev => [...prev, createAIMessage(response)]);
      if (followUp) {
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
        setTypingB(true);
        await new Promise(resolve => setTimeout(resolve, computeTypingDelay(followUp)));
        setTypingB(false);
        setMessagesB(prev => [...prev, createAIMessage(followUp)]);
        if (followUp2) {
          await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 900));
          setTypingB(true);
          await new Promise(resolve => setTimeout(resolve, computeTypingDelay(followUp2)));
          setTypingB(false);
          setMessagesB(prev => [...prev, createAIMessage(followUp2)]);
        }
      }
    } else if (multiplayer.matchData) {
      multiplayer.sendMessage(question);
    }
  };

  const sendEnqueteMessage = async () => {
    if (!enqueteInput.trim() || moderating) return;
    setModerating(true);
    const flagged = await checkModeration(enqueteInput);
    setModerating(false);
    if (flagged) { showBannedWarning(); setEnqueteInput(''); return; }
    const content = enqueteInput.trim();
    setEnqueteMessages(prev => [...prev, { id: uuidv4(), content, senderId: currentUser?.id || 'enquete', timestamp: new Date(), isFromAI: false }]);
    setEnqueteInput('');
    multiplayer.sendMessage(content);
  };

  // ── Vote & result ─────────────────────────────────────────────────────────

  const submitVote = () => {
    if (!vote || !session) return;
    const isCorrect = session.aiIsInChat === 'both' ? true : vote === session.aiIsInChat;
    let points = 0;
    if (isCorrect) { points = 2; if (justification.trim().length > 50) points += 1; }
    setResult({ correct: isCorrect, points });
    dispatch({ type: 'ADD_VOTE', payload: { id: uuidv4(), sessionId: session.id, enqueteurId: currentUser?.id || '', votedChat: vote, justification: justification.trim(), isCorrect, timestamp: new Date() } });
    dispatch({ type: 'UPDATE_SESSION', payload: { ...session, status: 'completed', endTime: new Date(), messages: { chatA: messagesA, chatB: messagesB } } });
    if (multiplayer.matchData) multiplayer.sendGameEnd(isCorrect ? 'human' : 'ai');
    // Save to Redis for cross-device research export (fire-and-forget)
    fetch('/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save-session',
        session: {
          sessionId: session.id,
          timestamp: new Date().toISOString(),
          startTime: new Date(session.startTime).toISOString(),
          durationSeconds: Math.round((Date.now() - new Date(session.startTime).getTime()) / 1000),
          enqueteurPseudo: currentUser?.pseudo ?? 'Enquêteur',
          personaAName: personaA?.name ?? '?',
          personaBName: personaB?.name ?? '?',
          personaAId: personaA?.id ?? null,
          personaBId: personaB?.id ?? null,
          aiIsInChat: session.aiIsInChat,
          gameMode: session.gameMode,
          chatA: messagesA.map(m => ({ from: m.isFromAI ? (personaA?.name ?? 'IA') : (currentUser?.pseudo ?? 'Enquêteur'), content: m.content, isFromAI: m.isFromAI })),
          chatB: messagesB.map(m => ({ from: m.isFromAI ? (personaB?.name ?? 'IA') : (currentUser?.pseudo ?? 'Enquêteur'), content: m.content, isFromAI: m.isFromAI })),
          vote,
          isCorrect,
          justification: justification.trim(),
        },
      }),
    }).catch(() => {});
    setPhase('result');
  };

  const playAgain = () => {
    multiplayer.disconnect();
    processedMsgCountRef.current = 0;
    setPhase('select'); setPersonaA(null); setPersonaB(null); setSession(null);
    setMessagesA([]); setMessagesB([]); setVote(null); setJustification(''); setResult(null);
    setRoomCode(''); setJoinCode(''); setGameMode('solo'); setRole(null);
    setEnqueteMessages([]); setEnqueteInput('');
  };

  // ── SELECT ────────────────────────────────────────────────────────────────

  if (phase === 'select') {
    if (classClosed) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: BG, fontFamily: 'Inter, system-ui, sans-serif', color: TEXT }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, letterSpacing: '-0.02em' }}>Session terminée</h2>
            <p style={{ fontSize: 14, color: MUTED }}>L'enseignant a mis fin à la session. Merci d'avoir participé !</p>
            <Link to="/" style={{ display: 'inline-block', marginTop: 24, fontSize: 14, color: ACCENT }}>← Retour à l'accueil</Link>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen" style={{ background: BG, fontFamily: 'Inter, system-ui, sans-serif', color: TEXT }}>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Link to="/" className="text-sm transition-colors" style={{ color: MUTED }}
              onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
              onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
            >
              ← Retour
            </Link>
            <span style={{ color: MUTED }}>·</span>
            <h1 className="text-xl font-bold" style={{ color: TEXT }}>Jouer</h1>
          </div>

          {/* Game mode */}
          <section className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Mode de jeu</p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              {([
                {
                  id: 'solo' as GameMode,
                  label: 'Solo',
                  sub: '2 IAs — disponible immédiatement',
                },
                {
                  id: 'multiplayer' as GameMode,
                  label: 'Multijoueur',
                  sub: '1 IA + 1 vrai élève connecté',
                },
              ] as const).map(m => (
                <button key={m.id} onClick={() => { setGameMode(m.id); setPersonaA(null); setPersonaB(null); }}
                  className="rounded-xl p-4 text-left transition-all"
                  style={{
                    background: gameMode === m.id ? `${ACCENT}08` : CARD,
                    border: `2px solid ${gameMode === m.id ? ACCENT : BORDER}`,
                  }}
                >
                  <p className="text-sm font-semibold" style={{ color: gameMode === m.id ? ACCENT : TEXT }}>{m.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>{m.sub}</p>
                </button>
              ))}
            </div>
            {gameMode === 'multiplayer' && (
              <div className="rounded-xl px-4 py-3 text-xs leading-relaxed" style={{ background: PANEL, color: MUTED }}>
                <strong style={{ color: TEXT }}>Comment ça marche :</strong> deux élèves rejoignent la salle d'attente.
                L'un devient <strong style={{ color: ACCENT }}>enquêteur</strong> et interroge simultanément une IA et l'autre élève.
                L'autre devient <strong style={{ color: TEAL }}>enquêté(e)</strong> et doit convaincre l'enquêteur qu'il/elle est humain(e).
                Les rôles sont assignés aléatoirement. Si personne ne rejoint dans 3 minutes, fallback en mode solo (2 IAs).
              </div>
            )}
          </section>

          {/* Persona selection */}
          {availablePersonas.length === 0 ? (
            <div className="rounded-2xl p-10 text-center mb-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <p className="text-sm font-medium mb-2" style={{ color: TEXT }}>Aucun persona disponible</p>
              <p className="text-sm mb-5" style={{ color: MUTED }}>Crée d'abord des personas pour pouvoir jouer.</p>
              <Link to="/personas" className="px-5 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: ACCENT }}>
                Créer un persona
              </Link>
            </div>
          ) : gameMode === 'multiplayer' ? (
            /* Multiplayer: AI persona chosen randomly, nothing to select */
            <div className="rounded-2xl p-5 mb-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <p className="text-sm font-semibold mb-1" style={{ color: TEXT }}>Persona IA — choisi aléatoirement</p>
              <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                Un persona sera tiré au sort parmi tous les personas disponibles. Tu ne sauras pas lequel — c'est fait exprès.
                L'enquêteur ne saura pas non plus lequel des deux interlocuteurs est l'IA.
              </p>
            </div>
          ) : (
            /* Solo: two personas, both AI */
            <div className="rounded-2xl overflow-hidden mb-6" style={{ border: `1px solid ${BORDER}` }}>
              <div className="px-6 py-4" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: ACCENT }}>
                  Interlocuteur A — IA
                  {personaA && <span className="ml-2 normal-case font-normal" style={{ color: MUTED }}>— {personaA.name}</span>}
                </p>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2" style={{ background: BG }}>
                {availablePersonas.map(persona => (
                  <button key={persona.id}
                    onClick={() => { setPersonaA(persona); if (personaB?.id === persona.id) setPersonaB(null); }}
                    className="text-left rounded-xl p-3 transition-all"
                    style={{ background: personaA?.id === persona.id ? `${ACCENT}08` : CARD, border: `1px solid ${personaA?.id === persona.id ? ACCENT : BORDER}` }}
                  >
                    <p className="text-sm font-medium" style={{ color: TEXT }}>{persona.name}, {persona.age} ans</p>
                    {persona.description && <p className="text-xs mt-0.5 truncate" style={{ color: MUTED }}>{persona.description}</p>}
                  </button>
                ))}
              </div>
              <div className="px-6 py-4" style={{ background: CARD, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: TEAL }}>
                  Interlocuteur B — IA
                  {personaB
                    ? <span className="ml-2 normal-case font-normal" style={{ color: MUTED }}>— {personaB.name}</span>
                    : <span className="ml-2 normal-case font-normal" style={{ color: MUTED }}>— aléatoire si non choisi</span>}
                </p>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2" style={{ background: BG }}>
                {availablePersonas.filter(p => p.id !== personaA?.id).map(persona => (
                  <button key={persona.id} onClick={() => setPersonaB(persona)}
                    className="text-left rounded-xl p-3 transition-all"
                    style={{ background: personaB?.id === persona.id ? `${TEAL}08` : CARD, border: `1px solid ${personaB?.id === persona.id ? TEAL : BORDER}` }}
                  >
                    <p className="text-sm font-medium" style={{ color: TEXT }}>{persona.name}, {persona.age} ans</p>
                    {persona.description && <p className="text-xs mt-0.5 truncate" style={{ color: MUTED }}>{persona.description}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Multiplayer options */}
          {gameMode === 'multiplayer' && (
            <div className="rounded-2xl p-5 mb-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Type de salle</p>
              <div className="flex gap-1 p-1 rounded-xl w-fit mb-4" style={{ background: PANEL }}>
                {([
                  { id: 'generic' as WaitingMode, label: 'File générique' },
                  { id: 'private' as WaitingMode, label: 'Salle privée' },
                ] as const).map(m => (
                  <button key={m.id} onClick={() => setWaitingMode(m.id)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{ background: waitingMode === m.id ? CARD : 'transparent', color: waitingMode === m.id ? TEXT : MUTED, boxShadow: waitingMode === m.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {waitingMode === 'private' && (
                <div>
                  <p className="text-xs mb-2" style={{ color: MUTED }}>Rejoindre une salle existante :</p>
                  <div className="flex gap-2">
                    <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                      maxLength={6} placeholder="Code de la salle (ex: AB12CD)"
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                      style={{ background: PANEL, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
                      onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
                      onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
                    />
                    <button onClick={joinRoom} disabled={joinCode.length !== 6}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                      style={{ background: TEAL }}
                    >
                      Rejoindre
                    </button>
                  </div>
                  <p className="text-xs mt-2" style={{ color: MUTED }}>Ou cliquez ci-dessous pour créer une nouvelle salle.</p>
                </div>
              )}
            </div>
          )}

          {(gameMode === 'multiplayer' || personaA) && (
            <button onClick={gameMode === 'solo' ? startSoloGame : () => startWaitingRoom(waitingMode)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: TEXT }}
            >
              {gameMode === 'solo' ? 'Lancer la partie' : waitingMode === 'generic' ? "Rejoindre la file d'attente" : 'Créer une salle privée'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── WAITING ───────────────────────────────────────────────────────────────

  if (phase === 'waiting') {
    const isPrivate = waitingMode === 'private';
    const progressPct = (waitingElapsed / 60) * 100;
    const relayErr = multiplayer.relayError;
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className="w-full max-w-sm">
          <div className="rounded-2xl p-10 text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            {relayErr && (
              <div className="mb-6 px-4 py-3 rounded-xl text-left text-sm" style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c' }}>
                <p className="font-semibold mb-0.5">Multijoueur indisponible</p>
                <p className="text-xs">{relayErr}</p>
              </div>
            )}
            {isPrivate ? (
              <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: MUTED }}>Code de la salle</p>
                <p className="text-4xl font-bold tabular-nums tracking-widest mb-1" style={{ color: TEXT }}>{roomCode}</p>
                <p className="text-xs" style={{ color: MUTED }}>Partagez ce code avec un autre élève</p>
              </div>
            ) : (
              <div className="mb-6">
                <p className="text-sm font-medium mb-1" style={{ color: TEXT }}>File d'attente publique</p>
                <p className="text-xs" style={{ color: MUTED }}>La partie démarrera dès qu'un joueur sera disponible</p>
              </div>
            )}
            <div className="flex justify-center gap-2 mb-6">
              <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
            </div>
            <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: PANEL }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${progressPct}%`, background: waitingCountdown < 15 ? '#ef4444' : ACCENT }}
              />
            </div>
            <p className="text-xs mb-6" style={{ color: MUTED }}>
              Fallback 2 IAs dans <span style={{ color: waitingCountdown < 15 ? '#ef4444' : TEXT, fontWeight: 600 }}>{waitingCountdown}s</span>
            </p>
            <div className="space-y-2">
              <button onClick={() => { multiplayer.disconnect(); startSoloGame(); }}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-white"
                style={{ background: ACCENT }}
              >
                Commencer maintenant (2 IAs)
              </button>
              <button onClick={() => { if (waitingIntervalRef.current) clearInterval(waitingIntervalRef.current); multiplayer.disconnect(); playAgain(); }}
                className="w-full py-2.5 rounded-xl text-sm font-medium"
                style={{ background: PANEL, color: MUTED }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── PLAYING — ENQUÊTÉ ────────────────────────────────────────────────────

  if (phase === 'playing' && role === 'enquete') {
    const isGameOver = multiplayer.gameEnded || isExpired;
    return (
      <div className="min-h-screen" style={{ background: BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="text-center mb-6">
            <div className="inline-block px-6 py-3 rounded-xl mb-3"
              style={{ background: timeLeft < 60 ? 'rgba(239,68,68,0.06)' : PANEL, border: `1px solid ${BORDER}` }}
            >
              <p className="text-3xl font-bold tabular-nums tracking-widest"
                style={{ color: timeLeft < 60 ? '#ef4444' : ACCENT }}
              >
                {formatTime()}
              </p>
            </div>
            <p className="text-sm font-semibold" style={{ color: TEXT }}>Vous êtes l'enquêté(e)</p>
            <p className="text-xs mt-1" style={{ color: MUTED }}>Répondez naturellement pour convaincre l'enquêteur que vous êtes humain !</p>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <div ref={enqueteChatRef} className="px-5 py-5 space-y-4"
              style={{ height: '380px', overflowY: 'auto', background: BG }}
            >
              {enqueteMessages.map(msg => {
                const isMine = msg.senderId === (currentUser?.id || 'enquete');
                const isSystem = msg.senderId === 'system';
                if (isSystem) return <p key={msg.id} className="text-xs text-center" style={{ color: MUTED }}>{msg.content}</p>;
                return isMine ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-sm px-4 py-2.5 text-sm leading-relaxed text-white"
                      style={{ background: ACCENT, borderRadius: '18px 18px 4px 18px' }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: MUTED }}
                    >E</div>
                    <div>
                      <p className="text-xs font-semibold mb-1" style={{ color: MUTED }}>Enquêteur</p>
                      <p className="text-sm leading-relaxed" style={{ color: TEXT }}>{msg.content}</p>
                    </div>
                  </div>
                );
              })}
              {multiplayer.partnerTyping && (
                <div className="flex gap-1.5 items-center py-1">
                  <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                </div>
              )}
            </div>
            <div className="p-4" style={{ borderTop: `1px solid ${BORDER}` }}>
              {bannedWordWarning && (
                <div className="mb-2 px-3 py-1.5 rounded-lg text-xs text-center" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                  {bannedWordWarning}
                </div>
              )}
              {isGameOver ? (
                <p className="text-sm text-center" style={{ color: MUTED }}>La conversation est terminée.</p>
              ) : (
                <div className="flex gap-2">
                  <input type="text" value={enqueteInput}
                    onChange={e => { setEnqueteInput(e.target.value); multiplayer.sendTyping(); }}
                    onKeyDown={e => e.key === 'Enter' && sendEnqueteMessage()}
                    onPaste={e => e.preventDefault()}
                    placeholder="Tapez votre réponse..."
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: PANEL, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
                    onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
                    onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
                  />
                  <button onClick={sendEnqueteMessage} disabled={!enqueteInput.trim() || moderating}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                    style={{ background: ACCENT }}
                  >
                    Envoyer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── PLAYING — ENQUÊTEUR / SOLO ────────────────────────────────────────────

  if (phase === 'playing') {
    const isSolo = session?.aiIsInChat === 'both';
    return (
      <div className="min-h-screen" style={{ background: BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className="max-w-6xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs" style={{ color: MUTED }}>
                {isSolo ? 'Mode Solo — deux IAs' : 'Mode Multi — humain + IA'}
              </p>
              {(() => { const s = enqueteurScores.find(s => s.userId === currentUser?.id); return s ? (
                <p className="text-xs font-bold mt-0.5" style={{ color: ACCENT }}>{s.totalPoints} pts</p>
              ) : null; })()}
            </div>
            <div className="px-5 py-2.5 rounded-xl"
              style={{ background: timeLeft < 60 ? 'rgba(239,68,68,0.06)' : PANEL, border: `1px solid ${BORDER}` }}
            >
              <p className="text-2xl font-bold tabular-nums tracking-widest"
                style={{ color: timeLeft < 60 ? '#ef4444' : ACCENT }}
              >
                {formatTime()}
              </p>
            </div>
            <button onClick={() => setPhase('voting')}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              style={{ background: PANEL, color: TEXT, border: `1px solid ${BORDER}` }}
              onMouseEnter={e => (e.currentTarget.style.background = '#e8e2db')}
              onMouseLeave={e => (e.currentTarget.style.background = PANEL)}
            >
              Voter →
            </button>
          </div>

          {bannedWordWarning && (
            <div className="mb-3 px-4 py-2 rounded-lg text-sm text-center" style={{ background: '#fee2e2', color: '#b91c1c' }}>
              {bannedWordWarning}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChatPanel
              label="Interlocuteur A"
              personaName={isSolo ? personaA?.name : undefined}
              messages={messagesA} input={inputA}
              onInputChange={setInputA} onSend={sendMessageA}
              typing={typingA} isExpired={isExpired}
              accentColor={ACCENT} currentUserId={currentUser?.id}
              moderating={moderating}
            />
            <ChatPanel
              label="Interlocuteur B"
              personaName={isSolo ? personaB?.name : undefined}
              messages={messagesB} input={inputB}
              onInputChange={setInputB} onSend={sendMessageB}
              typing={typingB} isExpired={isExpired}
              accentColor={TEAL} currentUserId={currentUser?.id}
              moderating={moderating}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── VOTING ────────────────────────────────────────────────────────────────

  if (phase === 'voting') {
    const isSolo = session?.aiIsInChat === 'both';
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className="w-full max-w-2xl">
          <div className="rounded-2xl p-8" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <h2 className="text-lg font-bold mb-1" style={{ color: TEXT }}>
              {isSolo ? 'Laquelle des deux IAs vous a semblé la moins humaine ?' : "Lequel est l'IA ?"}
            </h2>
            <p className="text-xs mb-4" style={{ color: MUTED }}>
              {isSolo
                ? 'Les deux interlocuteurs étaient des IAs avec des personas différents.'
                : "L'un des deux était une IA jouant un persona — l'autre était un vrai élève."}
            </p>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { label: 'Bonne détection', pts: '+2 pts', color: '#10b981' },
                { label: 'Justification > 50 car.', pts: '+1 pt', color: '#6366f1' },
                { label: 'IA déjoue 3× → créateur', pts: '+2 bonus', color: '#d97706' },
              ].map(item => (
                <div key={item.label} className="rounded-xl p-3 text-center" style={{ background: PANEL }}>
                  <p className="text-xl font-bold" style={{ color: item.color }}>{item.pts}</p>
                  <p className="text-xs mt-1 leading-snug" style={{ color: MUTED }}>{item.label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 my-6">
              {([
                { chat: 'A' as const, color: ACCENT, persona: personaA },
                { chat: 'B' as const, color: TEAL, persona: personaB },
              ] as const).map(({ chat, color, persona }) => (
                <button key={chat} onClick={() => setVote(chat)}
                  className="rounded-2xl p-8 text-center transition-all"
                  style={{ background: vote === chat ? `${color}08` : BG, border: `2px solid ${vote === chat ? color : BORDER}` }}
                >
                  <p className="text-4xl font-bold mb-2" style={{ color: vote === chat ? color : MUTED }}>{chat}</p>
                  <p className="text-sm font-medium" style={{ color: TEXT }}>Interlocuteur {chat}</p>
                  {isSolo && persona && <p className="text-xs mt-1" style={{ color: MUTED }}>{persona.name}</p>}
                </button>
              ))}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: TEXT }}>
                Justification <span className="font-normal" style={{ color: MUTED }}>— bonus +1 pt si plus de 50 caractères</span>
              </label>
              <textarea value={justification} onChange={e => setJustification(e.target.value)}
                rows={4} placeholder="Expliquez les indices qui vous ont permis de repérer l'IA..."
                className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                style={{ background: PANEL, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
                onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
                onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
              />
              <p className="text-xs mt-1" style={{ color: MUTED }}>{justification.length} / 50 caractères minimum</p>
            </div>

            <button onClick={submitVote} disabled={!vote}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: TEXT }}
            >
              Valider mon vote
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── RESULT — ENQUÊTÉ ──────────────────────────────────────────────────────

  if (phase === 'result' && role === 'enquete') {
    const myCount = enqueteMessages.filter(m => m.senderId === (currentUser?.id || 'enquete')).length;
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className="w-full max-w-md">
          <div className="rounded-2xl p-10 text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <p className="text-lg font-bold mb-2" style={{ color: TEXT }}>
              {multiplayer.gameEnded ? "L'enquêteur a fait son choix !" : 'Temps écoulé !'}
            </p>
            <p className="text-sm mb-1" style={{ color: MUTED }}>Vous étiez l'enquêté(e).</p>
            <p className="text-sm mb-6" style={{ color: MUTED }}>
              Vous avez échangé <span style={{ color: TEXT, fontWeight: 600 }}>{myCount}</span> messages.
            </p>
            {multiplayer.enqueteVerdict ? (
              <div className="mb-8 rounded-xl px-4 py-3" style={{
                background: multiplayer.enqueteVerdict === 'human' ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${multiplayer.enqueteVerdict === 'human' ? '#bbf7d0' : '#fecaca'}`,
              }}>
                <p className="text-sm font-semibold" style={{ color: multiplayer.enqueteVerdict === 'human' ? '#16a34a' : '#dc2626' }}>
                  {multiplayer.enqueteVerdict === 'human'
                    ? "L'enquêteur a pensé que vous étiez humain !"
                    : "L'enquêteur a pensé que vous étiez une IA."}
                </p>
              </div>
            ) : (
              <p className="text-xs mb-8" style={{ color: MUTED }}>Résultat en attente...</p>
            )}
            <div className="flex gap-2">
              <button onClick={playAgain} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: ACCENT }}>Rejouer</button>
              <Link to="/" className="flex-1 py-2.5 rounded-xl text-sm font-medium text-center" style={{ background: PANEL, color: TEXT }}>Menu</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RESULT — ENQUÊTEUR / SOLO ─────────────────────────────────────────────

  if (phase === 'result' && result) {
    const isSolo = session?.aiIsInChat === 'both';
    const sortedEnqueteurs = [...enqueteurScores].sort((a, b) => b.totalPoints - a.totalPoints);
    const userRank = sortedEnqueteurs.findIndex(s => s.userId === currentUser?.id) + 1;
    const userScore = sortedEnqueteurs.find(s => s.userId === currentUser?.id);
    return (
      <div className="min-h-screen py-8 px-6" style={{ background: BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className="max-w-md mx-auto space-y-4">
          <div className="rounded-2xl p-10 text-center" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            {isSolo ? (
              <>
                <p className="text-lg font-bold mb-4" style={{ color: TEXT }}>Les deux étaient des IAs !</p>
                <p className="text-sm mb-1" style={{ color: MUTED }}>A jouait <span style={{ color: ACCENT }}>{personaA?.name}</span></p>
                <p className="text-sm mb-6" style={{ color: MUTED }}>B jouait <span style={{ color: TEAL }}>{personaB?.name}</span></p>
              </>
            ) : result.correct ? (
              <>
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-4" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>✓</div>
                <p className="text-lg font-bold mb-2" style={{ color: '#10b981' }}>Bonne détection !</p>
                <p className="text-sm mb-6" style={{ color: MUTED }}>Vous avez correctement identifié l'IA (interlocuteur {session?.aiIsInChat}).</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>✗</div>
                <p className="text-lg font-bold mb-2" style={{ color: '#ef4444' }}>L'IA vous a dupé !</p>
                <p className="text-sm mb-6" style={{ color: MUTED }}>
                  L'IA était l'interlocuteur <span style={{ color: TEXT, fontWeight: 600 }}>{session?.aiIsInChat}</span>, pas {vote}.
                </p>
              </>
            )}

            <div className="rounded-xl p-5 mb-6" style={{ background: PANEL }}>
              <p className="text-3xl font-bold tabular-nums" style={{ color: TEXT }}>+{result.points}</p>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>points gagnés</p>
              {userScore && (
                <p className="text-sm font-semibold mt-2" style={{ color: TEXT }}>
                  Total : {userScore.totalPoints} pts
                  {userRank > 0 && <span className="ml-2 text-xs font-normal" style={{ color: MUTED }}>— #{userRank} au classement</span>}
                </p>
              )}
              <div className="mt-2 space-y-0.5 text-xs" style={{ color: MUTED }}>
                {result.points >= 2 && <p>Détection correcte : +2 pts</p>}
                {result.points === 3 && <p>Justification argumentée : +1 pt</p>}
                {!result.correct && <p>Aucun point cette fois</p>}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={playAgain} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: ACCENT }}>Rejouer</button>
              <Link to="/" className="flex-1 py-2.5 rounded-xl text-sm font-medium text-center" style={{ background: PANEL, color: TEXT }}>Menu</Link>
            </div>
          </div>

          {sortedEnqueteurs.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="px-5 py-3.5" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6366f1' }}>Classement</p>
              </div>
              <div>
                {sortedEnqueteurs.slice(0, 5).map((score, index) => (
                  <div key={score.userId}
                    className="flex items-center justify-between px-5 py-3"
                    style={{
                      background: score.userId === currentUser?.id ? 'rgba(99,102,241,0.06)' : 'transparent',
                      borderBottom: `1px solid ${BORDER}`,
                      borderLeft: score.userId === currentUser?.id ? '3px solid #6366f1' : '3px solid transparent',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold w-7 tabular-nums"
                        style={{ color: index === 0 ? '#d97706' : index === 1 ? '#78716c' : index === 2 ? '#92400e' : MUTED }}
                      >#{index + 1}</span>
                      <p className="text-sm font-medium" style={{ color: TEXT }}>
                        {score.pseudo}
                        {score.userId === currentUser?.id && (
                          <span className="ml-1.5 text-xs" style={{ color: '#6366f1' }}>vous</span>
                        )}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums" style={{ color: TEXT }}>{score.totalPoints} pts</span>
                  </div>
                ))}
                {userRank > 5 && userScore && (
                  <>
                    <div className="px-5 py-2 text-center" style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <span className="text-xs" style={{ color: MUTED }}>···</span>
                    </div>
                    <div className="flex items-center justify-between px-5 py-3"
                      style={{ background: 'rgba(99,102,241,0.06)', borderLeft: '3px solid #6366f1', borderBottom: `1px solid ${BORDER}` }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold w-7 tabular-nums" style={{ color: MUTED }}>#{userRank}</span>
                        <p className="text-sm font-medium" style={{ color: TEXT }}>
                          {userScore.pseudo} <span className="ml-1.5 text-xs" style={{ color: '#6366f1' }}>vous</span>
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums" style={{ color: TEXT }}>{userScore.totalPoints} pts</span>
                    </div>
                  </>
                )}
              </div>
              <div className="px-5 py-3 text-right" style={{ borderTop: `1px solid ${BORDER}` }}>
                <Link to="/scores" className="text-xs font-medium" style={{ color: '#6366f1' }}>Voir le classement complet →</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ── Chat panel ────────────────────────────────────────────────────────────────

function ChatPanel({
  label, personaName, messages, input, onInputChange, onSend,
  typing, isExpired, accentColor, currentUserId, moderating,
}: {
  label: string; personaName?: string; messages: Message[];
  input: string; onInputChange: (v: string) => void; onSend: () => void;
  typing: boolean; isExpired: boolean; accentColor: string; currentUserId?: string;
  moderating?: boolean;
}) {
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, typing]);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <div className="px-5 py-3.5" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: accentColor }}>
          {label}
          {personaName && <span className="ml-2 normal-case font-normal" style={{ color: MUTED }}>— {personaName}</span>}
        </p>
      </div>
      <div ref={chatRef} className="px-4 py-4 space-y-3"
        style={{ height: '320px', overflowY: 'auto', background: BG }}
      >
        {messages.map(msg => (
          msg.senderId === currentUserId ? (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-xs px-3.5 py-2 text-sm leading-relaxed text-white"
                style={{ background: accentColor, borderRadius: '16px 16px 4px 16px' }}
              >
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={msg.id} className="flex gap-2">
              <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5"
                style={{ background: accentColor }}
              >
                {label.slice(-1)}
              </div>
              <div className="max-w-xs px-3.5 py-2 text-sm leading-relaxed"
                style={{ background: CARD, borderRadius: '4px 16px 16px 16px', color: TEXT, border: `1px solid ${BORDER}` }}
              >
                {msg.content}
              </div>
            </div>
          )
        ))}
        {typing && (
          <div className="flex gap-2 items-center">
            <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
              style={{ background: accentColor }}
            >
              {label.slice(-1)}
            </div>
            <div className="flex gap-1.5 px-3 py-2 rounded-2xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
            </div>
          </div>
        )}
      </div>
      <div className="p-3" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="flex gap-2">
          <input type="text" value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSend()}
            onPaste={e => e.preventDefault()}
            placeholder="Posez votre question..." disabled={isExpired}
            className="flex-1 px-3.5 py-2 rounded-xl text-sm outline-none"
            style={{ background: PANEL, border: `1px solid ${BORDER}`, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
            onFocus={e => (e.currentTarget.style.borderColor = accentColor)}
            onBlur={e => (e.currentTarget.style.borderColor = BORDER)}
          />
          <button onClick={onSend} disabled={!input.trim() || isExpired || moderating}
            className="px-3.5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
            style={{ background: accentColor }}
          >
            {moderating ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
