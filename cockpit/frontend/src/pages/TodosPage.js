import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Plus, Trash2, CheckCircle2, Circle, Clock, FileUp, ArrowRight,
  Link2, CheckCheck,
} from 'lucide-react';
import { toast } from 'sonner';

const JOURS = [
  { value: 'lundi', label: 'Lundi' },
  { value: 'mardi', label: 'Mardi' },
  { value: 'mercredi', label: 'Mercredi' },
  { value: 'jeudi', label: 'Jeudi' },
  { value: 'vendredi', label: 'Vendredi' },
];

const CATEGORIES = [
  { value: 'prospection', label: 'Prospection', color: 'bg-blue-100 text-blue-700' },
  { value: 'audit_production', label: 'Audit / Production', color: 'bg-purple-100 text-purple-700' },
  { value: 'admin', label: 'Admin', color: 'bg-gray-100 text-gray-700' },
  { value: 'dev_tech', label: 'Dev / Tech', color: 'bg-green-100 text-green-700' },
  { value: 'content_seo', label: 'Content / SEO', color: 'bg-orange-100 text-orange-700' },
  { value: 'autre', label: 'Autre', color: 'bg-slate-100 text-slate-700' },
];
const CAT_BY_VALUE = CATEGORIES.reduce((acc, c) => ({ ...acc, [c.value]: c }), {});

const STATUTS = [
  { value: 'a_faire', label: 'A faire', icon: Circle },
  { value: 'en_cours', label: 'En cours', icon: Clock },
  { value: 'termine', label: 'Termine', icon: CheckCircle2 },
];

const ASSIGNES = [
  { value: 'lucas', label: 'Lucas' },
  { value: 'ayoub', label: 'Ayoub' },
];

const nextStatut = (s) => (s === 'a_faire' ? 'en_cours' : s === 'en_cours' ? 'termine' : 'a_faire');

const EMPTY_FORM = {
  titre: '',
  description: '',
  categorie: 'prospection',
  jour: 'lundi',
  assigne_a: 'lucas',
  statut: 'a_faire',
  entreprise_id: '',
  opportunite_id: '',
};

export default function TodosPage() {
  const { user } = useAuth();
  const [todos, setTodos] = useState([]);
  const [entreprises, setEntreprises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAssigne, setFilterAssigne] = useState('');  // '' = tous
  const [filterCategorie, setFilterCategorie] = useState('');
  const [hideTermine, setHideTermine] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [importText, setImportText] = useState('');
  const [importAssigne, setImportAssigne] = useState('lucas');
  const [importCategorie, setImportCategorie] = useState('prospection');
  const [importJour, setImportJour] = useState('lundi');
  const [importing, setImporting] = useState(false);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterAssigne) params.set('assigne_a', filterAssigne);
      if (filterCategorie) params.set('categorie', filterCategorie);
      const { data } = await api.get(`/todos?${params.toString()}`);
      setTodos(data.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [filterAssigne, filterCategorie]);

  const fetchEntreprises = useCallback(async () => {
    try {
      const { data } = await api.get('/entreprises?limit=100');
      setEntreprises(data.data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchTodos(); }, [fetchTodos]);
  useEffect(() => { fetchEntreprises(); }, [fetchEntreprises]);

  const todosByJour = useMemo(() => {
    const buckets = JOURS.reduce((acc, j) => ({ ...acc, [j.value]: [] }), {});
    todos.forEach((t) => {
      if (hideTermine && t.statut === 'termine') return;
      if (buckets[t.jour]) buckets[t.jour].push(t);
    });
    return buckets;
  }, [todos, hideTermine]);

  const openCreate = (defaultJour = 'lundi') => {
    setForm({
      ...EMPTY_FORM,
      jour: defaultJour,
      assigne_a: user?.nom?.split(' ')[0]?.toLowerCase() === 'ayoub' ? 'ayoub' : 'lucas',
    });
    setShowCreate(true);
  };

  const save = async () => {
    if (!form.titre.trim()) {
      toast.error('Le titre est requis');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        titre: form.titre.trim(),
        categorie: form.categorie,
        jour: form.jour,
        assigne_a: form.assigne_a,
        statut: form.statut,
      };
      if (form.description) payload.description = form.description;
      if (form.entreprise_id) payload.entreprise_id = form.entreprise_id;
      if (form.opportunite_id) payload.opportunite_id = form.opportunite_id;
      await api.post('/todos', payload);
      toast.success('Todo creee');
      setShowCreate(false);
      setForm(EMPTY_FORM);
      fetchTodos();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatut = async (t) => {
    try {
      await api.put(`/todos/${t.id}`, { statut: nextStatut(t.statut) });
      fetchTodos();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const del = async (t) => {
    if (!window.confirm(`Supprimer la todo "${t.titre}" ?`)) return;
    try {
      await api.delete(`/todos/${t.id}`);
      toast.success('Todo supprimee');
      fetchTodos();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const moveToJour = async (t, jour) => {
    if (t.jour === jour) return;
    try {
      await api.put(`/todos/${t.id}`, { jour });
      fetchTodos();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const doImport = async () => {
    if (!importText.trim()) {
      toast.error('Collez du texte contenant une liste de taches');
      return;
    }
    setImporting(true);
    try {
      const { data } = await api.post('/todos/bulk-import', {
        texte: importText,
        assigne_a: importAssigne,
        categorie: importCategorie,
        jour: importJour,
      });
      toast.success(`${data.created_count} todo(s) importee(s)`);
      setShowImport(false);
      setImportText('');
      fetchTodos();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div data-testid="todos-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">
            Todos de la semaine
          </h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1">
            Organise tes taches par jour. Tu peux rattacher une todo a une entreprise ou une opportunite.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)} className="border-brand-border font-inter" data-testid="import-todo-btn">
            <FileUp className="w-4 h-4 mr-2" /> Importer
          </Button>
          <Button onClick={() => openCreate()} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="add-todo-btn">
            <Plus className="w-4 h-4 mr-2" /> Nouvelle todo
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Select value={filterAssigne || '__all__'} onValueChange={(v) => setFilterAssigne(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-40 font-inter" data-testid="filter-assigne">
            <SelectValue placeholder="Assigne" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous</SelectItem>
            {ASSIGNES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategorie || '__all__'} onValueChange={(v) => setFilterCategorie(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-48 font-inter" data-testid="filter-categorie">
            <SelectValue placeholder="Categorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Toutes</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm font-inter cursor-pointer">
          <input
            type="checkbox"
            checked={hideTermine}
            onChange={(e) => setHideTermine(e.target.checked)}
            className="rounded"
          />
          Masquer terminees
        </label>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {JOURS.map((j) => (
            <div key={j.value} className="bg-brand-bg rounded-lg p-3 min-h-[200px]" data-testid={`kanban-col-${j.value}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-manrope font-semibold text-sm text-brand-text-primary uppercase tracking-wide">
                  {j.label}
                </h3>
                <span className="text-xs font-inter text-brand-text-secondary">
                  {todosByJour[j.value].length}
                </span>
              </div>
              <div className="space-y-2">
                {todosByJour[j.value].map((t) => {
                  const cat = CAT_BY_VALUE[t.categorie] || CAT_BY_VALUE.autre;
                  const StatutIcon = STATUTS.find((s) => s.value === t.statut)?.icon || Circle;
                  const isDone = t.statut === 'termine';
                  return (
                    <div
                      key={t.id}
                      className={`bg-white rounded-md border border-brand-border p-3 shadow-sm ${isDone ? 'opacity-60' : ''}`}
                      data-testid={`todo-card-${t.id}`}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <button
                          onClick={() => toggleStatut(t)}
                          className="shrink-0 mt-0.5"
                          title="Changer statut"
                          data-testid={`toggle-statut-${t.id}`}
                        >
                          <StatutIcon className={`w-4 h-4 ${isDone ? 'text-brand-success' : 'text-brand-text-secondary'}`} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className={`font-inter text-sm ${isDone ? 'line-through text-brand-text-secondary' : 'text-brand-text-primary'}`}>
                            {t.titre}
                          </div>
                          {t.description && (
                            <div className="font-inter text-xs text-brand-text-secondary mt-1">{t.description}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className={`${cat.color} text-xs border-0 font-inter`}>
                          {cat.label}
                        </Badge>
                        <span className="text-xs font-inter text-brand-text-secondary capitalize">
                          {t.assigne_a}
                        </span>
                        {t.entreprise_id && (
                          <Link to={`/entreprises/${t.entreprise_id}`} className="text-xs font-inter text-brand-primary flex items-center gap-1 hover:underline">
                            <Link2 className="w-3 h-3" />
                            <span className="truncate max-w-[100px]">{t.entreprise_nom || 'Entreprise'}</span>
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-brand-border">
                        <Select value={t.jour} onValueChange={(v) => moveToJour(t, v)}>
                          <SelectTrigger className="h-7 text-xs font-inter border-0 shadow-none p-1 w-auto" data-testid={`move-${t.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {JOURS.map((jj) => <SelectItem key={jj.value} value={jj.value}>{jj.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del(t)} title="Supprimer">
                          <Trash2 className="w-3 h-3 text-brand-danger" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => openCreate(j.value)}
                  className="w-full py-2 px-3 text-xs font-inter text-brand-text-secondary border border-dashed border-brand-border rounded-md hover:bg-white hover:text-brand-text-primary transition-colors"
                  data-testid={`add-todo-col-${j.value}`}
                >
                  + Ajouter
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-manrope">Nouvelle todo</DialogTitle>
            <DialogDescription className="font-inter text-sm">
              Rattache optionnellement a une entreprise.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-inter">Titre *</Label>
              <Input
                value={form.titre}
                onChange={(e) => setForm({ ...form, titre: e.target.value })}
                placeholder="Appeler SCOMO"
                className="font-inter"
                data-testid="todo-titre"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Description (optionnel)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="font-inter"
                data-testid="todo-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-inter">Jour</Label>
                <Select value={form.jour} onValueChange={(v) => setForm({ ...form, jour: v })}>
                  <SelectTrigger data-testid="todo-jour"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {JOURS.map((j) => <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-inter">Assigne a</Label>
                <Select value={form.assigne_a} onValueChange={(v) => setForm({ ...form, assigne_a: v })}>
                  <SelectTrigger data-testid="todo-assigne"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Categorie</Label>
              <Select value={form.categorie} onValueChange={(v) => setForm({ ...form, categorie: v })}>
                <SelectTrigger data-testid="todo-categorie"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Entreprise liee (optionnel)</Label>
              <Select value={form.entreprise_id || '__none__'} onValueChange={(v) => setForm({ ...form, entreprise_id: v === '__none__' ? '' : v })}>
                <SelectTrigger data-testid="todo-entreprise"><SelectValue placeholder="Aucune" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Aucune</SelectItem>
                  {entreprises.map((e) => <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="font-inter border-brand-border">Annuler</Button>
            <Button onClick={save} disabled={saving} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="todo-save">
              {saving ? 'Creation...' : 'Creer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-manrope">Importer une liste de todos</DialogTitle>
            <DialogDescription className="font-inter text-sm">
              Colle un texte avec une liste a puces (ex: issue d'une reponse Claude, d'un compte-rendu de reunion).
              Les lignes commencant par <code>-</code>, <code>*</code> ou <code>1.</code> deviendront des todos.
              Tu pourras les deplacer/rattacher ensuite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={8}
              placeholder={`- Appeler SCOMO Corine Benac\n- Envoyer propale Fimotec\n- Relancer AMOTECH J+3\n1. Finaliser audit MCEI\n* Publier 2 pages machines SCOMO`}
              className="font-jetbrains text-xs"
              data-testid="import-textarea"
            />
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="font-inter text-xs">Jour par defaut</Label>
                <Select value={importJour} onValueChange={setImportJour}>
                  <SelectTrigger className="font-inter text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {JOURS.map((j) => <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-inter text-xs">Categorie par defaut</Label>
                <Select value={importCategorie} onValueChange={setImportCategorie}>
                  <SelectTrigger className="font-inter text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-inter text-xs">Assigne a</Label>
                <Select value={importAssigne} onValueChange={setImportAssigne}>
                  <SelectTrigger className="font-inter text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSIGNES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)} className="font-inter border-brand-border">Annuler</Button>
            <Button onClick={doImport} disabled={importing} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="import-submit">
              {importing ? 'Import...' : 'Importer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
