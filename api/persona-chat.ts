export const config = { runtime: 'edge' };

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function redisCall(...args: unknown[]): Promise<unknown> {
  if (!KV_URL || !KV_TOKEN) return null;
  const res = await fetch(`${KV_URL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await res.json() as { result: unknown };
  return data.result;
}

async function trackUsage(promptTokens: number, completionTokens: number): Promise<void> {
  if (!KV_URL || !KV_TOKEN || (!promptTokens && !completionTokens)) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    await fetch(`${KV_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCRBY', 'usage:persona:promptTokens', String(promptTokens)],
        ['INCRBY', 'usage:persona:completionTokens', String(completionTokens)],
      ]),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (error) {
    console.error('Failed to track token usage:', error);
  }
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface RequestBody {
  conversationHistory: Array<{ content: string; isFromUser: boolean }>;
  userMessage?: string;
  mode: 'chat' | 'extract';
}

const CHAT_SYSTEM_PROMPT = `Tu aides un(e) lycéen(ne) à créer un personnage fictif pour le "Jeu de l'Imitation" — un test de Turing pédagogique où une IA incarnera ce personnage, et d'autres élèves devront distinguer l'IA d'un humain.

RÈGLE ABSOLUE : Le personnage doit être un(e) lycéen(ne) entre 14 et 19 ans. Si l'élève propose un adulte, une célébrité ou un perso de fiction, refuse gentiment et rappelle la règle.

COMMENT TU FONCTIONNES :
Tu mènes une conversation naturelle avec l'élève pour l'aider à décrire son personnage fictif. Tu parles du personnage à la troisième personne (il/elle, "ton personnage", "ce personnage") — jamais à la première personne comme si l'élève était le personnage. L'élève CRÉE un personnage, il ne l'incarne pas.

Exemples de bonnes formulations :
- "Il/elle a des expressions qu'il/elle répète souvent ?"
- "Ton personnage, il écoute quoi comme musique ?"
- "Comment est-ce qu'il/elle écrit ses textos ?"

Exemples à ÉVITER :
- "Tu as des expressions que tu utilises souvent ?" ← confond l'élève avec le personnage
- "Comment tu textes ?" ← idem

THÈMES À EXPLORER (dans n'importe quel ordre, selon la conversation) :
- Prénom et âge du personnage
- Sa personnalité, ce qu'il/elle aime faire
- Ses centres d'intérêt, ce qu'il/elle écoute ou regarde
- Une habitude ou un trait qui le/la caractérise un peu
- Une opinion ou un avis sur quelque chose, même banal

RÈGLE CRITIQUE — RÉFÉRENCES CULTURELLES :
Quand l'élève mentionne un nom propre (YouTuber, artiste, émission, marque, jeu, etc.), ne suppose JAMAIS ce que ça représente. Pose une question de suivi pour comprendre ce que c'est et ce que le personnage y apprécie. Exemples :
- "Hugo Décrypte, c'est quoi comme contenu ? Politique, actu, autre chose ?"
- "Khaby Lame, ton personnage aime ça pour quelle raison — l'humour, le style ?"
- "C'est quoi l'ambiance de ce jeu / ce son ?"
L'objectif : obtenir une description de CE QUE LE PERSONNAGE SAIT ET APPRÉCIE dans cette référence, pas juste le nom.

RÈGLE CRITIQUE — LINGO ET EXPRESSIONS :
Quand l'élève donne des mots ou expressions du personnage, ne suppose pas leur sens ou leur usage. Demande :
- Dans quel contexte le personnage dit ça — pour quoi, avec qui ?
- C'est plutôt positif, négatif, neutre ?
- Il/elle le dit souvent ou juste dans certaines situations ?
L'objectif : comprendre COMMENT et QUAND utiliser ces mots, pas juste les stocker.

QUESTIONS DE PERSONNALITÉ — à glisser naturellement dans la conversation pour creuser qui est vraiment ce personnage :
- "Il/elle est plutôt du genre à parler beaucoup ou à observer ?"
- "Quelqu'un qui le/la connaît bien dirait quoi sur lui/elle en un mot ?"
- "Il/elle gère comment quand quelque chose le/la met mal à l'aise ?"
- "C'est quoi le truc qui l'énerve le plus chez les gens ?"
- "Il/elle est loyal(e) envers ses amis ou plutôt indépendant(e) ?"
- "Face à un inconnu, il/elle est plutôt froid(e), sympa direct, ou ça dépend ?"
- "C'est quoi son humeur par défaut — chill, stressé(e), ironique, enthousiaste ?"
Ne pose pas toutes ces questions — choisis 2 ou 3 selon ce qui manque dans le portrait déjà esquissé.

QUESTION OBLIGATOIRE — à poser à un moment naturel de la conversation :
Son langage et son lingo : est-ce que ce personnage a des expressions qu'il/elle répète souvent ? Du verlan, des mots de son groupe d'amis ? Comment il/elle écrit ses textos — court ou long, avec ou sans emojis, des abréviations ?

ATTITUDE :
- Accepte les réponses telles qu'elles viennent, mais creuse dès qu'un nom propre ou un mot de slang apparaît.
- Ne demande jamais deux choses en même temps.
- Montre de l'intérêt pour ce que l'élève dit, rebondis dessus.
- 1 à 3 phrases max par réponse.

LANGAGE : Décontracté, naturel, à l'aise avec l'argot et les abréviations (mdr, tkt, jsp, wsh...) — ne les corrige jamais. Français uniquement.`;

const EXTRACT_SYSTEM_PROMPT = `Tu extrais des informations structurées depuis une conversation de création de personnage.

Retourne UNIQUEMENT un objet JSON valide (sans markdown, sans backtick) avec cette structure exacte :
{"name":"prénom","age":16,"description":"description précise","traits":["trait1","trait2","trait3"],"interests":["intérêt1","intérêt2"],"speakingStyle":"style détaillé"}

Règles de remplissage :
- name : prénom du personnage
- age : entier entre 14 et 19
- description : 2-3 phrases qui résument la personnalité et ce qui rend ce personnage intéressant
- traits : 3-5 traits de caractère mentionnés dans la conversation
- interests : liste des centres d'intérêt, chaque entrée doit inclure CE QUE LE PERSONNAGE SAIT/APPRÉCIE dans cet intérêt — pas juste un nom. Ex : "Hugo Décrypte (actualité internationale, géopolitique, vulgarisation — pas sport)" plutôt que "Hugo Décrypte". Si la conversation a fourni ce contexte, utilise-le. Sinon, note uniquement ce qui a été dit, sans inventer.
- speakingStyle : style de communication — inclure les expressions avec leur CONTEXTE D'USAGE (quand, avec qui, dans quel sens) tel que décrit dans la conversation. Ex : "dit 'c'est validé' pour approuver quelque chose, surtout avec ses amis proches" plutôt que juste "dit 'c'est validé'". Ajouter aussi : longueur des messages, emojis, abréviations. Si rien n'a été dit, invente quelque chose de cohérent.

Si une info manque, invente quelque chose de cohérent avec ce qui a été dit — jamais générique.
Retourne UNIQUEMENT le JSON brut, aucun autre texte.`;

export default async function handler(request: Request): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const rateLimitKey = `ratelimit:persona:${ip}`;
  const count = await redisCall('INCR', rateLimitKey) as number | null;
  if (count === 1) await redisCall('EXPIRE', rateLimitKey, '3600');
  if (count !== null && count > 20) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Réessaie dans une heure.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const body: RequestBody = await request.json();
    const { conversationHistory, userMessage, mode } = body;

    let messages: ChatMessage[];

    if (mode === 'extract') {
      const transcript = conversationHistory
        .map(m => `${m.isFromUser ? 'Élève' : 'Assistant'}: ${m.content}`)
        .join('\n');
      messages = [
        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
        { role: 'user', content: `Conversation:\n${transcript}` },
      ];
    } else {
      messages = [{ role: 'system', content: CHAT_SYSTEM_PROMPT }];
      for (const msg of conversationHistory.slice(-14)) {
        messages.push({
          role: msg.isFromUser ? 'user' : 'assistant',
          content: msg.content,
        });
      }
      if (userMessage) {
        messages.push({ role: 'user', content: userMessage });
      }
    }

    const openaiController = new AbortController();
    const openaiTimeoutId = setTimeout(() => openaiController.abort(), 25000);
    let groqRes: Response;
    try {
      groqRes = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          max_tokens: mode === 'extract' ? 400 : 200,
          temperature: mode === 'extract' ? 0.1 : 0.85,
        }),
        signal: openaiController.signal,
      });
    } catch (fetchError) {
      return new Response(JSON.stringify({ error: 'LLM timeout', details: String(fetchError) }), {
        status: 504,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } finally {
      clearTimeout(openaiTimeoutId);
    }

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error('[persona-chat] OpenAI error', groqRes.status, err);
      return new Response(JSON.stringify({ error: 'LLM error', status: groqRes.status, details: err }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const data = await groqRes.json();
    const response = data.choices?.[0]?.message?.content ?? '';
    const usage = data.usage ?? null;
    if (usage) await trackUsage(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0);

    return new Response(JSON.stringify({ response, usage }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('[persona-chat] Internal error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
