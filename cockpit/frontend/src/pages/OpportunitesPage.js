import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_MISSIONS = [
  { value: 'audit_drs', label: 'Audit DRS' },
  { value: 'accompagnement', label: 'Accompagnement' },
  { value: 'pack', label: 'Pack' },
  { value: 'one_shot', label: 'One Shot' },
  { value: 'personnalise', label: 'Personnalise' },
];
const STADES = [
  { value: 'qualification', label: 'Qualification' },
  { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'propale', label: 'Proposition' },
  { value: 'negociation', label: 'Negociation' },
  { value: 'signe', label: 'Signe' },
  { value: 'perdu', label: 'Perdu' },
];
const STADE_COLORS = {
  qualification: 'bg-blue-100 text-blue-700',
  diagnostic: 'bg-purple-100 text-purple-700',
  propale: 'bg-indigo-100 text-indigo-700',
  negociation: 'bg-orange-100 text-orange-700',
  signe: 'bg-green-100 text-green-700',
  perdu: 'bg-red-100 text-red-700',
};

const formatEUR = (v) => {
  if (v == null) return '-';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
};

const PROPRIETAIRES = [
  { value: 'lucas', label: 'Lucas' },
  { value: 'ayoub', label: 'Ayoub' },
  { value: 'david', label: 'David' },
];

const EMPTY_FORM = {
  entreprise_id: '', type_mission: 'audit_drs', intitule: '', montant_estime: '',
  probabilite: '50', date_signature_prevue: '', stade: 'qualification',
  ca_reel_signe: '', motif_perdu: '', proprietaire: '', notes: ''
};

export default function OpportunitesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [opportunites, setOpportunites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entreprises, setEntreprises] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ stade: '', type_mission: '', proprietaire: '' });
  const limit = 20;

  const fetchOpportunites = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.stade) params.set('stade', filters.stade);
      if (filters.type_mission) params.set('type_mission', filters.type_mission);
      if (filters.proprietaire) params.set('proprietaire', filters.proprietaire);
      params.set('page', page);
      params.set('limit', limit);
      const { data } = await api.get(`/opportunites?${params.toString()}`);
      setOpportunites(data.data || []);
      setTotal(data.total || 0);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setLoading(false); }
  }, [page, filters]);

  const fetchEntreprises = useCallback(async () => {
    try {
      const { data } = await api.get('/entreprises?limit=200');
      setEntreprises(data.data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchEntreprises(); }, [fetchEntreprises]);
  useEffect(() => { fetchOpportunites(); }, [fetchOpportunites]);

  const handleCreate = async () => {
    if (!form.entreprise_id || !form.intitule.trim() || !form.montant_estime) {
      toast.error('Entreprise, intitule et montant estime sont requis');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        montant_estime: parseFloat(form.montant_estime),
        probabilite: parseInt(form.probabilite),
      };
      if (!payload.date_signature_prevue) delete payload.date_signature_prevue;
      if (!payload.ca_reel_signe) delete payload.ca_reel_signe;
      else payload.ca_reel_signe = parseFloat(payload.ca_reel_signe);
      if (!payload.motif_perdu) delete payload.motif_perdu;
      if (!payload.notes) delete payload.notes;
      if (!payload.proprietaire) delete payload.proprietaire;
      await api.post('/opportunites', payload);
      toast.success('Opportunite creee');
      setShowCreate(false);
      setForm(EMPTY_FORM);
      fetchOpportunites();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  const totalPages = Math.ceil(total / limit);

  if (!loading && opportunites.length === 0 && !filters.stade && !filters.type_mission && !filters.proprietaire) {
    return (
      <div data-testid="opportunites-page">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">Opportunites</h1>
          <Button onClick={() => { setForm({...EMPTY_FORM, proprietaire: user?.nom?.split(' ')[0]?.toLowerCase() || 'lucas'}); setShowCreate(true); }} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="add-opportunite-btn">
            <Plus className="w-4 h-4 mr-2" /> Ajouter opportunite
          </Button>
        </div>
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-12 text-center" data-testid="opportunites-empty-state">
          <p className="text-brand-text-secondary font-inter">Aucune opportunite pour le moment.</p>
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
            <DialogTitle className="font-manrope">Nouvelle opportunite</DialogTitle>
            <DialogDescription className="font-inter text-sm">Renseignez les informations de l'opportunite.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-inter">Entreprise *</Label>
              <Select value={form.entreprise_id} onValueChange={v => setForm({...form, entreprise_id: v})}>
                <SelectTrigger data-testid="opp-form-entreprise"><SelectValue placeholder="Choisir une entreprise" /></SelectTrigger>
                <SelectContent>
                  {entreprises.map(e => <SelectItem key={e.id} value={e.id}>{e.nom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Intitule *</Label>
              <Input value={form.intitule} onChange={e => setForm({...form, intitule: e.target.value})} placeholder="Refonte site + audit SEO" data-testid="opp-form-intitule" className="font-inter" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-inter">Type de mission</Label>
                <Select value={form.type_mission} onValueChange={v => setForm({...form, type_mission: v})}>
                  <SelectTrigger data-testid="opp-form-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_MISSIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-inter">Stade</Label>
                <Select value={form.stade} onValueChange={v => setForm({...form, stade: v})}>
                  <SelectTrigger data-testid="opp-form-stade"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STADES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-inter">Montant estime (EUR) *</Label>
                <Input type="number" value={form.montant_estime} onChange={e => setForm({...form, montant_estime: e.target.value})} placeholder="10000" data-testid="opp-form-montant" className="font-inter" />
              </div>
              <div className="space-y-2">
                <Label className="font-inter">Probabilite (%) *</Label>
                <Input type="number" min={0} max={100} value={form.probabilite} onChange={e => setForm({...form, probabilite: e.target.value})} data-testid="opp-form-probabilite" className="font-inter" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-inter">Date signature prevue</Label>
                <Input type="date" value={form.date_signature_prevue} onChange={e => setForm({...form, date_signature_prevue: e.target.value})} data-testid="opp-form-date" className="font-inter" />
              </div>
              <div className="space-y-2">
                <Label className="font-inter">Proprietaire</Label>
                <Select value={form.proprietaire} onValueChange={v => setForm({...form, proprietaire: v})}>
                  <SelectTrigger data-testid="opp-form-proprietaire"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>
                    {PROPRIETAIRES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.stade === 'signe' && (
              <div className="space-y-2">
                <Label className="font-inter">CA reel signe (EUR)</Label>
                <Input type="number" value={form.ca_reel_signe} onChange={e => setForm({...form, ca_reel_signe: e.target.value})} data-testid="opp-form-ca-reel" className="font-inter" />
              </div>
            )}
            {form.stade === 'perdu' && (
              <div className="space-y-2">
                <Label className="font-inter">Motif perdu</Label>
                <Textarea value={form.motif_perdu} onChange={e => setForm({...form, motif_perdu: e.target.value})} rows={2} data-testid="opp-form-motif" className="font-inter" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="font-inter border-brand-border">Annuler</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="opp-form-save">
              {saving ? 'Creation...' : 'Creer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div data-testid="opportunites-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">Opportunites</h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1">{total} opportunite{total > 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => { setForm({...EMPTY_FORM, proprietaire: user?.nom?.split(' ')[0]?.toLowerCase() || 'lucas'}); setShowCreate(true); }} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="add-opportunite-btn">
          <Plus className="w-4 h-4 mr-2" /> Ajouter opportunite
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={filters.stade || '__all__'} onValueChange={v => { setFilters(p => ({...p, stade: v === '__all__' ? '' : v})); setPage(1); }}>
          <SelectTrigger className="w-40 font-inter" data-testid="opp-filter-stade"><SelectValue placeholder="Stade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous les stades</SelectItem>
            {STADES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.type_mission || '__all__'} onValueChange={v => { setFilters(p => ({...p, type_mission: v === '__all__' ? '' : v})); setPage(1); }}>
          <SelectTrigger className="w-44 font-inter" data-testid="opp-filter-type"><SelectValue placeholder="Type mission" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous les types</SelectItem>
            {TYPE_MISSIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.proprietaire || '__all__'} onValueChange={v => { setFilters(p => ({...p, proprietaire: v === '__all__' ? '' : v})); setPage(1); }}>
          <SelectTrigger className="w-36 font-inter" data-testid="opp-filter-proprio"><SelectValue placeholder="Proprietaire" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous</SelectItem>
            <SelectItem value="lucas">Lucas</SelectItem>
            <SelectItem value="ayoub">Ayoub</SelectItem>
            <SelectItem value="david">David</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-brand-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-brand-bg">
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Entreprise</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden sm:table-cell">Type</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Intitule</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden md:table-cell">Montant est.</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden md:table-cell">Prob.</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Montant pond.</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden lg:table-cell">Date sign.</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Stade</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden sm:table-cell">Proprio.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-brand-text-secondary font-inter">Chargement...</TableCell></TableRow>
              ) : opportunites.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-brand-text-secondary font-inter">Aucun resultat</TableCell></TableRow>
              ) : opportunites.map(o => (
                <TableRow key={o.id} data-testid={`opp-row-${o.id}`}>
                  <TableCell>
                    <button onClick={() => navigate(`/entreprises/${o.entreprise_id}`)} className="text-sm text-brand-primary hover:underline font-inter">
                      {o.entreprise_nom || '-'}
                    </button>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge className="bg-brand-bg text-brand-text-secondary border-brand-border text-xs font-inter">
                      {TYPE_MISSIONS.find(t => t.value === o.type_mission)?.label || o.type_mission}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-inter text-sm font-medium">{o.intitule}</TableCell>
                  <TableCell className="font-inter text-sm hidden md:table-cell">{formatEUR(o.montant_estime)}</TableCell>
                  <TableCell className="font-mono text-sm hidden md:table-cell">{o.probabilite}%</TableCell>
                  <TableCell className="font-inter text-sm font-bold">{formatEUR(o.montant_pondere)}</TableCell>
                  <TableCell className="font-inter text-sm hidden lg:table-cell">{o.date_signature_prevue || '-'}</TableCell>
                  <TableCell>
                    <Badge className={`${STADE_COLORS[o.stade] || 'bg-gray-100 text-gray-700'} text-xs font-inter border-0`}>
                      {STADES.find(s => s.value === o.stade)?.label || o.stade}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-inter text-sm capitalize hidden sm:table-cell">{o.proprietaire || '-'}</TableCell>
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
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="font-inter border-brand-border"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="font-inter border-brand-border"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      {renderCreateDialog()}
    </div>
  );
}
