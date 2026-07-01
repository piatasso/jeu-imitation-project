import type { Persona, Message } from '../types';
import { v4 as uuidv4 } from 'uuid';

// URL de l'API - en production, utilise l'API Vercel, sinon fallback local
const API_URL = import.meta.env.PROD
  ? '/api/chat'
  : (import.meta.env.VITE_API_URL || '/api/chat');

// ============ FALLBACK LOCAL (si l'API ne répond pas) ============

const FILLER_PHRASES = [
  "Hmm, laisse-moi réfléchir...",
  "Alors...",
  "Euh, comment dire...",
  "Ben...",
  "En fait...",
  "Tu vois...",
  "Genre...",
];

const CASUAL_ENDINGS = [
  " lol",
  " mdr",
  " haha",
  " 😊",
  " 😅",
  "",
  "",
  "",
];

const TYPO_CHARS: Record<string, string[]> = {
  'a': ['q', 'z', 's'],
  'e': ['r', 'z', 'd'],
  'i': ['u', 'o', 'k'],
  'o': ['i', 'p', 'l'],
  'u': ['y', 'i', 'j'],
};

function addTypo(text: string, probability: number = 0.1): string {
  if (Math.random() > probability) return text;

  const chars = text.split('');
  const idx = Math.floor(Math.random() * chars.length);
  const char = chars[idx].toLowerCase();

  if (TYPO_CHARS[char]) {
    chars[idx] = TYPO_CHARS[char][Math.floor(Math.random() * TYPO_CHARS[char].length)];
  }

  return chars.join('');
}

function addCasualStyle(text: string): string {
  let result = text;

  if (Math.random() > 0.7) {
    result = result.charAt(0).toLowerCase() + result.slice(1);
  }

  if (Math.random() > 0.6 && !result.endsWith('?') && !result.endsWith('!')) {
    result = result.replace(/\.$/, '') + CASUAL_ENDINGS[Math.floor(Math.random() * CASUAL_ENDINGS.length)];
  }

  return result;
}

function generateLocalResponse(persona: Persona, question: string): string {
  const q = question.toLowerCase();

  if (q.includes('âge') || q.includes('age') || q.includes('ans')) {
    return `J'ai ${persona.age} ans`;
  }

  if (q.includes('prénom') || q.includes('appelle') || q.includes('nom')) {
    return `Moi c'est ${persona.name}`;
  }

  if (q.includes('passion') || q.includes('aime') || q.includes('hobby') || q.includes('temps libre')) {
    const interest = persona.interests[Math.floor(Math.random() * persona.interests.length)];
    const responses = [
      `J'adore ${interest}, j'y passe beaucoup de temps`,
      `En ce moment je suis à fond dans ${interest}`,
      `${interest}, c'est vraiment mon truc`,
      `Je kiffe ${interest} depuis longtemps`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  if (q.includes('école') || q.includes('cours') || q.includes('matière') || q.includes('lycée')) {
    const responses = [
      "Ça dépend des jours, y'a des cours qui me saoulent",
      "C'est ok, rien d'extraordinaire",
      "J'aime bien certaines matières, d'autres moins",
      "Le lycée c'est le lycée quoi",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  if (q.includes('robot') || q.includes('ia') || q.includes('intelligence artificielle') || q.includes('humain')) {
    const responses = [
      "Hein ? Pourquoi tu me demandes ça ?",
      "Euh non je suis un humain normal mdr",
      "C'est quoi cette question bizarre",
      "Tu me prends pour un robot ? 😅",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  const genericResponses = [
    "Pas trop en fait",
    "Ça dépend des fois",
    "Ouais je vois ce que tu veux dire",
    "Hmm je sais pas trop",
    "Bof, moyen",
    "C'est compliqué à expliquer",
  ];

  return genericResponses[Math.floor(Math.random() * genericResponses.length)];
}

async function generateFallbackResponse(persona: Persona, lastQuestion: string): Promise<string> {
  // Note: typing delay is now handled in PlayPage via computeTypingDelay()
  let response = generateLocalResponse(persona, lastQuestion);

  if (Math.random() > 0.7) {
    const filler = FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];
    response = filler + " " + response;
  }

  response = addCasualStyle(response);
  response = addTypo(response, 0.15);

  return response;
}

// ============ API LLM (Groq via Vercel Edge) ============

async function generateAPIResponse(
  persona: Persona,
  conversationHistory: Message[],
  lastQuestion: string,
  pastUserMessages: string[] = []
): Promise<{ response: string; followUp: string | null; followUp2: string | null; usage: { prompt_tokens: number; completion_tokens: number } | null }> {
  console.log('🔄 Appel API:', API_URL);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      persona: {
        name: persona.name,
        age: persona.age,
        description: persona.description,
        traits: persona.traits,
        interests: persona.interests,
        speakingStyle: persona.speakingStyle,
      },
      conversationHistory: conversationHistory.map(m => ({
        content: m.content,
        isFromAI: m.isFromAI,
      })),
      lastQuestion,
      pastUserMessages,
    }),
  });

  console.log('📡 Statut réponse:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Erreur API:', errorText);
    throw new Error(`API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('✅ Réponse reçue:', data);
  return { response: data.response, followUp: data.followUp ?? null, followUp2: data.followUp2 ?? null, usage: data.usage ?? null };
}

// ============ FONCTION PRINCIPALE ============

export async function generateAIResponse(
  persona: Persona,
  conversationHistory: Message[],
  lastQuestion: string,
  pastUserMessages: string[] = []
): Promise<{ response: string; followUp: string | null; followUp2: string | null; usage: { prompt_tokens: number; completion_tokens: number } | null }> {
  try {
    const result = await generateAPIResponse(persona, conversationHistory, lastQuestion, pastUserMessages);
    console.log('✓ Réponse générée par LLM');
    return result;
  } catch (error) {
    console.warn('⚠ API indisponible, fallback local:', error);
    return { response: await generateFallbackResponse(persona, lastQuestion), followUp: null, followUp2: null, usage: null };
  }
}

export function createAIMessage(content: string): Message {
  return {
    id: uuidv4(),
    content,
    senderId: 'ai',
    timestamp: new Date(),
    isFromAI: true,
  };
}
