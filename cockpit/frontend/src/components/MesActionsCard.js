import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Mail, Phone, Linkedin, Calendar as CalendarIcon, MoreHorizontal,
  CheckCircle2, ArrowRight, ListTodo, Send, AlertTriangle,
  Receipt, Banknote,
} from 'lucide-react';
import { toast } from 'sonner';

const CHANNEL_ICONS = {
  email: Mail,
  phone: Phone,
  linkedin: Linkedin,
  meeting: CalendarIcon,
  other: MoreHorizontal,
};

const CATEGORY_LABELS = {
  prospection: 'Prospection',
  audit_production: 'Audit',
  admin: 'Admin',
  dev_tech: 'Dev',
  content_seo: 'Content',
  autre: 'Autre',
};

const DAYS_MAP = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const todayKey = () => DAYS_MAP[new Date().getDay()];

const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

const formatEUR = (v) => {
  if (v == null) return '';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(v);
};

/**
 * MesActionsCard
 * Widget Dashboard qui melange :
 *  - Tasks du jour (relances prospects, GET /tasks/today)
 *  - Todos du jour (planning hebdo, GET /todos)
 *  - Factures à émettre / à encaisser (statut prevue ou emise > 30j)
 */
export default function MesActionsCard({ maxItems = 10 }) {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, todosRes, statsRes, facturesRes] = await Promise.all([
        api.get('/tasks/today').catch(() => ({ data: [] })),
        api.get('/todos').catch(() => ({ data: [] })),
        api.get('/tasks/stats').catch(() => ({ data: {} })),
        api.get('/factures', { params: { limit: 500 } }).catch(() => ({ data: { data: [] } })),
      ]);

      // Normalize tasks
      const tasks = (tasksRes.data || []).map((t) => ({
        kind: 'task',
        id: t.id,
        title: t.title,
        prospect: t.prospect,
        contact: t.contact,
        prospect_id: t.prospect_id,
        channel: t.channel,
        due_date: t.due_date,
        priority: t.priority,
        overdue: new Date(t.due_date) < new Date(),
      }));

      // Filter todos: today + not termine
      const todayDayName = todayKey();
      const allTodos = todosRes.data || [];
      const todosToday = allTodos
        .filter((t) => t.jour === todayDayName && t.statut !== 'termine')
        .map((t) => ({
          kind: 'todo',
          id: t.id,
          title: t.titre,
          category: t.categorie,
          status: t.statut,
          assigne: t.assigne,
          entreprise_id: t.entreprise_id,
          entreprise_nom: t.entreprise_nom,
        }));

      // Filter factures: à émettre OR émise depuis > 30j
      const cm = currentMonth();
      const allFactures = facturesRes.data?.data || [];
      const facturesUrgent = allFactures
        .filter((f) => {
          if (f.statut === 'annulee' || f.statut === 'payee') return false;
          // À émettre = statut prevue, mois <= courant
          if (f.statut === 'prevue' && f.mois <= cm) return true;
          // En retard = émise depuis > 30j
          if (f.statut === 'emise' && f.date_emission) {
            const dEmis = new Date(f.date_emission);
            const days = (Date.now() - dEmis.getTime()) / (1000 * 3600 * 24);
            return days > 30;
          }
          return false;
        })
        .map((f) => ({
          kind: 'facture',
          id: f.id,
          mois: f.mois,
          montant: f.montant,
          statut: f.statut,
          entreprise_id: f.entreprise_id,
          entreprise_nom: f.entreprise_nom || '?',
          opportunite_intitule: f.opportunite_intitule,
          date_emission: f.date_emission,
          action_needed: f.statut === 'prevue' ? 'emettre' : 'relancer_paiement',
        }))
        .sort((a, b) => a.mois.localeCompare(b.mois));

      // Stats globales pour la barre
      const facturesTotalAEmettre = facturesUrgent
        .filter((f) => f.action_needed === 'emettre')
        .reduce((s, f) => s + (f.montant || 0), 0);

      // Merge: tasks overdue d'abord, tasks today, todos, factures
      const merged = [
        ...tasks.filter((t) => t.overdue),
        ...tasks.filter((t) => !t.overdue),
        ...todosToday,
        ...facturesUrgent,
      ];

      setItems(merged);
      setStats({
        ...(statsRes.data || {}),
        factures_a_emettre_count: facturesUrgent.filter((f) => f.action_needed === 'emettre').length,
        factures_a_emettre_total: facturesTotalAEmettre,
        factures_retard_count: facturesUrgent.filter((f) => f.action_needed === 'relancer_paiement').length,
      });
    } catch (e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const completeTask = async (taskId) => {
    try {
      await api.post(`/tasks/${taskId}/complete`, { create_followup: false });
      toast.success('Tâche faite');
      fetchAll();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const completeTodo = async (todoId) => {
    try {
      await api.put(`/todos/${todoId}`, { statut: 'termine' });
      toast.success('Todo terminé');
      fetchAll();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const markFactureEmise = async (facture) => {
    try {
      await api.put(`/factures/${facture.id}`, {
        statut: 'emise',
        date_emission: today(),
      });
      toast.success('Facture marquée émise');
      fetchAll();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const visible = items.slice(0, maxItems);
  const more = items.length - maxItems;

  return (
    <div className="bg-white rounded-lg border border-brand-border p-5 mb-5" data-testid="mes-actions-card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-jetbrains text-[10px] text-brand-primary uppercase tracking-wider font-semibold mb-0.5">
            Mes actions du jour
          </div>
          <h2 className="font-manrope font-bold text-lg text-brand-text-primary">
            {items.length === 0 && !loading ? "Tout est traité 👌" : `${items.length} action${items.length > 1 ? 's' : ''} à faire`}
          </h2>
        </div>
        <div className="flex gap-3 mt-1 shrink-0">
          <Link to="/tasks" className="text-xs font-medium text-brand-primary hover:underline">
            Relances →
          </Link>
          <Link to="/facturation" className="text-xs font-medium text-brand-primary hover:underline">
            Facturation →
          </Link>
        </div>
      </div>

      {/* Inline mini-stats */}
      {(stats.overdue > 0 || stats.factures_a_emettre_count > 0 || stats.completed_today > 0) && (
        <div className="flex flex-wrap gap-3 mb-3 font-jetbrains text-[11px] text-brand-text-secondary">
          {stats.overdue > 0 && (
            <span className="text-red-600">
              <AlertTriangle className="inline w-3 h-3 mr-1" />
              <strong>{stats.overdue}</strong> relances en retard
            </span>
          )}
          {stats.factures_a_emettre_count > 0 && (
            <span className="text-orange-600">
              <Receipt className="inline w-3 h-3 mr-1" />
              <strong>{stats.factures_a_emettre_count}</strong> factures à émettre · {formatEUR(stats.factures_a_emettre_total)}
            </span>
          )}
          {stats.factures_retard_count > 0 && (
            <span className="text-red-600">
              <Banknote className="inline w-3 h-3 mr-1" />
              <strong>{stats.factures_retard_count}</strong> paiements en retard
            </span>
          )}
          {stats.completed_today > 0 && (
            <span className="text-green-600">
              <CheckCircle2 className="inline w-3 h-3 mr-1" />
              <strong>{stats.completed_today}</strong> faites aujourd'hui
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-7 text-sm text-brand-text-secondary">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-7 text-sm text-brand-text-secondary">
          Pas d'action prévue aujourd'hui.<br />
          <Link to="/tasks" className="text-brand-primary hover:underline">
            Planifier une nouvelle tâche →
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-1.5">
            {visible.map((item) => {
              if (item.kind === 'task') {
                return <li key={`task-${item.id}`}><TaskRow item={item} onDone={() => completeTask(item.id)} /></li>;
              }
              if (item.kind === 'todo') {
                return <li key={`todo-${item.id}`}><TodoRow item={item} onDone={() => completeTodo(item.id)} /></li>;
              }
              if (item.kind === 'facture') {
                return <li key={`facture-${item.id}`}><FactureRow item={item} onMarkEmise={() => markFactureEmise(item)} /></li>;
              }
              return null;
            })}
          </ul>
          {more > 0 && (
            <Link
              to="/tasks"
              className="block text-center mt-3 text-xs font-medium text-brand-primary hover:underline"
            >
              + {more} autre{more > 1 ? 's' : ''} →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function TaskRow({ item, onDone }) {
  const Icon = CHANNEL_ICONS[item.channel] || MoreHorizontal;
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-md border ${
        item.overdue ? 'border-orange-200 bg-orange-50/50' : 'border-brand-border bg-white'
      }`}
      data-testid={`action-task-${item.id}`}
    >
      <span className="font-jetbrains text-[11px] text-brand-text-secondary font-medium w-10 shrink-0">
        {formatTime(item.due_date)}
      </span>
      <div className="w-7 h-7 rounded-full bg-brand-primary text-white flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-brand-text-primary truncate flex items-center gap-1.5">
          <Send className="w-3 h-3 text-brand-primary shrink-0" />
          {item.title}
        </div>
        <div className="text-[11px] text-brand-text-secondary truncate">
          {item.prospect?.nom || '—'}
          {item.contact && <span> · {item.contact.prenom} {item.contact.nom}</span>}
        </div>
      </div>
      {item.prospect_id && (
        <Link
          to={`/entreprises/${item.prospect_id}`}
          className="text-brand-text-secondary hover:text-brand-primary"
          title="Voir la fiche"
        >
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs border-green-600 text-green-700 hover:bg-green-50"
        onClick={onDone}
        data-testid={`task-quick-done-${item.id}`}
      >
        ✓
      </Button>
    </div>
  );
}

function TodoRow({ item, onDone }) {
  return (
    <div
      className="flex items-center gap-2 p-2 rounded-md border border-brand-border bg-white"
      data-testid={`action-todo-${item.id}`}
    >
      <span className="w-10 shrink-0" />
      <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
        <ListTodo className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-brand-text-primary truncate flex items-center gap-1.5">
          {item.title}
          <Badge variant="outline" className="text-[9px] py-0 h-4 font-normal">
            {CATEGORY_LABELS[item.category] || 'Todo'}
          </Badge>
        </div>
        <div className="text-[11px] text-brand-text-secondary truncate">
          {item.entreprise_nom ? `${item.entreprise_nom} · ` : ''}
          {item.assigne ? `Assigné à ${item.assigne}` : 'Planning du jour'}
        </div>
      </div>
      <Link to="/todos" className="text-brand-text-secondary hover:text-brand-primary" title="Voir la todo">
        <ArrowRight className="w-4 h-4" />
      </Link>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs border-green-600 text-green-700 hover:bg-green-50"
        onClick={onDone}
        data-testid={`todo-quick-done-${item.id}`}
      >
        ✓
      </Button>
    </div>
  );
}

function FactureRow({ item, onMarkEmise }) {
  const isAEmettre = item.action_needed === 'emettre';
  const moisLabel = item.mois?.split('-').reverse().join('/') || item.mois;
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-md border ${
        isAEmettre ? 'border-orange-200 bg-orange-50/50' : 'border-red-200 bg-red-50/50'
      }`}
      data-testid={`action-facture-${item.id}`}
    >
      <span className="font-jetbrains text-[11px] text-brand-text-secondary font-medium w-10 shrink-0">
        {moisLabel}
      </span>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
        isAEmettre ? 'bg-orange-500 text-white' : 'bg-red-500 text-white'
      }`}>
        {isAEmettre ? <Receipt className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-brand-text-primary truncate flex items-center gap-1.5">
          {isAEmettre ? 'Facture à émettre' : 'Paiement en retard'} · {formatEUR(item.montant)}
        </div>
        <div className="text-[11px] text-brand-text-secondary truncate">
          {item.entreprise_nom}
          {item.opportunite_intitule && <span> · {item.opportunite_intitule}</span>}
        </div>
      </div>
      <Link to="/facturation" className="text-brand-text-secondary hover:text-brand-primary" title="Voir factures">
        <ArrowRight className="w-4 h-4" />
      </Link>
      {isAEmettre && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px] border-orange-600 text-orange-700 hover:bg-orange-50"
          onClick={onMarkEmise}
          data-testid={`facture-quick-emise-${item.id}`}
        >
          <Send className="w-3 h-3 mr-1" />
          Émettre
        </Button>
      )}
    </div>
  );
}
