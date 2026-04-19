import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Textarea } from '../components/ui/textarea';
import { Plus, Search, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const DECIDEUR_NIVEAUX = [
  { value: 'primaire', label: 'Primaire' },
  { value: 'secondaire', label: 'Secondaire' },
  { value: 'influenceur', label: 'Influenceur' },
  { value: 'skip', label: 'Skip' },
];
const ROLE_FLAGS = [
  { value: 'dirigeant', label: 'Dirigeant' },
  { value: 'daf', label: 'DAF' },
  { value: 'drh', label: 'DRH' },
  { value: 'achats', label: 'Achats' },
  { value: 'tech', label: 'Tech' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'autre', label: 'Autre' },
];
const DECIDEUR_COLORS = {
  primaire: 'bg-green-100 text-green-700',
  secondaire: 'bg-blue-100 text-blue-700',
  influenceur: 'bg-purple-100 text-purple-700',
  skip: 'bg-gray-100 text-gray-700',
};

const EMPTY_FORM = {
  entreprise_id: '', nom: '', prenom: '', titre: '', email: '',
  linkedin_url: '', telephone: '', decideur_niveau: 'secondaire', role_flag: 'autre', notes: ''
};

export default function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [entreprises, setEntreprises] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ decideur_niveaux: [], role_flags: [] });
  const limit = 20;

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filters.decideur_niveaux.length) params.set('decideur_niveaux', filters.decideur_niveaux.join(','));
      if (filters.role_flags.length) params.set('role_flags', filters.role_flags.join(','));
      params.set('page', page);
      params.set('limit', limit);
      const { data } = await api.get(`/contacts?${params.toString()}`);
      setContacts(data.data || []);
      setTotal(data.total || 0);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setLoading(false); }
  }, [search, page, filters]);

  const fetchEntreprises = useCallback(async () => {
    try {
      const { data } = await api.get('/entreprises?limit=200');
      setEntreprises(data.data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchEntreprises(); }, [fetchEntreprises]);
  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleCreate = async () => {
    if (!form.nom.trim() || !form.entreprise_id) {
      toast.error('Nom et entreprise sont requis');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      Object.keys(payload).forEach(k => { if (!payload[k] && k !== 'decideur_niveau' && k !== 'role_flag') delete payload[k]; });
      await api.post('/contacts', payload);
      toast.success('Contact cree');
      setShowCreate(false);
      setForm(EMPTY_FORM);
      fetchContacts();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  const toggleFilter = (key, value) => {
    setFilters(prev => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  if (!loading && contacts.length === 0 && !search && !filters.decideur_niveaux.length && !filters.role_flags.length) {
    return (
      <div data-testid="contacts-page">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">Contacts</h1>
          <Button onClick={() => { setForm(EMPTY_FORM); setShowCreate(true); }} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="add-contact-btn">
            <Plus className="w-4 h-4 mr-2" /> Ajouter contact
          </Button>
        </div>
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-12 text-center" data-testid="contacts-empty-state">
          <p className="text-brand-text-secondary font-inter">Aucun contact pour le moment. Ajoutez des contacts depuis la fiche entreprise ou directement ici.</p>
        </div>
        {renderCreateDialog()}
      </div>
    );
  }

  function renderCreateDialog() {
    return (
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-manrope">Nouveau contact</DialogTitle>
            <DialogDescription className="font-inter text-sm">Renseignez les informations du contact.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-inter">Entreprise *</Label>
              <Select value={form.entreprise_id} onValueChange={v => setForm({...form, entreprise_id: v})}>
                <SelectTrigger data-testid="contact-form-entreprise"><SelectValue placeholder="Choisir une entreprise" /></SelectTrigger>
                <SelectContent>
                  {entreprises.map(e => <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-inter">Prenom</Label>
                <Input value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} data-testid="contact-form-prenom" className="font-inter" />
              </div>
              <div className="space-y-2">
                <Label className="font-inter">Nom *</Label>
                <Input value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} data-testid="contact-form-nom" className="font-inter" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Titre</Label>
              <Input value={form.titre} onChange={e => setForm({...form, titre: e.target.value})} placeholder="President, Directeur Commercial..." data-testid="contact-form-titre" className="font-inter" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-inter">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} data-testid="contact-form-email" className="font-inter" />
              </div>
              <div className="space-y-2">
                <Label className="font-inter">Telephone</Label>
                <Input value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} data-testid="contact-form-telephone" className="font-inter" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">LinkedIn URL</Label>
              <Input value={form.linkedin_url} onChange={e => setForm({...form, linkedin_url: e.target.value})} placeholder="https://linkedin.com/in/..." data-testid="contact-form-linkedin" className="font-inter" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-inter">Niveau decideur</Label>
                <Select value={form.decideur_niveau} onValueChange={v => setForm({...form, decideur_niveau: v})}>
                  <SelectTrigger data-testid="contact-form-decideur"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DECIDEUR_NIVEAUX.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-inter">Role</Label>
                <Select value={form.role_flag} onValueChange={v => setForm({...form, role_flag: v})}>
                  <SelectTrigger data-testid="contact-form-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_FLAGS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} data-testid="contact-form-notes" className="font-inter" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="font-inter border-brand-border">Annuler</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="contact-form-save">
              {saving ? 'Creation...' : 'Creer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div data-testid="contacts-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">Contacts</h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1">{total} contact{total > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setShowCreate(true); }} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="add-contact-btn">
          <Plus className="w-4 h-4 mr-2" /> Ajouter contact
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-secondary" />
          <Input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Rechercher par nom, email..." className="pl-9 font-inter" data-testid="contacts-search" />
        </div>
      </div>

      {/* Inline filters */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div>
          <p className="text-xs font-inter text-brand-text-secondary mb-1">Niveau decideur</p>
          <div className="flex flex-wrap gap-2">
            {DECIDEUR_NIVEAUX.map(d => (
              <label key={d.value} className="flex items-center gap-1.5 text-xs font-inter cursor-pointer">
                <Checkbox checked={filters.decideur_niveaux.includes(d.value)} onCheckedChange={() => toggleFilter('decideur_niveaux', d.value)} />
                {d.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-inter text-brand-text-secondary mb-1">Role</p>
          <div className="flex flex-wrap gap-2">
            {ROLE_FLAGS.map(r => (
              <label key={r.value} className="flex items-center gap-1.5 text-xs font-inter cursor-pointer">
                <Checkbox checked={filters.role_flags.includes(r.value)} onCheckedChange={() => toggleFilter('role_flags', r.value)} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-brand-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-brand-bg">
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Nom complet</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden sm:table-cell">Titre</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Entreprise</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden md:table-cell">Decideur</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden md:table-cell">Email</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden lg:table-cell">Telephone</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden lg:table-cell">LinkedIn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-brand-text-secondary font-inter">Chargement...</TableCell></TableRow>
              ) : contacts.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-brand-text-secondary font-inter">Aucun resultat</TableCell></TableRow>
              ) : contacts.map(c => (
                <TableRow key={c.id} data-testid={`contact-row-${c.id}`}>
                  <TableCell className="font-inter font-medium text-sm">{[c.prenom, c.nom].filter(Boolean).join(' ')}</TableCell>
                  <TableCell className="font-inter text-sm text-brand-text-secondary hidden sm:table-cell">{c.titre || '-'}</TableCell>
                  <TableCell>
                    <button onClick={() => navigate(`/entreprises/${c.entreprise_id}`)} className="text-sm text-brand-primary hover:underline font-inter" data-testid={`contact-entreprise-link-${c.id}`}>
                      {c.entreprise_nom || '-'}
                    </button>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge className={`${DECIDEUR_COLORS[c.decideur_niveau] || 'bg-gray-100 text-gray-700'} text-xs font-inter border-0`}>
                      {DECIDEUR_NIVEAUX.find(d => d.value === c.decideur_niveau)?.label || c.decideur_niveau}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-inter text-sm hidden md:table-cell">{c.email || '-'}</TableCell>
                  <TableCell className="font-inter text-sm hidden lg:table-cell">{c.telephone || '-'}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {c.linkedin_url ? (
                      <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-brand-primary hover:underline">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    ) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-brand-text-secondary font-inter">Page {page} sur {totalPages}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="font-inter border-brand-border" data-testid="contacts-prev-page"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="font-inter border-brand-border" data-testid="contacts-next-page"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      {renderCreateDialog()}
    </div>
  );
}
