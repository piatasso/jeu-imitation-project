import { useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';

const BG = '#f5f0e8';
const CARD = '#ffffff';
const PANEL = '#f5f0e8';
const BORDER = 'rgba(0,0,0,0.08)';
const MUTED = '#78716c';
const TEXT = '#1c1917';
const ACCENT = '#6366f1';

export function DashboardPage() {
  const { state, dispatch, logout } = useGame();
  const { currentUser, sessions, votes, personas, enqueteurScores, personaScores, knownUsers } = state;

  const isAdmin = currentUser?.role === 'admin';
  const classFilter = isAdmin ? null : (currentUser?.classId ?? null);

  // Filter data to current class for teachers; admins see everything
  const visibleStudents = knownUsers.filter(u =>
    u.role === 'student' && (classFilter === null || u.classId === classFilter)
  );
  const visibleStudentIds = new Set(visibleStudents.map(u => u.id));

  const visiblePersonas = classFilter
    ? personas.filter(p => {
        const creator = knownUsers.find(u => u.id === p.createdBy);
        return creator?.classId === classFilter;
      })
    : personas;
  const visiblePersonaIds = new Set(visiblePersonas.map(p => p.id));

  const visibleSessions = sessions.filter(s =>
    s.status === 'completed' && (classFilter === null || visibleStudentIds.has(s.enqueteurId))
  );
  const visibleSessionIds = new Set(visibleSessions.map(s => s.id));

  const visibleVotes = votes.filter(v => classFilter === null || visibleSessionIds.has(v.sessionId));

  const visibleEnqueteurScores = enqueteurScores.filter(s =>
    classFilter === null || visibleStudentIds.has(s.userId)
  );
  const visiblePersonaScores = personaScores.filter(s =>
    classFilter === null || visiblePersonaIds.has(s.personaId)
  );

  const [globalUsage, setGlobalUsage] = useState<{
    chat: { promptTokens: number; completionTokens: number };
    persona: { promptTokens: number; completionTokens: number };
  } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [resettingPasswordId, setResettingPasswordId] = useState<string | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [resetStatus, setResetStatus] = useState<{ id: string; ok: boolean } | null>(null);
  const [serverExporting, setServerExporting] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closingClass, setClosingClass] = useState(false);
  const [classClosed, setClassClosed] = useState(false);

  const handleTeacherReset = async (user: typeof visibleStudents[0]) => {
    if (newPasswordInput.trim().length < 8) return;
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'teacher-reset-password', pseudo: user.pseudo, classId: user.classId, newPassword: newPasswordInput.trim() }),
      });
      const data = await res.json() as { result: string };
      setResetStatus({ id: user.id, ok: data.result === 'success' });
    } catch {
      setResetStatus({ id: user.id, ok: false });
    }
    setResettingPasswordId(null);
    setNewPasswordInput('');
    setTimeout(() => setResetStatus(null), 3000);
  };
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; age: string; description: string; traits: string; interests: string; speakingStyle: string }>({ name: '', age: '', description: '', traits: '', interests: '', speakingStyle: '' });

  const startEdit = (p: typeof personas[0]) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, age: String(p.age), description: p.description, traits: p.traits.join(', '), interests: p.interests.join(', '), speakingStyle: p.speakingStyle });
  };

  const saveEdit = (p: typeof personas[0]) => {
    dispatch({ type: 'UPDATE_PERSONA', payload: { ...p, name: editForm.name.trim(), age: parseInt(editForm.age) || p.age, description: editForm.description.trim(), traits: editForm.traits.split(',').map(t => t.trim()).filter(Boolean), interests: editForm.interests.split(',').map(i => i.trim()).filter(Boolean), speakingStyle: editForm.speakingStyle.trim() } });
    setEditingId(null);
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/relay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-usage' }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.chat && data.persona) setGlobalUsage(data);
      })
      .catch(() => {});
  }, [isAdmin]);

  // gpt-4o-mini: $0.15/1M input, $0.60/1M output
  const personaCostUSD = ((globalUsage?.persona.promptTokens ?? 0) * 0.00000015 + (globalUsage?.persona.completionTokens ?? 0) * 0.0000006);
  // gpt-5.5: $5.00/1M input, $30.00/1M output (standard)
  const chatCostUSD = ((globalUsage?.chat.promptTokens ?? 0) * 0.000005 + (globalUsage?.chat.completionTokens ?? 0) * 0.00003);

  const completedSessions = visibleSessions;
  const totalVotes = visibleVotes.length;
  const correctVotes = visibleVotes.filter(v => v.isCorrect).length;
  const avgReliability = visibleEnqueteurScores.length > 0
    ? visibleEnqueteurScores.reduce((acc, s) => acc + s.reliabilityIndex, 0) / visibleEnqueteurScores.length
    : 0;
  const avgCredibility = visiblePersonaScores.length > 0
    ? visiblePersonaScores.reduce((acc, s) => acc + s.credibilityIndex, 0) / visiblePersonaScores.length
    : 0;

  // Personas ranked by convincingness
  const rankedPersonas = visiblePersonaScores
    .filter(s => s.totalSessions > 0)
    .map(s => {
      const persona = personas.find(p => p.id === s.personaId);
      const creator = knownUsers.find(u => u.id === persona?.createdBy);
      return { ...s, personaName: persona?.name || s.personaName, creatorPseudo: creator?.pseudo || '—' };
    })
    .sort((a, b) => b.credibilityIndex - a.credibilityIndex);

  // Detection rate per class (admin only)
  const classSummary = new Map<string, { sessions: number; correct: number; users: Set<string> }>();
  visibleEnqueteurScores.forEach(score => {
    const user = knownUsers.find(u => u.id === score.userId);
    const cls = user?.classId || 'Sans classe';
    if (!classSummary.has(cls)) classSummary.set(cls, { sessions: 0, correct: 0, users: new Set() });
    const c = classSummary.get(cls)!;
    c.sessions += score.totalSessions;
    c.correct += score.correctDetections;
    c.users.add(score.userId);
  });
  const classRows = Array.from(classSummary.entries())
    .map(([cls, data]) => ({
      cls,
      users: data.users.size,
      sessions: data.sessions,
      detectionRate: data.sessions > 0 ? (data.correct / data.sessions) * 100 : 0,
    }))
    .sort((a, b) => b.detectionRate - a.detectionRate);

  type ResearchSession = {
    sessionId: string; timestamp: string; startTime?: string; durationSeconds?: number;
    enqueteurPseudo: string; personaAName: string; personaBName: string;
    aiIsInChat: string; gameMode: string;
    chatA: { from: string; content: string; isFromAI: boolean }[];
    chatB: { from: string; content: string; isFromAI: boolean }[];
    vote: string; isCorrect: boolean; justification: string;
  };

  const fmtDuration = (secs?: number) => {
    if (secs == null) return '—';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m} min ${String(s).padStart(2, '0')} sec` : `${s} sec`;
  };

  const exportServerTXT = async () => {
    setServerExporting(true);
    try {
      const res = await fetch('/api/relay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get-sessions' }) });
      const data = await res.json() as { sessions: ResearchSession[] };
      const sessions = (data.sessions || []).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      let doc = `HISTORIQUE DES CONVERSATIONS — JEU DE L'IMITATION\n`;
      doc += `Exporté le ${dateStr} · ${sessions.length} session${sessions.length !== 1 ? 's' : ''} avec vote\n`;
      doc += `${'='.repeat(64)}\n\n`;
      if (sessions.length === 0) {
        doc += 'Aucune session enregistrée sur le serveur.\n';
      } else {
        sessions.forEach((s, idx) => {
          const sessionDate = new Date(s.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          doc += `SESSION ${idx + 1} — ${sessionDate}\n`;
          doc += `${'-'.repeat(64)}\n`;
          doc += `Enquêteur : ${s.enqueteurPseudo}\n`;
          doc += `Persona A : ${s.personaAName}\n`;
          doc += `Persona B : ${s.personaBName}\n`;
          doc += `IA dans   : Chat ${s.aiIsInChat}\n`;
          doc += `Mode      : ${s.gameMode}\n`;
          doc += `Durée     : ${fmtDuration(s.durationSeconds)}\n\n`;
          const labelA = s.aiIsInChat === 'A' || s.aiIsInChat === 'both' ? '[ CHAT A — IA ]' : '[ CHAT A — HUMAIN ]';
          doc += `${labelA}\n`;
          if (s.chatA.length === 0) doc += '  (aucun message)\n';
          else s.chatA.forEach(m => { doc += `  ${m.from} : ${m.content}\n`; });
          doc += '\n';
          const labelB = s.aiIsInChat === 'B' || s.aiIsInChat === 'both' ? '[ CHAT B — IA ]' : '[ CHAT B — HUMAIN ]';
          doc += `${labelB}\n`;
          if (s.chatB.length === 0) doc += '  (aucun message)\n';
          else s.chatB.forEach(m => { doc += `  ${m.from} : ${m.content}\n`; });
          doc += '\n';
          const verdict = s.isCorrect
            ? `Chat ${s.vote} voté comme IA — CORRECT ✓`
            : `Chat ${s.vote} voté comme IA — INCORRECT ✗ (l'IA était dans Chat ${s.aiIsInChat})`;
          doc += `VERDICT      : ${verdict}\n`;
          doc += `JUSTIFICATION: ${s.justification || '(aucune)'}\n`;
          doc += `\n${'='.repeat(64)}\n\n`;
        });
      }
      const blob = new Blob([doc], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `conversations-serveur-${new Date().toISOString().split('T')[0]}.txt`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { console.error(e); } finally { setServerExporting(false); }
  };

  const exportServerCSV = async () => {
    setServerExporting(true);
    try {
      const res = await fetch('/api/relay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get-sessions' }) });
      const data = await res.json() as { sessions: ResearchSession[] };
      const sessions = (data.sessions || []).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const headers = ['Date', 'Heure', 'Durée', 'Enquêteur', 'Persona A', 'Persona B', 'IA dans', 'Mode', 'Vote', 'Correct', 'Justification', 'Transcript Chat A', 'Transcript Chat B'];
      const rows = sessions.map(s => {
        const tA = s.chatA.map(m => `${m.from}: ${m.content}`).join(' | ');
        const tB = s.chatB.map(m => `${m.from}: ${m.content}`).join(' | ');
        const dt = new Date(s.timestamp);
        return [
          dt.toLocaleDateString('fr-FR'),
          dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          fmtDuration(s.durationSeconds),
          s.enqueteurPseudo, s.personaAName, s.personaBName,
          s.aiIsInChat, s.gameMode, s.vote,
          s.isCorrect ? 'Oui' : 'Non',
          `"${s.justification.replace(/"/g, '""')}"`,
          `"${tA.replace(/"/g, '""')}"`,
          `"${tB.replace(/"/g, '""')}"`,
        ];
      });
      const csv = '﻿' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `conversations-serveur-${new Date().toISOString().split('T')[0]}.csv`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { console.error(e); } finally { setServerExporting(false); }
  };

  const closeClass = async () => {
    setClosingClass(true);
    const top3 = [...visibleEnqueteurScores]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 3)
      .map((s, i) => ({ rank: i + 1, pseudo: s.pseudo, points: s.totalPoints }));
    try {
      await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close-class', classId: currentUser?.classId, podium: top3 }),
      });
      setClassClosed(true);
    } catch (e) { console.error(e); }
    setClosingClass(false);
    setShowCloseConfirm(false);
  };

  const downloadSessionTXT = (session: typeof completedSessions[0]) => {
    const vote = visibleVotes.find(v => v.sessionId === session.id);
    const pA = personas.find(p => p.id === session.personaIdA);
    const pB = personas.find(p => p.id === session.personaIdB);
    const enqueteur = knownUsers.find(u => u.id === session.enqueteurId);
    const sessionDate = new Date(session.startTime).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    let doc = `SESSION — ${sessionDate}\n${'='.repeat(64)}\n`;
    doc += `Enquêteur : ${enqueteur?.pseudo || session.enqueteurId}\n`;
    doc += `Persona A : ${pA?.name || '?'}${pA ? `, ${pA.age} ans` : ''}\n`;
    doc += `Persona B : ${pB?.name || '?'}${pB ? `, ${pB.age} ans` : ''}\n`;
    doc += `IA dans   : Chat ${session.aiIsInChat}\n\n`;

    const labelA = session.aiIsInChat === 'A' || session.aiIsInChat === 'both' ? '[ CHAT A — IA ]' : '[ CHAT A — HUMAIN ]';
    doc += `${labelA}\n`;
    if (session.messages.chatA.length === 0) doc += '  (aucun message)\n';
    else session.messages.chatA.forEach(msg => {
      const sender = msg.isFromAI ? (pA?.name || 'IA') : (enqueteur?.pseudo || 'Enquêteur');
      doc += `  ${sender} : ${msg.content}\n`;
    });
    doc += '\n';

    const labelB = session.aiIsInChat === 'B' || session.aiIsInChat === 'both' ? '[ CHAT B — IA ]' : '[ CHAT B — HUMAIN ]';
    doc += `${labelB}\n`;
    if (session.messages.chatB.length === 0) doc += '  (aucun message)\n';
    else session.messages.chatB.forEach(msg => {
      const sender = msg.isFromAI ? (pB?.name || 'IA') : (enqueteur?.pseudo || 'Enquêteur');
      doc += `  ${sender} : ${msg.content}\n`;
    });
    doc += '\n';

    if (vote) {
      const verdict = vote.isCorrect
        ? `Chat ${vote.votedChat} voté comme IA — CORRECT ✓`
        : `Chat ${vote.votedChat} voté comme IA — INCORRECT ✗ (l'IA était dans Chat ${session.aiIsInChat})`;
      doc += `VERDICT      : ${verdict}\n`;
      doc += `JUSTIFICATION: ${vote.justification || '(aucune)'}\n`;
    } else {
      doc += `VERDICT      : Aucun vote enregistré\n`;
    }

    const blob = new Blob([doc], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (enqueteur?.pseudo || 'session').replace(/[^a-z0-9]/gi, '_');
    a.download = `session-${safeName}-${new Date(session.startTime).toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportData = () => {
    const data = {
      exportDate: new Date().toISOString(),
      statistics: { totalSessions: completedSessions.length, totalVotes, correctVotes, avgReliability, avgCredibility },
      enqueteurScores: visibleEnqueteurScores,
      personaScores: visiblePersonaScores,
      sessions: completedSessions.map(s => {
        const vote = visibleVotes.find(v => v.sessionId === s.id);
        const pA = personas.find(p => p.id === s.personaIdA);
        const pB = personas.find(p => p.id === s.personaIdB);
        const enqueteur = knownUsers.find(u => u.id === s.enqueteurId);
        return {
          id: s.id,
          date: new Date(s.startTime).toLocaleDateString('fr-FR'),
          enqueteur: enqueteur?.pseudo || s.enqueteurId,
          personaA: pA?.name || s.personaIdA,
          personaB: pB?.name || s.personaIdB,
          gameMode: s.gameMode,
          startTime: s.startTime,
          endTime: s.endTime,
          aiWasIn: s.aiIsInChat,
          chatA: s.messages.chatA.map(m => ({ from: m.isFromAI ? (pA?.name || 'IA') : (enqueteur?.pseudo || 'Enquêteur'), text: m.content })),
          chatB: s.messages.chatB.map(m => ({ from: m.isFromAI ? (pB?.name || 'IA') : (enqueteur?.pseudo || 'Enquêteur'), text: m.content })),
          vote: vote ? { votedChat: vote.votedChat, correct: vote.isCorrect, justification: vote.justification } : null,
        };
      }),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jeu-imitation-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportConversationsTXT = () => {
    const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    let doc = `HISTORIQUE DES CONVERSATIONS — JEU DE L'IMITATION\n`;
    doc += `Exporté le ${dateStr}\n`;
    doc += `${'='.repeat(64)}\n\n`;

    if (completedSessions.length === 0) {
      doc += 'Aucune session terminée.\n';
    } else {
      completedSessions.forEach((session, idx) => {
        const vote = visibleVotes.find(v => v.sessionId === session.id);
        const pA = personas.find(p => p.id === session.personaIdA);
        const pB = personas.find(p => p.id === session.personaIdB);
        const enqueteur = knownUsers.find(u => u.id === session.enqueteurId);
        const sessionDate = new Date(session.startTime).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        doc += `SESSION ${idx + 1} — ${sessionDate}\n`;
        doc += `${'-'.repeat(64)}\n`;
        doc += `Enquêteur : ${enqueteur?.pseudo || session.enqueteurId}\n`;
        doc += `Persona A : ${pA?.name || '?'}${pA ? `, ${pA.age} ans` : ''}\n`;
        doc += `Persona B : ${pB?.name || '?'}${pB ? `, ${pB.age} ans` : ''}\n`;
        doc += `IA dans   : Chat ${session.aiIsInChat}\n\n`;

        const labelA = session.aiIsInChat === 'A' || session.aiIsInChat === 'both' ? '[ CHAT A — IA ]' : '[ CHAT A — HUMAIN ]';
        doc += `${labelA}\n`;
        if (session.messages.chatA.length === 0) {
          doc += '  (aucun message)\n';
        } else {
          session.messages.chatA.forEach(msg => {
            const sender = msg.isFromAI ? (pA?.name || 'IA') : (enqueteur?.pseudo || 'Enquêteur');
            doc += `  ${sender} : ${msg.content}\n`;
          });
        }
        doc += '\n';

        const labelB = session.aiIsInChat === 'B' || session.aiIsInChat === 'both' ? '[ CHAT B — IA ]' : '[ CHAT B — HUMAIN ]';
        doc += `${labelB}\n`;
        if (session.messages.chatB.length === 0) {
          doc += '  (aucun message)\n';
        } else {
          session.messages.chatB.forEach(msg => {
            const sender = msg.isFromAI ? (pB?.name || 'IA') : (enqueteur?.pseudo || 'Enquêteur');
            doc += `  ${sender} : ${msg.content}\n`;
          });
        }
        doc += '\n';

        if (vote) {
          const verdict = vote.isCorrect
            ? `Chat ${vote.votedChat} voté comme IA — CORRECT ✓`
            : `Chat ${vote.votedChat} voté comme IA — INCORRECT ✗ (l'IA était dans Chat ${session.aiIsInChat})`;
          doc += `VERDICT      : ${verdict}\n`;
          doc += `JUSTIFICATION: ${vote.justification || '(aucune)'}\n`;
        } else {
          doc += `VERDICT      : Aucun vote enregistré\n`;
        }

        doc += `\n${'='.repeat(64)}\n\n`;
      });
    }

    const blob = new Blob([doc], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversations-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportConversationsCSV = () => {
    const headers = ['Session', 'Date', 'Enquêteur', 'Persona A', 'Persona B', 'IA dans', 'Chat', 'Expéditeur', 'Type', 'Message', 'Vote (chat)', 'Vote correct', 'Justification'];
    const rows: string[][] = [];

    completedSessions.forEach((session, idx) => {
      const vote = visibleVotes.find(v => v.sessionId === session.id);
      const pA = personas.find(p => p.id === session.personaIdA);
      const pB = personas.find(p => p.id === session.personaIdB);
      const enqueteur = knownUsers.find(u => u.id === session.enqueteurId);
      const date = new Date(session.startTime).toLocaleDateString('fr-FR');
      const sessionNum = String(idx + 1);
      const votedChat = vote?.votedChat ?? '';
      const correct = vote ? (vote.isCorrect ? 'Oui' : 'Non') : '';
      const justification = (vote?.justification ?? '').replace(/"/g, '""');

      const addMsgs = (msgs: typeof session.messages.chatA, chat: 'A' | 'B') => {
        msgs.forEach(msg => {
          const persona = chat === 'A' ? pA : pB;
          const sender = msg.isFromAI ? (persona?.name || 'IA') : (enqueteur?.pseudo || 'Enquêteur');
          rows.push([
            sessionNum, date,
            enqueteur?.pseudo || '',
            pA?.name || '', pB?.name || '',
            session.aiIsInChat, chat, sender,
            msg.isFromAI ? 'IA' : 'Humain',
            `"${msg.content.replace(/"/g, '""')}"`,
            votedChat, correct,
            `"${justification}"`,
          ]);
        });
      };

      addMsgs(session.messages.chatA, 'A');
      addMsgs(session.messages.chatB, 'B');
    });

    const csv = '﻿' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const headers = ['Pseudo', 'Sessions', 'Détections correctes', 'Points', 'Bonus', 'Fiabilité %'];
    const rows = visibleEnqueteurScores.map(s => [
      s.pseudo, s.totalSessions, s.correctDetections, s.totalPoints, s.bonusPoints, s.reliabilityIndex.toFixed(1),
    ]);
    const csv = '﻿' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enqueteurs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const TABS = [
    { id: 'overview', label: 'Vue d\'ensemble' },
    { id: 'users', label: 'Utilisateurs' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'personas', label: 'Personnas' },
    ...(isAdmin ? [{ id: 'accounts', label: 'Comptes' }] : []),
    ...(isAdmin ? [{ id: 'export', label: 'Export' }] : []),
  ] as const satisfies readonly { id: string; label: string }[];

  return (
    <div
      className="min-h-screen"
      style={{ background: BG, color: TEXT, fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-bold tracking-tight" style={{ color: TEXT }}>Jeu de l'Imitation</span>
            <span style={{ color: MUTED }}>·</span>
            <h1 className="text-xl font-bold" style={{ color: TEXT }}>Enseignants</h1>
          </div>
          <div className="flex items-center gap-2">
            {classClosed ? (
              <span className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>
                Session terminée
              </span>
            ) : (
              <button
                onClick={() => setShowCloseConfirm(true)}
                className="text-sm px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: '#dc2626', border: '1px solid #fca5a5', background: '#fef2f2' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fef2f2')}
              >
                Terminer la session
              </button>
            )}
            <button
              onClick={logout}
              className="text-sm transition-colors px-3 py-1.5 rounded-lg"
              style={{ color: MUTED, border: `1px solid ${BORDER}` }}
              onMouseEnter={e => (e.currentTarget.style.color = TEXT)}
              onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
            >
              Se déconnecter
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 p-1 rounded-xl w-fit" style={{ background: PANEL }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activeTab === tab.id ? CARD : 'transparent',
                color: activeTab === tab.id ? TEXT : MUTED,
                boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px mb-4 rounded-2xl overflow-hidden" style={{ background: BORDER }}>
              {[
                { label: 'Sessions terminées', value: completedSessions.length, color: TEXT },
                { label: 'Votes', value: `${correctVotes}/${totalVotes}`, color: '#0891b2' },
                { label: 'Fiabilité moy.', value: `${avgReliability.toFixed(0)}%`, color: '#d97706' },
                { label: 'Crédibilité moy.', value: `${avgCredibility.toFixed(0)}%`, color: '#db2777' },
              ].map(({ label, value, color }) => (
                <div key={label} className="px-6 py-5" style={{ background: CARD }}>
                  <p className="text-3xl font-bold tabular-nums" style={{ color }}>{value}</p>
                  <p className="text-xs mt-1" style={{ color: MUTED }}>{label}</p>
                </div>
              ))}
            </div>

            {isAdmin && (
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl px-5 py-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: MUTED }}>Création de personas</p>
                  <p className="text-xs mb-3" style={{ color: MUTED }}>gpt-4o-mini</p>
                  <p className="text-2xl font-bold tabular-nums mb-1" style={{ color: '#059669' }}>${personaCostUSD.toFixed(4)}</p>
                  <p className="text-xs" style={{ color: MUTED }}>
                    {(globalUsage?.persona.promptTokens ?? 0).toLocaleString()} in · {(globalUsage?.persona.completionTokens ?? 0).toLocaleString()} out
                  </p>
                </div>
                <div className="rounded-2xl px-5 py-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: MUTED }}>Chatbot en jeu</p>
                  <p className="text-xs mb-3" style={{ color: MUTED }}>gpt-5.5</p>
                  <p className="text-2xl font-bold tabular-nums mb-1" style={{ color: '#059669' }}>${chatCostUSD.toFixed(4)}</p>
                  <p className="text-xs" style={{ color: MUTED }}>
                    {(globalUsage?.chat.promptTokens ?? 0).toLocaleString()} in · {(globalUsage?.chat.completionTokens ?? 0).toLocaleString()} out
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-2xl p-6 mb-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-6" style={{ color: MUTED }}>
                Distribution des scores
              </p>
              <div className="mb-6">
                <p className="text-sm mb-2" style={{ color: MUTED }}>Répartition des détections</p>
                <div className="flex h-5 rounded-full overflow-hidden" style={{ background: PANEL }}>
                  <div
                    style={{
                      width: `${totalVotes > 0 ? (correctVotes / totalVotes) * 100 : 0}%`,
                      background: ACCENT,
                    }}
                  />
                  <div
                    style={{
                      width: `${totalVotes > 0 ? ((totalVotes - correctVotes) / totalVotes) * 100 : 0}%`,
                      background: '#db2777',
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs mt-2">
                  <span style={{ color: ACCENT }}>Correctes ({correctVotes})</span>
                  <span style={{ color: '#db2777' }}>Incorrectes ({totalVotes - correctVotes})</span>
                </div>
              </div>
              <div>
                <p className="text-sm mb-3" style={{ color: MUTED }}>Top enquêteurs</p>
                <div className="space-y-2">
                  {visibleEnqueteurScores
                    .sort((a, b) => b.totalPoints - a.totalPoints)
                    .slice(0, 10)
                    .map((score, i) => (
                      <div key={score.userId} className="flex items-center gap-3">
                        <span className="w-7 text-xs tabular-nums" style={{ color: MUTED }}>#{i + 1}</span>
                        <span className="w-28 truncate text-sm" style={{ color: TEXT }}>{score.pseudo}</span>
                        <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: PANEL }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(score.totalPoints / Math.max(...visibleEnqueteurScores.map(s => s.totalPoints), 1)) * 100}%`,
                              background: ACCENT,
                            }}
                          />
                        </div>
                        <span className="w-14 text-right text-xs tabular-nums" style={{ color: MUTED }}>{score.totalPoints} pts</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Analytics row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Ranked personas */}
              <div className="rounded-2xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: MUTED }}>
                  Personas les plus convaincants
                </p>
                <p className="text-xs mb-5" style={{ color: MUTED }}>Ceux qui ont le mieux trompé les enquêteurs</p>
                {rankedPersonas.length === 0 ? (
                  <p className="text-sm" style={{ color: MUTED }}>Aucune session jouée pour l'instant.</p>
                ) : (
                  <div className="space-y-3">
                    {rankedPersonas.slice(0, 8).map((s, i) => (
                      <div key={s.personaId}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs tabular-nums w-5" style={{ color: MUTED }}>#{i + 1}</span>
                            <span className="text-sm font-medium truncate max-w-[130px]" style={{ color: '#db2777' }}>{s.personaName}</span>
                            <span className="text-xs" style={{ color: MUTED }}>par {s.creatorPseudo}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-bold tabular-nums" style={{ color: '#10b981' }}>{s.credibilityIndex.toFixed(0)}%</span>
                            <span className="text-xs ml-1" style={{ color: MUTED }}>{s.totalSessions} partie{s.totalSessions !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: PANEL }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${s.credibilityIndex}%`, background: '#10b981' }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detection rate per class */}
              <div className="rounded-2xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: MUTED }}>
                  Détection par classe
                </p>
                <p className="text-xs mb-5" style={{ color: MUTED }}>Taux de détection moyen des enquêteurs par groupe</p>
                {classRows.length === 0 ? (
                  <p className="text-sm" style={{ color: MUTED }}>Aucune donnée de classe disponible.</p>
                ) : (
                  <div className="space-y-3">
                    {classRows.map(row => (
                      <div key={row.cls}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium" style={{ color: TEXT }}>{row.cls}</span>
                            <span className="text-xs" style={{ color: MUTED }}>{row.users} élève{row.users !== 1 ? 's' : ''} · {row.sessions} partie{row.sessions !== 1 ? 's' : ''}</span>
                          </div>
                          <span className="text-sm font-bold tabular-nums" style={{ color: ACCENT }}>{row.detectionRate.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: PANEL }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${row.detectionRate}%`, background: ACCENT }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Users */}
        {activeTab === 'users' && (() => {
          // Group by pseudo (case-insensitive), only visible students
          const groups = new Map<string, typeof visibleStudents>();
          [...visibleStudents]
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .forEach(u => {
              const key = u.pseudo.toLowerCase();
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(u);
            });
          const groupEntries = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

          return (
            <div>
              <p className="text-xs mb-4" style={{ color: MUTED }}>
                {groupEntries.length} utilisateur{groupEntries.length !== 1 ? 's' : ''} · {visibleStudents.length} compte{visibleStudents.length !== 1 ? 's' : ''}
              </p>
              {groupEntries.length === 0 ? (
                <p className="py-8 text-sm" style={{ color: MUTED }}>Aucun utilisateur enregistré.</p>
              ) : (
                <div className="space-y-2">
                  {groupEntries.map(([key, users]) => {
                    const displayName = users[0].pseudo;
                    const isOpen = expandedUserId === key;
                    // Aggregate sessions + personas across all accounts with this name
                    // Also match any persona whose creator pseudo matches, even if UUID isn't in this group
                    const allUserIds = new Set(users.map(u => u.id));
                    const pseudoLower = displayName.toLowerCase();
                    const groupPersonas = personas.filter(p => {
                      if (allUserIds.has(p.createdBy)) return true;
                      const creator = knownUsers.find(u => u.id === p.createdBy);
                      return creator?.pseudo.toLowerCase() === pseudoLower;
                    });
                    const groupSessionList = sessions
                      .filter(s => allUserIds.has(s.enqueteurId) && s.status === 'completed')
                      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
                    const groupPersonaCount = groupPersonas.length;
                    const isSelfGroup = users.some(u => u.id === currentUser?.id);

                    return (
                      <div key={key} className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
                        {/* Clickable name row */}
                        <button
                          className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
                          style={{ background: isOpen ? PANEL : CARD }}
                          onClick={() => setExpandedUserId(isOpen ? null : key)}
                          onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = PANEL; }}
                          onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = CARD; }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold" style={{ color: TEXT }}>{displayName}</span>
                            {isSelfGroup && (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${ACCENT}15`, color: ACCENT }}>vous</span>
                            )}
                            <span className="text-xs" style={{ color: MUTED }}>
                              {groupSessionList.length} session{groupSessionList.length !== 1 ? 's' : ''} · {groupPersonaCount} persona{groupPersonaCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <svg
                            className="w-4 h-4 shrink-0 transition-transform"
                            style={{ color: MUTED, transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* Expanded content */}
                        {isOpen && (
                          <div style={{ borderTop: `1px solid ${BORDER}`, background: `${ACCENT}04` }}>
                            {/* Per-account summary (school / class / role / delete) */}
                            {users.map((user, idx) => {
                              const isSelf = user.id === currentUser?.id;
                              return (
                                <div
                                  key={user.id}
                                  className="flex items-center justify-between px-5 py-3 text-xs"
                                  style={{ borderBottom: idx < users.length - 1 ? `1px solid ${BORDER}` : undefined }}
                                >
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span className="font-medium" style={{ color: TEXT }}>{user.schoolId || 'Aucun établissement'}</span>
                                    {user.classId && <span style={{ color: MUTED }}>{user.classId}</span>}
                                    <span className="px-1.5 py-0.5 rounded-full" style={{
                                      background: user.role === 'teacher' ? '#fef3c7' : PANEL,
                                      color: user.role === 'teacher' ? '#d97706' : MUTED,
                                    }}>
                                      {user.role === 'teacher' ? 'Enseignant' : 'Élève'}
                                    </span>
                                    <span style={{ color: MUTED }}>Inscrit le {new Date(user.createdAt).toLocaleDateString('fr-FR')}</span>
                                  </div>
                                  {!isSelf && (
                                    <div className="flex items-center gap-1 shrink-0 ml-4">
                                      {resetStatus?.id === user.id && (
                                        <span className="text-xs px-2 py-1 rounded-lg" style={{ background: resetStatus.ok ? '#dcfce7' : '#fee2e2', color: resetStatus.ok ? '#16a34a' : '#dc2626' }}>
                                          {resetStatus.ok ? 'Mot de passe modifié' : 'Erreur'}
                                        </span>
                                      )}
                                      {resettingPasswordId === user.id ? (
                                        <>
                                          <input
                                            type="password"
                                            placeholder="Nouveau mot de passe"
                                            value={newPasswordInput}
                                            onChange={e => setNewPasswordInput(e.target.value)}
                                            className="px-2 py-1 rounded-lg text-xs border"
                                            style={{ background: PANEL, color: TEXT, borderColor: BORDER, width: 160 }}
                                            autoFocus
                                          />
                                          <button
                                            onClick={() => handleTeacherReset(user)}
                                            disabled={newPasswordInput.trim().length < 8}
                                            className="px-2.5 py-1 rounded-lg font-medium text-white"
                                            style={{ background: newPasswordInput.trim().length >= 8 ? ACCENT : MUTED }}
                                          >OK</button>
                                          <button
                                            onClick={() => { setResettingPasswordId(null); setNewPasswordInput(''); }}
                                            className="px-2.5 py-1 rounded-lg"
                                            style={{ background: PANEL, color: MUTED }}
                                          >✕</button>
                                        </>
                                      ) : deletingUserId === user.id ? (
                                        <>
                                          <button
                                            onClick={() => { dispatch({ type: 'DELETE_USER', payload: user.id }); setDeletingUserId(null); }}
                                            className="px-2.5 py-1 rounded-lg font-medium text-white"
                                            style={{ background: '#dc2626' }}
                                          >Confirmer</button>
                                          <button
                                            onClick={() => setDeletingUserId(null)}
                                            className="px-2.5 py-1 rounded-lg"
                                            style={{ background: PANEL, color: MUTED }}
                                          >Annuler</button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => { setResettingPasswordId(user.id); setNewPasswordInput(''); }}
                                            className="px-2.5 py-1 rounded-lg transition-colors"
                                            style={{ background: PANEL, color: MUTED }}
                                            onMouseEnter={e => { e.currentTarget.style.background = `${ACCENT}20`; e.currentTarget.style.color = ACCENT; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = PANEL; e.currentTarget.style.color = MUTED; }}
                                          >Réinitialiser mdp</button>
                                          <button
                                            onClick={() => setDeletingUserId(user.id)}
                                            className="px-2.5 py-1 rounded-lg transition-colors"
                                            style={{ background: PANEL, color: MUTED }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = PANEL; e.currentTarget.style.color = MUTED; }}
                                          >Supprimer</button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Session list */}
                            <div className="px-5 py-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                              {groupSessionList.length === 0 ? (
                                <p className="text-xs" style={{ color: MUTED }}>Aucune session jouée.</p>
                              ) : (
                                <>
                                  <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: MUTED }}>Sessions</p>
                                  <div className="space-y-1.5">
                                    {groupSessionList.map(s => {
                                      const vote = visibleVotes.find(v => v.sessionId === s.id);
                                      const aiPersona = personas.find(p => p.id === (s.aiIsInChat === 'A' ? s.personaIdA : s.personaIdB));
                                      return (
                                        <div key={s.id} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg" style={{ background: CARD }}>
                                          <div className="flex items-center gap-3">
                                            <span style={{ color: MUTED }}>{new Date(s.startTime).toLocaleDateString('fr-FR')}</span>
                                            {aiPersona && <span style={{ color: '#db2777' }}>{aiPersona.name}</span>}
                                            <span style={{ color: MUTED }}>IA dans chat {s.aiIsInChat}</span>
                                          </div>
                                          {vote ? (
                                            vote.isCorrect
                                              ? <span style={{ color: ACCENT }}>✓ détecté</span>
                                              : <span style={{ color: '#db2777' }}>✗ trompé</span>
                                          ) : (
                                            <span style={{ color: '#d97706' }}>sans vote</span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>
                              )}

                              {/* Personas created by this user group */}
                              {(() => {
                                if (groupPersonas.length === 0) return null;
                                return (
                                  <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                                    <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: MUTED }}>Personas créés</p>
                                    <div className="space-y-1.5">
                                      {groupPersonas.map(p => {
                                        const ps = visiblePersonaScores.find(s => s.personaId === p.id);
                                        return (
                                          <div key={p.id} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg" style={{ background: CARD }}>
                                            <div className="flex items-center gap-3">
                                              <span className="font-medium" style={{ color: '#db2777' }}>{p.name}, {p.age} ans</span>
                                              {p.traits.slice(0, 2).map(t => (
                                                <span key={t} className="px-1.5 py-0.5 rounded-full" style={{ background: `${ACCENT}10`, color: ACCENT }}>{t}</span>
                                              ))}
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                              {ps && ps.totalSessions > 0 ? (
                                                <>
                                                  <span style={{ color: MUTED }}>{ps.totalSessions} partie{ps.totalSessions !== 1 ? 's' : ''}</span>
                                                  <span style={{ color: '#10b981' }}>{ps.credibilityIndex.toFixed(0)}% crédibilité</span>
                                                </>
                                              ) : (
                                                <span style={{ color: MUTED }}>pas encore joué</span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-xs mt-4" style={{ color: MUTED }}>
                Supprimer un compte supprime aussi ses personas, ses sessions et ses votes.
              </p>
            </div>
          );
        })()}

        {/* Sessions */}
        {activeTab === 'sessions' && (
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            <div className="px-6 py-4" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
                Historique des sessions
              </p>
            </div>
            {completedSessions.length === 0 ? (
              <p className="px-6 py-8 text-sm" style={{ color: MUTED, background: BG }}>Aucune session terminée</p>
            ) : (
              <div className="overflow-x-auto" style={{ background: BG }}>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                      {['ID', 'Personna', 'IA dans', 'Messages', 'Date', 'Résultat', 'Justification', ''].map(h => (
                        <th key={h} className="px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {completedSessions.map(session => {
                      const vote = visibleVotes.find(v => v.sessionId === session.id);
                      const personaA = personas.find(p => p.id === session.personaIdA);
                      const personaB = personas.find(p => p.id === session.personaIdB);
                      return (
                        <tr key={session.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                          <td className="px-5 py-3 font-mono text-xs" style={{ color: MUTED }}>{session.id.slice(0, 8)}…</td>
                          <td className="px-5 py-3" style={{ color: '#db2777' }}>{personaA?.name || '?'} / {personaB?.name || '?'}</td>
                          <td className="px-5 py-3" style={{ color: MUTED }}>Chat {session.aiIsInChat}</td>
                          <td className="px-5 py-3" style={{ color: MUTED }}>A:{session.messages.chatA.length} / B:{session.messages.chatB.length}</td>
                          <td className="px-5 py-3" style={{ color: MUTED }}>{new Date(session.startTime).toLocaleDateString('fr-FR')}</td>
                          <td className="px-5 py-3">
                            {vote ? (
                              vote.isCorrect
                                ? <span style={{ color: ACCENT }}>✓ Correcte</span>
                                : <span style={{ color: '#db2777' }}>✗ Incorrecte</span>
                            ) : (
                              <span style={{ color: '#d97706' }}>En attente</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-xs" style={{ color: TEXT, maxWidth: '280px' }}>
                            {vote?.justification
                              ? <span title={vote.justification}>{vote.justification.length > 100 ? vote.justification.slice(0, 100) + '…' : vote.justification}</span>
                              : <span style={{ color: MUTED }}>—</span>
                            }
                          </td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => downloadSessionTXT(session)}
                              className="text-xs px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                              style={{ background: PANEL, color: MUTED, border: `1px solid ${BORDER}` }}
                              onMouseEnter={e => { e.currentTarget.style.background = `${ACCENT}10`; e.currentTarget.style.color = ACCENT; }}
                              onMouseLeave={e => { e.currentTarget.style.background = PANEL; e.currentTarget.style.color = MUTED; }}
                            >
                              ↓ .txt
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Personas */}
        {activeTab === 'personas' && (
          <div>
            <p className="text-xs mb-4" style={{ color: MUTED }}>{visiblePersonas.length} persona{visiblePersonas.length !== 1 ? 's' : ''} créé{visiblePersonas.length !== 1 ? 's' : ''}</p>
            {visiblePersonas.length === 0 ? (
              <p className="py-8 text-sm" style={{ color: MUTED }}>Aucun persona créé pour l'instant.</p>
            ) : (
              <div className="space-y-3">
                {visiblePersonas.map(persona => {
                  const score = visiblePersonaScores.find(s => s.personaId === persona.id);
                  return (
                    <div key={persona.id} className="rounded-2xl p-5" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="text-sm font-bold" style={{ color: '#db2777' }}>{persona.name}, {persona.age} ans</h3>
                          <p className="text-xs mt-0.5" style={{ color: MUTED }}>{persona.classId || '—'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {score ? (
                            <div className="text-right">
                              <p className="text-lg font-bold tabular-nums" style={{ color: '#0891b2' }}>{score.credibilityIndex.toFixed(0)}%</p>
                              <p className="text-xs" style={{ color: MUTED }}>crédibilité · {score.totalSessions} session{score.totalSessions !== 1 ? 's' : ''}</p>
                              {score.consecutiveWins > 0 && (
                                <p className="text-xs mt-0.5" style={{ color: '#10b981' }}>{score.consecutiveWins} victoire{score.consecutiveWins !== 1 ? 's' : ''} consécutive{score.consecutiveWins !== 1 ? 's' : ''}</p>
                              )}
                              {score.bonusPointsEarned > 0 && (
                                <p className="text-xs font-semibold" style={{ color: '#10b981' }}>+{score.bonusPointsEarned} pts bonus créateur</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-lg" style={{ background: PANEL, color: MUTED }}>Pas encore joué</span>
                          )}
                          {deletingId === persona.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { dispatch({ type: 'DELETE_PERSONA', payload: persona.id }); setDeletingId(null); }}
                                className="text-xs px-2.5 py-1 rounded-lg font-medium text-white"
                                style={{ background: '#dc2626' }}
                              >
                                Supprimer
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="text-xs px-2.5 py-1 rounded-lg"
                                style={{ background: PANEL, color: MUTED }}
                              >
                                Annuler
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => startEdit(persona)}
                                className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                                style={{ background: PANEL, color: MUTED }}
                                onMouseEnter={e => { e.currentTarget.style.background = `${ACCENT}15`; e.currentTarget.style.color = ACCENT; }}
                                onMouseLeave={e => { e.currentTarget.style.background = PANEL; e.currentTarget.style.color = MUTED; }}
                              >
                                Modifier
                              </button>
                              <button
                                onClick={() => setDeletingId(persona.id)}
                                className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                                style={{ background: PANEL, color: MUTED }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = PANEL; e.currentTarget.style.color = MUTED; }}
                              >
                                Supprimer
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {persona.description && (
                        <p className="text-xs mb-2 leading-relaxed" style={{ color: MUTED }}>{persona.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {persona.traits.map(t => (
                          <span key={t} className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${ACCENT}10`, color: ACCENT }}>{t}</span>
                        ))}
                        {persona.interests.map(i => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${PANEL}`, color: MUTED }}>{i}</span>
                        ))}
                      </div>
                      {persona.speakingStyle && editingId !== persona.id && (
                        <p className="text-xs mt-2 italic" style={{ color: MUTED }}>"{persona.speakingStyle.slice(0, 120)}{persona.speakingStyle.length > 120 ? '…' : ''}"</p>
                      )}

                      {editingId === persona.id && (
                        <div className="mt-4 space-y-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Prénom</label>
                              <input className="retro-input text-xs" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Âge</label>
                              <input className="retro-input text-xs" type="number" min={14} max={19} value={editForm.age} onChange={e => setEditForm(f => ({ ...f, age: e.target.value }))} />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Description</label>
                            <textarea className="retro-input text-xs w-full resize-none" rows={2} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Traits (séparés par des virgules)</label>
                            <input className="retro-input text-xs" value={editForm.traits} onChange={e => setEditForm(f => ({ ...f, traits: e.target.value }))} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Centres d'intérêt (séparés par des virgules)</label>
                            <input className="retro-input text-xs" value={editForm.interests} onChange={e => setEditForm(f => ({ ...f, interests: e.target.value }))} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Style d'expression</label>
                            <textarea className="retro-input text-xs w-full resize-none" rows={2} value={editForm.speakingStyle} onChange={e => setEditForm(f => ({ ...f, speakingStyle: e.target.value }))} />
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => saveEdit(persona)}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                              style={{ background: ACCENT }}
                            >
                              Sauvegarder
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-xs px-3 py-1.5 rounded-lg"
                              style={{ background: PANEL, color: MUTED }}
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Accounts (admin only) */}
        {activeTab === 'accounts' && (
          <div>
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
              <div className="px-6 py-4 flex items-center justify-between" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: MUTED }}>
                  Comptes élèves enregistrés
                </p>
                <p className="text-xs" style={{ color: MUTED }}>
                  {knownUsers.filter(u => u.role === 'student').length} compte{knownUsers.filter(u => u.role === 'student').length !== 1 ? 's' : ''}
                </p>
              </div>
              {knownUsers.filter(u => u.role === 'student').length === 0 ? (
                <p className="px-6 py-8 text-sm" style={{ color: MUTED, background: BG }}>Aucun compte élève enregistré.</p>
              ) : (
                <div className="overflow-x-auto" style={{ background: BG }}>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                        {['Pseudo', 'Classe', 'Mot de passe', 'Créé le'].map(h => (
                          <th key={h} className="px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {knownUsers
                        .filter(u => u.role === 'student')
                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                        .map(u => (
                          <tr key={u.id} style={{ borderBottom: `1px solid ${BORDER}`, background: CARD }}>
                            <td className="px-5 py-3 font-semibold text-sm" style={{ color: TEXT }}>{u.pseudo}</td>
                            <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{u.classId || <span style={{ color: BORDER }}>—</span>}</td>
                            <td className="px-5 py-3 font-mono text-sm" style={{ color: '#059669' }}>{u.password || <span style={{ color: MUTED, fontFamily: 'inherit' }}>—</span>}</td>
                            <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{new Date(u.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs" style={{ color: MUTED }}>
              Seul l'administrateur peut voir cette page. Les mots de passe sont les dates de naissance des élèves (format jjmmaaaa).
            </p>
          </div>
        )}

        {/* Export */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            {/* Research export — server-side */}
            <div className="rounded-2xl p-6" style={{ background: CARD, border: `2px solid ${ACCENT}` }}>
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-sm font-bold" style={{ color: TEXT }}>Export recherche (serveur)</h3>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${ACCENT}15`, color: ACCENT }}>Toutes les classes</span>
              </div>
              <p className="text-xs mb-4" style={{ color: MUTED }}>
                Conversations collectées depuis tous les appareils — uniquement les sessions où l'élève a voté.
                Inclut les transcriptions complètes et les justifications.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={exportServerTXT}
                  disabled={serverExporting}
                  className="py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: ACCENT }}
                  onMouseEnter={e => { if (!serverExporting) e.currentTarget.style.background = '#4f46e5'; }}
                  onMouseLeave={e => (e.currentTarget.style.background = ACCENT)}
                >
                  {serverExporting ? 'Chargement…' : 'Télécharger .txt (lisible)'}
                </button>
                <button
                  onClick={exportServerCSV}
                  disabled={serverExporting}
                  className="py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                  style={{ background: PANEL, border: `1px solid ${BORDER}`, color: ACCENT }}
                  onMouseEnter={e => { if (!serverExporting) e.currentTarget.style.background = `${ACCENT}10`; }}
                  onMouseLeave={e => (e.currentTarget.style.background = PANEL)}
                >
                  {serverExporting ? 'Chargement…' : 'Télécharger .csv (Excel)'}
                </button>
              </div>
            </div>

            {/* Conversations */}
            <div className="rounded-2xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <h3 className="text-sm font-bold mb-1" style={{ color: TEXT }}>Historique des conversations</h3>
              <p className="text-xs mb-4" style={{ color: MUTED }}>
                Transcriptions complètes (Chat A + Chat B), verdict (chat voté comme IA, correct ou non) et justification de l'enquêteur.
                {completedSessions.length > 0 && <span className="ml-1 font-medium" style={{ color: TEXT }}>{completedSessions.length} session{completedSessions.length !== 1 ? 's' : ''} disponible{completedSessions.length !== 1 ? 's' : ''}.</span>}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={exportConversationsTXT}
                  disabled={completedSessions.length === 0}
                  className="py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: TEXT }}
                  onMouseEnter={e => { if (completedSessions.length > 0) e.currentTarget.style.background = '#374151'; }}
                  onMouseLeave={e => (e.currentTarget.style.background = TEXT)}
                >
                  Télécharger .txt (lisible)
                </button>
                <button
                  onClick={exportConversationsCSV}
                  disabled={completedSessions.length === 0}
                  className="py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                  style={{ background: PANEL, border: `1px solid ${BORDER}`, color: '#0891b2' }}
                  onMouseEnter={e => { if (completedSessions.length > 0) e.currentTarget.style.background = '#e0f2fe'; }}
                  onMouseLeave={e => (e.currentTarget.style.background = PANEL)}
                >
                  Télécharger .csv (Excel)
                </button>
              </div>
            </div>

            {/* Other exports */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <h3 className="text-sm font-bold mb-2" style={{ color: TEXT }}>Export JSON (complet)</h3>
                <p className="text-xs mb-4" style={{ color: MUTED }}>
                  Toutes les données brutes : sessions avec messages, votes, scores.
                </p>
                <button
                  onClick={exportData}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-white"
                  style={{ background: ACCENT }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#4f46e5')}
                  onMouseLeave={e => (e.currentTarget.style.background = ACCENT)}
                >
                  Télécharger JSON
                </button>
              </div>
              <div className="rounded-2xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <h3 className="text-sm font-bold mb-2" style={{ color: TEXT }}>Export CSV (scores enquêteurs)</h3>
                <p className="text-xs mb-4" style={{ color: MUTED }}>
                  Tableau des scores par élève. Compatible Excel / Google Sheets.
                </p>
                <button
                  onClick={exportCSV}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ background: PANEL, border: `1px solid ${BORDER}`, color: '#0891b2' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#e0f2fe')}
                  onMouseLeave={e => (e.currentTarget.style.background = PANEL)}
                >
                  Télécharger CSV
                </button>
              </div>
            </div>

            <div className="rounded-2xl p-6" style={{ background: CARD, border: `1px solid rgba(217,119,6,0.3)` }}>
              <h3 className="text-sm font-bold mb-2" style={{ color: '#d97706' }}>Conformité RGPD</h3>
              <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                Données anonymisées (pseudonymes uniquement). Aucune donnée personnelle identifiable.
                Stockage local sur votre appareil (localStorage).
              </p>
            </div>
          </div>
        )}
      </div>

      {showCloseConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: '#fff', borderRadius: 20, padding: '2rem',
            maxWidth: 460, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1c1917', marginBottom: 12 }}>
              Terminer la session ?
            </h2>
            <p style={{ fontSize: 14, color: '#78716c', marginBottom: 16, lineHeight: 1.6 }}>
              Cette action est <strong style={{ color: '#1c1917' }}>irréversible</strong>. Elle va :
            </p>
            <ul style={{ fontSize: 14, color: '#78716c', lineHeight: 2.2, paddingLeft: 20, marginBottom: 28 }}>
              <li>Empêcher les élèves de lancer de nouvelles parties</li>
              <li>Afficher le podium final sur leurs écrans</li>
              <li>Arrêter la collecte de données pour cette classe</li>
            </ul>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCloseConfirm(false)}
                disabled={closingClass}
                style={{
                  padding: '10px 20px', borderRadius: 12,
                  border: `1px solid ${BORDER}`, background: PANEL,
                  color: MUTED, fontWeight: 600, cursor: 'pointer',
                  fontSize: 14, fontFamily: 'inherit',
                }}
              >
                Annuler
              </button>
              <button
                onClick={closeClass}
                disabled={closingClass}
                style={{
                  padding: '10px 20px', borderRadius: 12,
                  border: 'none', background: '#dc2626',
                  color: 'white', fontWeight: 600,
                  cursor: closingClass ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontFamily: 'inherit',
                  opacity: closingClass ? 0.7 : 1,
                }}
              >
                {closingClass ? 'Fermeture…' : 'Terminer la session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

