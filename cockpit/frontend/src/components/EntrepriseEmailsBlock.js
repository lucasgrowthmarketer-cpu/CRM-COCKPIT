import React, { useState, useEffect, useCallback } from 'react';
import api, { formatApiError } from '../lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Mail, Copy, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Send, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * EntrepriseEmailsBlock
 * Affiche pour une entreprise toutes ses tâches email (cold + relances) en pending,
 * avec extraction du sujet/destinataire/corps depuis le champ description, et
 * boutons "Copier le corps" + "Marquer envoyé".
 *
 * Props:
 *  - entrepriseId: string (uuid)
 *  - entrepriseNom: string (pour les toasts et messages)
 */
export default function EntrepriseEmailsBlock({ entrepriseId, entrepriseNom }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(new Set());

  const fetchTasks = useCallback(async () => {
    if (!entrepriseId) return;
    setLoading(true);
    try {
      // Récupérer toutes les tâches de cette entreprise (pending + done)
      const { data } = await api.get('/tasks', {
        params: { prospect_id: entrepriseId, limit: 200 },
      });
      const all = Array.isArray(data) ? data : (data?.data || []);
      // Filtrer canal email et trier par date
      const emailTasks = all
        .filter((t) => t.channel === 'email')
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
      setTasks(emailTasks);
    } catch (e) {
      toast.error(formatApiError(e));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [entrepriseId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const toggleExpand = (taskId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleCopyBody = async (task) => {
    const parsed = parseEmailDescription(task.description || '');
    const body = parsed.body || task.description || '';
    if (!body) {
      toast.error("Pas de corps d'email à copier");
      return;
    }
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Corps de l'email copié dans le presse-papier");
    } catch (e) {
      // Fallback : sélection texte
      toast.error('Impossible de copier automatiquement. Sélectionne le texte manuellement.');
    }
  };

  const handleCopySubject = async (task) => {
    const parsed = parseEmailDescription(task.description || '');
    const subject = parsed.subject || task.title || '';
    try {
      await navigator.clipboard.writeText(subject);
      toast.success('Sujet copié');
    } catch {
      toast.error('Impossible de copier');
    }
  };

  const handleMarkSent = async (task) => {
    if (!window.confirm(`Marquer "${task.title}" comme envoyée ?`)) return;
    try {
      await api.post(`/tasks/${task.id}/complete`, {
        outcome: 'sent',
        create_followup: false,
      });
      toast.success('Tâche marquée envoyée');
      fetchTasks();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-sm text-brand-text-secondary">
        Chargement des emails…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-brand-text-secondary">
        <Mail className="w-8 h-8 mx-auto mb-2 opacity-30" />
        Aucun email préparé pour cette entreprise.
      </div>
    );
  }

  const pending = tasks.filter((t) => t.status === 'pending');
  const done = tasks.filter((t) => t.status === 'done');

  return (
    <div className="space-y-4" data-testid="entreprise-emails-block">
      {pending.length > 0 && (
        <div>
          <div className="font-jetbrains text-[10px] uppercase tracking-wider font-bold text-brand-primary mb-2">
            À envoyer ({pending.length})
          </div>
          <div className="space-y-2">
            {pending.map((t) => (
              <EmailTaskRow
                key={t.id}
                task={t}
                expanded={expandedIds.has(t.id)}
                onToggle={() => toggleExpand(t.id)}
                onCopyBody={() => handleCopyBody(t)}
                onCopySubject={() => handleCopySubject(t)}
                onMarkSent={() => handleMarkSent(t)}
              />
            ))}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <div>
          <div className="font-jetbrains text-[10px] uppercase tracking-wider font-bold text-brand-text-secondary mb-2">
            Déjà envoyés ({done.length})
          </div>
          <div className="space-y-2">
            {done.map((t) => (
              <EmailTaskRow
                key={t.id}
                task={t}
                expanded={expandedIds.has(t.id)}
                onToggle={() => toggleExpand(t.id)}
                onCopyBody={() => handleCopyBody(t)}
                onCopySubject={() => handleCopySubject(t)}
                onMarkSent={null}
                muted
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Single email task row
// ============================================================
function EmailTaskRow({ task, expanded, onToggle, onCopyBody, onCopySubject, onMarkSent, muted = false }) {
  const parsed = parseEmailDescription(task.description || '');
  const dateLabel = formatTaskDate(task.due_date);
  const isOverdue = task.status === 'pending' && new Date(task.due_date) < new Date();
  const hasBody = !!parsed.body;
  const hasUncertainEmail = parsed.warning && parsed.warning.includes('incertain');

  return (
    <div
      className={`bg-white rounded-md border ${
        isOverdue ? 'border-orange-300 bg-orange-50/30' : 'border-brand-border'
      } ${muted ? 'opacity-70' : ''}`}
      data-testid={`email-task-${task.id}`}
    >
      <div
        className="flex items-center gap-2.5 p-3 cursor-pointer"
        onClick={onToggle}
      >
        <div className={`w-7 h-7 rounded-full ${muted ? 'bg-gray-400' : 'bg-brand-primary'} text-white flex items-center justify-center shrink-0`}>
          <Mail className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold text-brand-text-primary truncate ${muted ? 'line-through' : ''}`}>
            {task.title}
          </div>
          <div className="text-[11px] text-brand-text-secondary truncate flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            {dateLabel}
            {parsed.destinataire && (
              <>
                <span>·</span>
                <span className="truncate">{parsed.destinataire}</span>
              </>
            )}
            {hasUncertainEmail && (
              <Badge variant="outline" className="text-[9px] py-0 h-4 border-orange-400 text-orange-600 ml-1">
                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                Email incertain
              </Badge>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-brand-text-secondary" /> : <ChevronDown className="w-4 h-4 text-brand-text-secondary" />}
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-brand-border bg-brand-bg/30">
          {/* Métadonnées */}
          <div className="space-y-1 mt-2 text-xs font-inter">
            {parsed.subject && (
              <div className="flex items-start gap-2">
                <span className="font-jetbrains text-[10px] text-brand-text-secondary uppercase shrink-0 w-20 pt-0.5">Sujet</span>
                <span className="font-medium text-brand-text-primary flex-1">{parsed.subject}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={(e) => { e.stopPropagation(); onCopySubject(); }}
                  data-testid={`copy-subject-${task.id}`}
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copier
                </Button>
              </div>
            )}
            {parsed.destinataire && (
              <div className="flex items-start gap-2">
                <span className="font-jetbrains text-[10px] text-brand-text-secondary uppercase shrink-0 w-20 pt-0.5">Destinataire</span>
                <span className="text-brand-text-primary flex-1">{parsed.destinataire}</span>
              </div>
            )}
            {parsed.email && (
              <div className="flex items-start gap-2">
                <span className="font-jetbrains text-[10px] text-brand-text-secondary uppercase shrink-0 w-20 pt-0.5">Email</span>
                <span className="font-jetbrains text-[11px] text-brand-text-primary flex-1 break-all">{parsed.email}</span>
              </div>
            )}
            {parsed.warning && (
              <div className="flex items-start gap-2 mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-[11px] text-orange-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{parsed.warning}</span>
              </div>
            )}
          </div>

          {/* Corps de l'email */}
          {hasBody ? (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-jetbrains text-[10px] text-brand-text-secondary uppercase">Corps de l'email</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white"
                  onClick={(e) => { e.stopPropagation(); onCopyBody(); }}
                  data-testid={`copy-body-${task.id}`}
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copier le corps
                </Button>
              </div>
              <pre className="bg-white border border-brand-border rounded p-3 text-[12px] text-brand-text-primary font-inter whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
{parsed.body}
              </pre>
            </div>
          ) : (
            <div className="mt-3 p-3 bg-brand-bg/40 rounded text-xs text-brand-text-secondary italic">
              Pas de corps d'email préparé. À rédiger au moment de l'envoi.
              {task.template_suggested && (
                <span className="block mt-1">
                  Template suggéré : <strong>{task.template_suggested}</strong>
                </span>
              )}
            </div>
          )}

          {/* Action principale : marquer envoyé */}
          {onMarkSent && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="default"
                size="sm"
                className="h-8 text-xs bg-green-600 hover:bg-green-700"
                onClick={(e) => { e.stopPropagation(); onMarkSent(); }}
                data-testid={`mark-sent-${task.id}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Marquer envoyé
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

/**
 * Parse description format from seed_outreach_v1.py:
 *   📨 SUJET : <sujet>
 *   📮 DESTINATAIRE : <nom>
 *   📧 EMAIL : <adresse>
 *   ⚠️ Email incertain — ...
 *
 *   ─── CORPS DE L'EMAIL (à copier-coller dans Gmail) ───
 *
 *   <corps>
 */
function parseEmailDescription(desc) {
  if (!desc) return { subject: null, destinataire: null, email: null, warning: null, body: null };

  const result = { subject: null, destinataire: null, email: null, warning: null, body: null };

  // Subject
  const subjMatch = desc.match(/(?:📨\s*SUJET\s*:|SUJET\s*:)\s*(.+)/i);
  if (subjMatch) result.subject = subjMatch[1].split('\n')[0].trim();

  // Destinataire
  const destMatch = desc.match(/(?:📮\s*DESTINATAIRE\s*:|DESTINATAIRE\s*:)\s*(.+)/i);
  if (destMatch) result.destinataire = destMatch[1].split('\n')[0].trim();

  // Email
  const emailMatch = desc.match(/(?:📧\s*EMAIL\s*:|EMAIL\s*:)\s*(.+)/i);
  if (emailMatch) result.email = emailMatch[1].split('\n')[0].trim();

  // Warning (commence par ⚠️)
  const warnMatch = desc.match(/⚠️\s*(.+)/);
  if (warnMatch) result.warning = warnMatch[1].split('\n')[0].trim();

  // Body : tout ce qui suit la ligne avec "─── CORPS DE L'EMAIL"
  const bodySplit = desc.split(/─{2,}\s*CORPS DE L'EMAIL.*?─{2,}/);
  if (bodySplit.length > 1) {
    result.body = bodySplit[1].trim();
  } else {
    // Pas de marqueur de séparation : si c'est une desc qui ne suit pas le format,
    // on ne tente pas d'extraire un body (la desc complète est affichée comme metadata)
    result.body = null;
  }

  return result;
}

function formatTaskDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${time}`;
  } catch {
    return iso;
  }
}
