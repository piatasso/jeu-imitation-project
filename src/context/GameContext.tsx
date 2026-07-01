import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User, Persona, ChatSession, Vote, EnqueteurScore, PersonaScore, GameState } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_PERSONAS } from '../utils/defaultPersonas';

type Action =
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'REGISTER_USER'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'ADD_PERSONA'; payload: Persona }
  | { type: 'UPDATE_PERSONA'; payload: Persona }
  | { type: 'DELETE_PERSONA'; payload: string }
  | { type: 'DELETE_USER'; payload: string }
  | { type: 'ADD_SESSION'; payload: ChatSession }
  | { type: 'UPDATE_SESSION'; payload: ChatSession }
  | { type: 'ADD_VOTE'; payload: Vote }
  | { type: 'UPDATE_SCORES' }
  | { type: 'SEED_DEFAULTS' }
  | { type: 'LOAD_STATE'; payload: GameState }
  | { type: 'ADD_TOKEN_USAGE'; payload: { promptTokens: number; completionTokens: number } };

const initialState: GameState = {
  currentUser: null,
  knownUsers: [],
  personas: [],
  sessions: [],
  votes: [],
  enqueteurScores: [],
  personaScores: [],
  apiUsage: { promptTokens: 0, completionTokens: 0 },
};

function calculatePersonaScores(sessions: ChatSession[], votes: Vote[], personas: Persona[]): PersonaScore[] {
  const scoreMap = new Map<string, PersonaScore>();

  personas.forEach(persona => {
    scoreMap.set(persona.id, {
      personaId: persona.id,
      personaName: persona.name,
      classId: persona.classId,
      totalSessions: 0,
      timesDetectedAsAI: 0,
      credibilityIndex: 100,
      consecutiveWins: 0,
      bonusPointsEarned: 0,
      qualitativeNotes: [],
    });
  });

  const completedSessions = sessions
    .filter(s => s.status === 'completed')
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  completedSessions.forEach(session => {
    [session.personaIdA, session.personaIdB].forEach(pid => {
      const score = scoreMap.get(pid);
      if (score) score.totalSessions++;
    });

    const vote = votes.find(v => v.sessionId === session.id);
    if (vote) {
      const detectedPersonaId = vote.votedChat === 'A' ? session.personaIdA : session.personaIdB;
      const detectedScore = scoreMap.get(detectedPersonaId);
      if (detectedScore) detectedScore.timesDetectedAsAI++;
    }

    // Track consecutive wins for the AI persona in this session
    if (session.aiIsInChat !== 'both' && vote) {
      const aiPersonaId = session.aiIsInChat === 'A' ? session.personaIdA : session.personaIdB;
      const aiScore = scoreMap.get(aiPersonaId);
      if (aiScore) {
        const personaWon = vote.votedChat !== session.aiIsInChat; // enquêteur got it wrong
        if (personaWon) {
          aiScore.consecutiveWins++;
          if (aiScore.consecutiveWins % 3 === 0) {
            aiScore.bonusPointsEarned += 2;
          }
        } else {
          aiScore.consecutiveWins = 0;
        }
      }
    }
  });

  scoreMap.forEach(score => {
    score.credibilityIndex = score.totalSessions > 0
      ? ((score.totalSessions - score.timesDetectedAsAI) / score.totalSessions) * 100
      : 100;
  });

  return Array.from(scoreMap.values());
}

function buildCreatorBonusMap(personaScores: PersonaScore[], personas: Persona[]): Map<string, number> {
  const bonusMap = new Map<string, number>();
  personaScores.forEach(ps => {
    if (ps.bonusPointsEarned === 0) return;
    const persona = personas.find(p => p.id === ps.personaId);
    if (!persona?.createdBy) return;
    bonusMap.set(persona.createdBy, (bonusMap.get(persona.createdBy) ?? 0) + ps.bonusPointsEarned);
  });
  return bonusMap;
}

function calculateEnqueteurScores(
  sessions: ChatSession[],
  votes: Vote[],
  knownUsers: User[],
  creatorBonuses: Map<string, number>
): EnqueteurScore[] {
  const scoreMap = new Map<string, EnqueteurScore>();

  votes.forEach(vote => {
    const session = sessions.find(s => s.id === vote.sessionId);
    if (!session || session.status !== 'completed') return;

    let isCorrect = false;
    if (session.aiIsInChat === 'both') {
      isCorrect = true;
    } else {
      isCorrect = vote.votedChat === session.aiIsInChat;
    }

    if (!scoreMap.has(vote.enqueteurId)) {
      const user = knownUsers.find(u => u.id === vote.enqueteurId);
      scoreMap.set(vote.enqueteurId, {
        userId: vote.enqueteurId,
        pseudo: user?.pseudo || vote.enqueteurId,
        totalSessions: 0,
        correctDetections: 0,
        bonusPoints: 0,
        creatorBonusPoints: 0,
        totalPoints: 0,
        reliabilityIndex: 0,
      });
    }

    const score = scoreMap.get(vote.enqueteurId)!;
    score.totalSessions++;

    if (isCorrect) {
      score.correctDetections++;
      score.totalPoints += 2;
      if (vote.justification && vote.justification.length > 50) {
        score.bonusPoints++;
        score.totalPoints++;
      }
    }

    score.reliabilityIndex = score.totalSessions > 0
      ? (score.correctDetections / score.totalSessions) * 100
      : 0;
  });

  // Add creator bonus points from personas
  creatorBonuses.forEach((bonus, userId) => {
    if (!scoreMap.has(userId)) {
      const user = knownUsers.find(u => u.id === userId);
      if (!user) return;
      scoreMap.set(userId, {
        userId,
        pseudo: user.pseudo,
        totalSessions: 0,
        correctDetections: 0,
        bonusPoints: 0,
        creatorBonusPoints: 0,
        totalPoints: 0,
        reliabilityIndex: 0,
      });
    }
    const score = scoreMap.get(userId)!;
    score.creatorBonusPoints = bonus;
    score.totalPoints += bonus;
  });

  return Array.from(scoreMap.values());
}

function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SET_USER': {
      if (!action.payload) return { ...state, currentUser: null };
      const exists = state.knownUsers.some(u => u.id === action.payload!.id);
      return {
        ...state,
        currentUser: action.payload,
        knownUsers: exists ? state.knownUsers : [...state.knownUsers, action.payload],
      };
    }

    case 'REGISTER_USER': {
      const exists = state.knownUsers.some(u => u.id === action.payload.id);
      return {
        ...state,
        knownUsers: exists ? state.knownUsers : [...state.knownUsers, action.payload],
      };
    }

    case 'LOGOUT':
      return { ...state, currentUser: null };

    case 'ADD_PERSONA':
      return { ...state, personas: [...state.personas, action.payload] };

    case 'UPDATE_PERSONA':
      return {
        ...state,
        personas: state.personas.map(p =>
          p.id === action.payload.id ? action.payload : p
        ),
      };

    case 'DELETE_PERSONA':
      return {
        ...state,
        personas: state.personas.filter(p => p.id !== action.payload),
      };

    case 'DELETE_USER': {
      const userId = action.payload;
      const remainingPersonas = state.personas.filter(p => p.createdBy !== userId);
      const remainingPersonaIds = new Set(remainingPersonas.map(p => p.id));
      const remainingSessions = state.sessions.filter(
        s => s.enqueteurId !== userId && remainingPersonaIds.has(s.personaIdA)
      );
      const remainingSessionIds = new Set(remainingSessions.map(s => s.id));
      const remainingVotes = state.votes.filter(
        v => v.enqueteurId !== userId && remainingSessionIds.has(v.sessionId)
      );
      const newPersonaScores = calculatePersonaScores(remainingSessions, remainingVotes, remainingPersonas);
      const creatorBonuses = buildCreatorBonusMap(newPersonaScores, remainingPersonas);
      const newKnownUsers = state.knownUsers.filter(u => u.id !== userId);
      return {
        ...state,
        knownUsers: newKnownUsers,
        personas: remainingPersonas,
        sessions: remainingSessions,
        votes: remainingVotes,
        personaScores: newPersonaScores,
        enqueteurScores: calculateEnqueteurScores(remainingSessions, remainingVotes, newKnownUsers, creatorBonuses),
      };
    }

    case 'ADD_SESSION':
      return { ...state, sessions: [...state.sessions, action.payload] };

    case 'UPDATE_SESSION':
      return {
        ...state,
        sessions: state.sessions.map(s =>
          s.id === action.payload.id ? action.payload : s
        ),
      };

    case 'ADD_VOTE': {
      const newVotes = [...state.votes, action.payload];
      const newPersonaScores = calculatePersonaScores(state.sessions, newVotes, state.personas);
      const creatorBonuses = buildCreatorBonusMap(newPersonaScores, state.personas);
      return {
        ...state,
        votes: newVotes,
        personaScores: newPersonaScores,
        enqueteurScores: calculateEnqueteurScores(state.sessions, newVotes, state.knownUsers, creatorBonuses),
      };
    }

    case 'UPDATE_SCORES': {
      const updatedPersonaScores = calculatePersonaScores(state.sessions, state.votes, state.personas);
      const updatedCreatorBonuses = buildCreatorBonusMap(updatedPersonaScores, state.personas);
      return {
        ...state,
        personaScores: updatedPersonaScores,
        enqueteurScores: calculateEnqueteurScores(state.sessions, state.votes, state.knownUsers, updatedCreatorBonuses),
      };
    }

    case 'SEED_DEFAULTS': {
      const existingDefaultIds = state.personas.filter(p => p.isDefault).map(p => p.id);
      const newDefaults = DEFAULT_PERSONAS.filter(d => !existingDefaultIds.includes(d.id));
      return {
        ...state,
        personas: [...state.personas, ...newDefaults],
      };
    }

    case 'LOAD_STATE':
      return { ...initialState, ...action.payload };

    case 'ADD_TOKEN_USAGE':
      return {
        ...state,
        apiUsage: {
          promptTokens: (state.apiUsage?.promptTokens ?? 0) + action.payload.promptTokens,
          completionTokens: (state.apiUsage?.completionTokens ?? 0) + action.payload.completionTokens,
        },
      };

    default:
      return state;
  }
}

interface GameContextType {
  state: GameState;
  dispatch: React.Dispatch<Action>;
  login: (pseudo: string, role: 'student' | 'teacher' | 'admin', password?: string, classId?: string) => Promise<'success' | 'wrong_password' | 'not_found'>;
  loginAsGuest: () => void;
  register: (pseudo: string, password: string, classId?: string, email?: string) => Promise<'success' | 'already_exists'>;
  logout: () => void;
  createPersona: (persona: Omit<Persona, 'id' | 'createdAt' | 'createdBy'>) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const STORAGE_KEY = 'jeu-imitation-state';

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Load saved state on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        dispatch({ type: 'LOAD_STATE', payload: parsed });
      } catch (e) {
        console.error('Erreur lors du chargement des données:', e);
      }
    }
    // Always seed defaults (will skip if already present)
    dispatch({ type: 'SEED_DEFAULTS' });
  }, []);

  // Persist state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const login = async (pseudo: string, role: 'student' | 'teacher' | 'admin', password?: string, classId?: string): Promise<'success' | 'wrong_password' | 'not_found'> => {
    if (role === 'teacher' || role === 'admin') {
      const defaultPseudo = role === 'teacher' ? 'Enseignant' : 'Administrateur';
      const existingUser = state.knownUsers.find(u => u.role === role);
      if (existingUser) {
        dispatch({ type: 'SET_USER', payload: { ...existingUser, classId } });
      } else {
        dispatch({ type: 'SET_USER', payload: { id: uuidv4(), pseudo: defaultPseudo, role, classId, createdAt: new Date() } });
      }
      return 'success';
    }

    // Always verify student credentials against Redis (source of truth for passwords)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', pseudo: pseudo.trim(), password: password?.trim(), classId: classId?.trim() }),
      });
      const data = await res.json();
      if (data.result === 'success' && data.user) {
        const user: User = {
          id: data.user.id,
          pseudo: data.user.pseudo,
          role: 'student',
          email: data.user.email,
          classId: data.user.classId || undefined,
          createdAt: new Date(data.user.createdAt),
        };
        dispatch({ type: 'SET_USER', payload: user });
        return 'success';
      }
      return data.result as 'not_found' | 'wrong_password';
    } catch {
      return 'not_found';
    }
  };

  const register = async (pseudo: string, password: string, classId?: string, email?: string): Promise<'success' | 'already_exists'> => {
    const norm = (s: string | undefined) => (s ?? '').trim().toUpperCase();
    const exists = state.knownUsers.some(
      u => u.role === 'student' &&
           u.pseudo.toLowerCase().trim() === pseudo.toLowerCase().trim() &&
           norm(u.classId) === norm(classId)
    );
    if (exists) return 'already_exists';

    const normalizedClassId = classId?.trim().toUpperCase() || undefined;
    const userId = uuidv4();

    // Save to Redis first
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', id: userId, pseudo: pseudo.trim(), password: password.trim(), classId: normalizedClassId, email: email?.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (data.result === 'already_exists') return 'already_exists';
    } catch {
      // Redis unavailable — still register locally
    }

    const user: User = { id: userId, pseudo: pseudo.trim(), role: 'student', email: email?.trim().toLowerCase(), classId: normalizedClassId, createdAt: new Date() };
    dispatch({ type: 'REGISTER_USER', payload: user });
    return 'success';
  };

  const loginAsGuest = () => {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const guest: User = {
      id: uuidv4(),
      pseudo: `Invité-${suffix}`,
      role: 'student',
      isGuest: true,
      createdAt: new Date(),
    };
    dispatch({ type: 'SET_USER', payload: guest });
  };

  const logout = () => {
    dispatch({ type: 'LOGOUT' });
  };

  const createPersona = (personaData: Omit<Persona, 'id' | 'createdAt' | 'createdBy'>) => {
    if (!state.currentUser) return;

    const persona: Persona = {
      ...personaData,
      id: uuidv4(),
      createdBy: state.currentUser.id,
      createdAt: new Date(),
    };
    dispatch({ type: 'ADD_PERSONA', payload: persona });
  };

  return (
    <GameContext.Provider value={{ state, dispatch, login, loginAsGuest, register, logout, createPersona }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
