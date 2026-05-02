import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Plus, Mail, Phone, Linkedin, Calendar as CalendarIcon, MoreHorizontal,
  AlertTriangle, CheckCircle2, Clock, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import AddTaskModal from '../components/AddTaskModal';
import CompleteTaskModal from '../components/CompleteTaskModal';

const CHANNEL_ICONS = {
  email: Mail,
  phone: Phone,
  linkedin: Linkedin,
  meeting: CalendarIcon,
  other: MoreHorizontal,
};

const PRIORITY_COLORS = {
  high: 'border-l-red-500',
  medium: 'border-l-brand-primary',
  low: 'border-l-gray-300',
};

const CHANNEL_BG = {
  email: 'bg-brand-primary',
  phone: 'bg-orange-500',
  linkedin: 'bg-blue-600',
  meeting: 'bg-green-600',
  other: 'bg-gray-500',
};

const FILTERS = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'upcoming', label: '7 jours' },
  { id: 'overdue', label: 'En retard' },
  { id: 'done', label: 'Faites' },
  { id: 'all', label: 'Toutes' },
];

const FR_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const FR_DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const FR_MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

const formatTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

const formatDayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatDayLabel = (key) => {
  const d = new Date(key);
  const today = formatDayKey(new Date());
  if (key === today) return "Aujourd'hui";
  return `${FR_DAYS[d.getDay()]} ${d.getDate()} ${FR_MONTHS[d.getMonth()].toLowerCase()}`;
};

export default function TasksPage() {
  const { user } = useAuth();
  const [view, setView] = useState('list');
  const [filter, setFilter] = useState('today');
  const [tasks, setTasks] = useState([]);
  const [calendarTasks, setCalendarTasks] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [calMonth, setCalMonth] = useState(() => new Date());

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      let url = '/tasks';
      let params = {};
      if (filter === 'today') params = { status: 'pending', due_before: todayEnd.toISOString() };
      else if (filter === 'upcoming') { url = '/tasks/upcoming'; params = { days: 7 }; }
      else if (filter === 'overdue') params = { status: 'pending', due_before: now };
      else if (filter === 'done') params = { status: 'done', limit: 100 };
      else params = { limit: 1000 };

      const { data } = await api.get(url, { params });
      setTasks(data || []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchCalendar = useCallback(async () => {
    try {
      const from = startOfMonth(calMonth);
      const to = endOfMonth(calMonth);
      const { data } = await api.get('/tasks/calendar', {
        params: {
          from: from.toISOString(),
          to: to.toISOString(),
          include_done: true,
        },
      });
      setCalendarTasks(data || []);
    } catch {
      setCalendarTasks([]);
    }
  }, [calMonth]);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/tasks/stats');
      setStats(data || {});
    } catch {
      setStats({});
    }
  }, []);

  useEffect(() => {
    if (view === 'list') fetchTasks();
    fetchStats();
  }, [filter, view, fetchTasks, fetchStats]);

  useEffect(() => {
    if (view === 'calendar') fetchCalendar();
  }, [view, calMonth, fetchCalendar]);

  const handleCreated = () => {
    setShowAdd(false);
    fetchTasks();
    fetchCalendar();
    fetchStats();
  };

  const handleCompleted = () => {
    setCompleting(null);
    fetchTasks();
    fetchCalendar();
    fetchStats();
  };

  const snooze = async (taskId, days) => {
    try {
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + days);
      newDate.setHours(9, 30, 0, 0);
      await api.post(`/tasks/${taskId}/snooze`, { new_due_date: newDate.toISOString() });
      toast.success(`Reportée à +${days}j`);
      fetchTasks();
      fetchStats();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  // Group list view by day
  const grouped = useMemo(() => {
    const g = {};
    tasks.forEach((t) => {
      const key = formatDayKey(new Date(t.due_date));
      if (!g[key]) g[key] = [];
      g[key].push(t);
    });
    return Object.keys(g).sort().map((k) => ({ key: k, tasks: g[k] }));
  }, [tasks]);

  return (
    <div className="space-y-5" data-testid="tasks-page">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="font-jetbrains text-[10px] text-brand-primary uppercase tracking-wider font-semibold">
            Suivi & relances
          </div>
          <h1 className="font-manrope font-bold text-2xl text-brand-text-primary">Mes tâches</h1>
        </div>
        <Button onClick={() => setShowAdd(true)} data-testid="task-add-btn">
          <Plus className="w-4 h-4 mr-1.5" />
          Nouvelle tâche
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Aujourd'hui" value={stats.today || 0} accent />
        <StatCard label="En retard" value={stats.overdue || 0} variant="warning" />
        <StatCard label="Cette semaine" value={stats.this_week || 0} />
        <StatCard label="Faites aujourd'hui" value={stats.completed_today || 0} variant="success" />
      </div>

      {/* Tabs */}
      <Tabs value={view} onValueChange={setView}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="list" data-testid="tab-list">Liste</TabsTrigger>
            <TabsTrigger value="calendar" data-testid="tab-calendar">Calendrier</TabsTrigger>
          </TabsList>

          {view === 'list' && (
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <Button
                  key={f.id}
                  variant={filter === f.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(f.id)}
                  className="h-8 text-xs"
                  data-testid={`filter-${f.id}`}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* List view */}
        <TabsContent value="list" className="mt-4">
          {loading ? (
            <div className="text-center py-12 text-sm text-brand-text-secondary">Chargement…</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 text-sm text-brand-text-secondary">
              Aucune tâche dans cette vue.
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(({ key, tasks: dayTasks }) => {
                const today = formatDayKey(new Date());
                const isOverdue = key < today;
                return (
                  <div key={key}>
                    <div className={`flex items-center justify-between mb-2 font-jetbrains text-[11px] uppercase tracking-wider font-bold ${isOverdue ? 'text-red-600' : 'text-brand-text-primary'}`}>
                      <span>
                        {formatDayLabel(key)}
                        {isOverdue && key !== today && ' · en retard'}
                      </span>
                      <Badge variant="outline" className="text-[10px] h-5">{dayTasks.length}</Badge>
                    </div>
                    <div className="space-y-1.5">
                      {dayTasks.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          onComplete={() => setCompleting(t)}
                          onSnooze={(days) => snooze(t.id, days)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Calendar view */}
        <TabsContent value="calendar" className="mt-4">
          <CalendarGrid
            month={calMonth}
            tasks={calendarTasks}
            onMonthChange={setCalMonth}
            onTaskClick={setCompleting}
          />
        </TabsContent>
      </Tabs>

      <AddTaskModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={handleCreated}
      />
      <CompleteTaskModal
        open={!!completing}
        task={completing}
        onClose={() => setCompleting(null)}
        onCompleted={handleCompleted}
      />
    </div>
  );
}

// -------------------------------------------------------------
// StatCard
// -------------------------------------------------------------
function StatCard({ label, value, accent, variant }) {
  const colors = {
    warning: 'text-orange-600',
    success: 'text-green-600',
    default: 'text-brand-text-primary',
  };
  const valueColor = colors[variant] || colors.default;
  return (
    <div className={`bg-white rounded-lg border p-4 ${accent ? 'border-brand-primary border-2' : 'border-brand-border'}`}>
      <div className={`font-manrope font-bold text-3xl ${valueColor}`}>{value}</div>
      <div className="text-xs text-brand-text-secondary font-inter mt-1">{label}</div>
    </div>
  );
}

// -------------------------------------------------------------
// TaskRow
// -------------------------------------------------------------
function TaskRow({ task, onComplete, onSnooze }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = CHANNEL_ICONS[task.channel] || MoreHorizontal;
  const isOverdue = new Date(task.due_date) < new Date() && task.status === 'pending';
  const isDone = task.status === 'done';

  return (
    <div
      className={`bg-white rounded-md border-l-4 ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium} border-y border-r border-brand-border ${isOverdue ? 'bg-orange-50/40' : ''} ${isDone ? 'opacity-60' : ''}`}
      data-testid={`task-row-${task.id}`}
    >
      <div
        className="flex items-center gap-2.5 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-jetbrains text-xs text-brand-text-secondary font-medium w-12 shrink-0">
          {formatTime(task.due_date)}
        </span>
        <div className={`w-7 h-7 rounded-full ${CHANNEL_BG[task.channel] || CHANNEL_BG.other} text-white flex items-center justify-center shrink-0`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold text-brand-text-primary truncate ${isDone ? 'line-through' : ''}`}>
            {task.title}
          </div>
          <div className="text-xs text-brand-text-secondary truncate">
            {task.prospect?.nom || '—'}
            {task.prospect?.ville && <span> · {task.prospect.ville}</span>}
            {task.contact && <span> · {task.contact.prenom} {task.contact.nom}</span>}
          </div>
        </div>
        {!isDone && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs border-green-600 text-green-700 hover:bg-green-50 shrink-0"
            onClick={(e) => { e.stopPropagation(); onComplete(); }}
            data-testid={`task-done-${task.id}`}
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Fait
          </Button>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 pl-[88px] border-t border-brand-border bg-brand-bg/40 space-y-2">
          {task.description && <p className="text-xs text-brand-text-primary mt-2">{task.description}</p>}
          {task.template_suggested && (
            <div className="text-[11px] inline-block bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded">
              Template suggéré : <strong>{task.template_suggested}</strong>
            </div>
          )}
          {!isDone && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onSnooze(1); }}>
                <Clock className="w-3 h-3 mr-1" />+1j
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onSnooze(3); }}>
                +3j
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onSnooze(7); }}>
                +1 sem
              </Button>
              {task.prospect_id && (
                <Link
                  to={`/entreprises/${task.prospect_id}`}
                  className="inline-flex items-center gap-1 text-xs text-brand-primary hover:underline px-2 self-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  Voir fiche →
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// CalendarGrid - simple month view
// -------------------------------------------------------------
function CalendarGrid({ month, tasks, onMonthChange, onTaskClick }) {
  const firstDay = startOfMonth(month);
  const lastDay = endOfMonth(month);
  const startWeekday = firstDay.getDay(); // 0 = Sunday
  const offsetMon = startWeekday === 0 ? 6 : startWeekday - 1; // start week on Monday
  const daysInMonth = lastDay.getDate();

  // Group tasks by day
  const tasksByDay = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      const key = formatDayKey(new Date(t.due_date));
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  // Build cells: blank prefix + day cells
  const cells = [];
  for (let i = 0; i < offsetMon; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  }
  const todayKey = formatDayKey(new Date());

  const goPrev = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const goNext = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const goToday = () => onMonthChange(new Date());

  return (
    <div className="bg-white border border-brand-border rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="font-manrope font-bold text-lg text-brand-text-primary">
          {FR_MONTHS[month.getMonth()]} {month.getFullYear()}
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={goToday} className="h-8 text-xs">
            Aujourd'hui
          </Button>
          <Button variant="outline" size="icon" onClick={goPrev} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={goNext} className="h-8 w-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
          <div key={d} className="text-[10px] font-jetbrains font-semibold text-brand-text-secondary uppercase text-center pb-1">
            {d}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = formatDayKey(d);
          const dayTasks = tasksByDay[key] || [];
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              className={`min-h-[80px] border rounded p-1 ${isToday ? 'border-brand-primary bg-brand-primary/5' : 'border-brand-border bg-white'}`}
            >
              <div className={`text-xs font-jetbrains font-medium mb-1 ${isToday ? 'text-brand-primary font-bold' : 'text-brand-text-secondary'}`}>
                {d.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map((t) => {
                  const Icon = CHANNEL_ICONS[t.channel] || MoreHorizontal;
                  const isDone = t.status === 'done';
                  return (
                    <button
                      key={t.id}
                      onClick={() => onTaskClick(t)}
                      className={`w-full text-left text-[10px] px-1 py-0.5 rounded ${CHANNEL_BG[t.channel] || CHANNEL_BG.other} text-white truncate flex items-center gap-1 ${isDone ? 'opacity-50 line-through' : ''}`}
                      data-testid={`cal-task-${t.id}`}
                    >
                      <Icon className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{t.title}</span>
                    </button>
                  );
                })}
                {dayTasks.length > 3 && (
                  <div className="text-[9px] text-brand-text-secondary text-center font-jetbrains">
                    +{dayTasks.length - 3}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
