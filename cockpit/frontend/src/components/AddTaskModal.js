import React, { useState, useEffect, useCallback } from 'react';
import api, { formatApiError } from '../lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { Search, Mail, Phone, Linkedin, Calendar, MoreHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';

const CHANNELS = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'phone', label: 'Appel', icon: Phone },
  { value: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { value: 'meeting', label: 'RDV / Visio', icon: Calendar },
  { value: 'other', label: 'Autre', icon: MoreHorizontal },
];

const PRIORITIES = [
  { value: 'high', label: 'Haute' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'low', label: 'Basse' },
];

const TEMPLATES = [
  { value: 'cold_initial', label: 'Cold email initial' },
  { value: 'relance_1_soft', label: 'Relance 1 - Bump léger' },
  { value: 'relance_2_value', label: 'Relance 2 - Apport de valeur' },
  { value: 'relance_3_pivot', label: "Relance 3 - Pivot d'angle" },
  { value: 'breakup', label: 'Breakup - Dernière relance' },
  { value: 'linkedin_connect', label: 'LinkedIn - Connexion' },
  { value: 'phone_call', label: 'Appel téléphonique' },
];

const toLocalInputValue = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const defaultDate = () => {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return toLocalInputValue(d);
};

export default function AddTaskModal({ open, onClose, onCreated, defaultProspectId = null }) {
  const [prospects, setProspects] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(!defaultProspectId);
  const [form, setForm] = useState({
    prospect_id: defaultProspectId || '',
    title: '',
    description: '',
    channel: 'email',
    due_date: defaultDate(),
    duration_minutes: '',
    priority: 'medium',
    template_suggested: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchProspects = useCallback(async () => {
    try {
      const { data } = await api.get('/entreprises', { params: { limit: 1000 } });
      setProspects(data?.data || data?.items || (Array.isArray(data) ? data : []));
    } catch {
      setProspects([]);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchProspects();
      setForm((f) => ({
        ...f,
        prospect_id: defaultProspectId || '',
        title: '',
        description: '',
        due_date: defaultDate(),
      }));
      setShowSearch(!defaultProspectId);
    }
  }, [open, defaultProspectId, fetchProspects]);

  const filteredProspects = (() => {
    if (!searchQuery) return prospects.slice(0, 8);
    const q = searchQuery.toLowerCase();
    return prospects
      .filter((p) => p.nom?.toLowerCase().includes(q) || p.ville?.toLowerCase().includes(q))
      .slice(0, 12);
  })();

  const selectedProspect = prospects.find((p) => p.id === form.prospect_id);

  const submit = async () => {
    if (!form.prospect_id) { toast.error('Choisis un prospect.'); return; }
    if (!form.title.trim()) { toast.error('Donne un titre à la tâche.'); return; }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        due_date: new Date(form.due_date).toISOString(),
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes, 10) : null,
        template_suggested: form.template_suggested || null,
        description: form.description || null,
      };
      const { data } = await api.post('/tasks', payload);
      toast.success('Tâche créée');
      onCreated && onCreated(data);
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const setQuickDate = (days, h = 9, m = 30) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    setForm((f) => ({ ...f, due_date: toLocalInputValue(d) }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="font-manrope">Nouvelle tâche</DialogTitle>
          <DialogDescription className="font-inter text-sm">
            Planifie une relance, un appel ou une action prospect.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Prospect search/selector */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide font-medium text-brand-text-secondary">
              Prospect *
            </Label>
            {selectedProspect && !showSearch ? (
              <div className="flex items-center justify-between bg-brand-bg rounded-md px-3 py-2 border border-brand-border">
                <div className="text-sm">
                  <span className="font-medium text-brand-text-primary">{selectedProspect.nom}</span>
                  {selectedProspect.ville && (
                    <span className="text-brand-text-secondary"> · {selectedProspect.ville}</span>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowSearch(true)}>
                  Changer
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-brand-text-secondary" />
                  <Input
                    placeholder="Rechercher une entreprise..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                    autoFocus
                    data-testid="task-prospect-search"
                  />
                </div>
                {!form.prospect_id && (
                  <div className="border border-brand-border rounded-md max-h-[180px] overflow-y-auto">
                    {filteredProspects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm border-b border-brand-border last:border-b-0 hover:bg-brand-bg flex items-center gap-2"
                        onClick={() => {
                          setForm((f) => ({ ...f, prospect_id: p.id }));
                          setSearchQuery('');
                          setShowSearch(false);
                        }}
                        data-testid={`task-prospect-option-${p.id}`}
                      >
                        <span className="font-medium text-brand-text-primary">{p.nom}</span>
                        {p.ville && <span className="text-xs text-brand-text-secondary">{p.ville}</span>}
                      </button>
                    ))}
                    {filteredProspects.length === 0 && (
                      <div className="px-3 py-3 text-xs text-brand-text-secondary">Aucun résultat</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Titre de la tâche *</Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Relance email - Pack Démarrage"
              data-testid="task-title-input"
            />
          </div>

          {/* Channel + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
                <SelectTrigger data-testid="task-channel-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => {
                    const Icon = c.icon;
                    return (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5" />
                          {c.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priorité</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger data-testid="task-priority-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date + Duration */}
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Quand ? *</Label>
              <Input
                id="task-due"
                type="datetime-local"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                data-testid="task-due-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-duration">Durée (min)</Label>
              <Input
                id="task-duration"
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))}
                placeholder="30"
              />
            </div>
          </div>

          {/* Quick date presets */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Demain 9h30', days: 1 },
              { label: 'Dans 3j', days: 3 },
              { label: 'Dans 1 sem', days: 7 },
              { label: 'Dans 2 sem', days: 14 },
            ].map((q) => (
              <Button
                key={q.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuickDate(q.days)}
                className="h-7 text-xs"
              >
                {q.label}
              </Button>
            ))}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Notes (optionnel)</Label>
            <Textarea
              id="task-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Contexte, points à aborder, angle d'attaque..."
              rows={3}
            />
          </div>

          {/* Template */}
          <div className="space-y-1.5">
            <Label>Template suggéré (optionnel)</Label>
            <Select
              value={form.template_suggested || 'none'}
              onValueChange={(v) => setForm((f) => ({ ...f, template_suggested: v === 'none' ? '' : v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Aucun —</SelectItem>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={submitting} data-testid="task-submit-btn">
            {submitting ? 'Création…' : 'Créer la tâche'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
