import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Textarea } from '../components/ui/textarea';
import { Slider } from '../components/ui/slider';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '../components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Plus, Upload, Filter, Search, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

const REGIONS = [
  "Auvergne-Rhone-Alpes","Bourgogne-Franche-Comte","Bretagne","Centre-Val de Loire",
  "Corse","Grand Est","Hauts-de-France","Ile-de-France","Normandie",
  "Nouvelle-Aquitaine","Occitanie","Pays de la Loire","Provence-Alpes-Cote d'Azur"
];
const STATUTS = [
  { value:"froid", label:"Froid" },{ value:"qualifie", label:"Qualifie" },
  { value:"contacte", label:"Contacte" },{ value:"en_conversation", label:"En conversation" },
  { value:"diagnostic_envoye", label:"Diagnostic envoye" },{ value:"propale", label:"Proposition" },
  { value:"signe", label:"Signe" },{ value:"perdu", label:"Perdu" }
];
const SIGNAUX_OPTIONS = [
  { value:"ownership_transition", label:"Transition de propriete" },
  { value:"site_obsolete", label:"Site obsolete" },
  { value:"seo_faible", label:"SEO faible" },
  { value:"pas_https", label:"Pas HTTPS" }
];
const SOURCES = ["import_excel","pappers","manuel","linkedin"];
const PIPELINE_COLORS = {
  froid:"bg-gray-100 text-gray-700",qualifie:"bg-blue-100 text-blue-700",
  contacte:"bg-orange-100 text-orange-700",en_conversation:"bg-yellow-100 text-yellow-700",
  diagnostic_envoye:"bg-purple-100 text-purple-700",propale:"bg-indigo-100 text-indigo-700",
  signe:"bg-green-100 text-green-700",perdu:"bg-red-100 text-red-700"
};

const formatCA = (ca) => {
  if (!ca && ca !== 0) return "-";
  return new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(ca);
};

const EMPTY_FORM = {
  nom:'', siret:'', naf_code:'', secteur_id:'', ca:'', effectif:'',
  ville:'', region:'', adresse:'', site_web:'', authority_score:'',
  signaux_digitaux:[], source:'manuel', statut_pipeline:'froid',
  proprietaire:'', notes:''
};

const PROPRIETAIRES = [
  { value:'lucas', label:'Lucas' },
  { value:'ayoub', label:'Ayoub' },
  { value:'david', label:'David' },
];

export default function EntreprisesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [entreprises, setEntreprises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [secteurs, setSecteurs] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({
    secteur_ids:[], regions:[], statuts:[], proprietaire:'', score_icp_min:0, signaux:[]
  });
  const limit = 20;

  const fetchEntreprises = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filters.secteur_ids.length) params.set('secteur_ids', filters.secteur_ids.join(','));
      if (filters.regions.length) params.set('regions', filters.regions.join(','));
      if (filters.statuts.length) params.set('statuts', filters.statuts.join(','));
      if (filters.proprietaire) params.set('proprietaire', filters.proprietaire);
      if (filters.score_icp_min > 0) params.set('score_icp_min', filters.score_icp_min);
      if (filters.signaux.length) params.set('signaux', filters.signaux.join(','));
      params.set('page', page);
      params.set('limit', limit);

      const { data } = await api.get(`/entreprises?${params.toString()}`);
      setEntreprises(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [search, page, filters]);

  const fetchSecteurs = useCallback(async () => {
    try {
      const { data } = await api.get('/secteurs');
      setSecteurs(data.data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchSecteurs(); }, [fetchSecteurs]);
  useEffect(() => { fetchEntreprises(); }, [fetchEntreprises]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleCreate = async () => {
    if (!form.nom.trim()) { toast.error('Le nom est requis'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.ca) payload.ca = parseFloat(payload.ca);
      else delete payload.ca;
      if (payload.effectif) payload.effectif = parseInt(payload.effectif);
      else delete payload.effectif;
      if (payload.authority_score) payload.authority_score = parseInt(payload.authority_score);
      else delete payload.authority_score;
      if (!payload.siret) delete payload.siret;
      if (!payload.naf_code) delete payload.naf_code;
      if (!payload.secteur_id) delete payload.secteur_id;
      if (!payload.ville) delete payload.ville;
      if (!payload.region) delete payload.region;
      if (!payload.adresse) delete payload.adresse;
      if (!payload.site_web) delete payload.site_web;
      if (!payload.notes) delete payload.notes;
      if (!payload.proprietaire) delete payload.proprietaire;

      await api.post('/entreprises', payload);
      toast.success('Entreprise creee');
      setShowCreate(false);
      setForm(EMPTY_FORM);
      fetchEntreprises();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleFilter = (key, value) => {
    setFilters(prev => {
      const arr = prev[key];
      const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ secteur_ids:[], regions:[], statuts:[], proprietaire:'', score_icp_min:0, signaux:[] });
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);
  const hasActiveFilters = filters.secteur_ids.length || filters.regions.length || filters.statuts.length || filters.proprietaire || filters.score_icp_min > 0 || filters.signaux.length;

  const toggleSignal = (val) => {
    setForm(prev => ({
      ...prev,
      signaux_digitaux: prev.signaux_digitaux.includes(val)
        ? prev.signaux_digitaux.filter(v => v !== val)
        : [...prev.signaux_digitaux, val]
    }));
  };

  // Empty state
  if (!loading && entreprises.length === 0 && !search && !hasActiveFilters) {
    return (
      <div data-testid="entreprises-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">Entreprises</h1>
        </div>
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-12 text-center" data-testid="entreprises-empty-state">
          <p className="text-brand-text-secondary font-inter mb-6">Aucune entreprise pour le moment.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button onClick={() => navigate('/import')} variant="outline" className="font-inter border-brand-border" data-testid="import-excel-btn">
              <Upload className="w-4 h-4 mr-2" /> Importer un fichier Excel
            </Button>
            <Button onClick={() => { setForm({...EMPTY_FORM, proprietaire: user?.nom?.split(' ')[0]?.toLowerCase() || 'lucas'}); setShowCreate(true); }} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="add-entreprise-empty-btn">
              <Plus className="w-4 h-4 mr-2" /> Ajouter manuellement
            </Button>
          </div>
        </div>
        {renderCreateDialog()}
      </div>
    );
  }

  function renderCreateDialog() {
    return (
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-manrope">Nouvelle entreprise</DialogTitle>
            <DialogDescription className="font-inter text-sm">Renseignez les informations de l'entreprise.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label className="font-inter">Nom *</Label>
              <Input value={form.nom} onChange={e => setForm({...form, nom:e.target.value})} placeholder="Nom de l'entreprise" data-testid="form-nom" className="font-inter" />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">SIRET</Label>
              <Input value={form.siret} onChange={e => setForm({...form, siret:e.target.value})} placeholder="14 chiffres" className="font-mono" data-testid="form-siret" maxLength={14} />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Code NAF</Label>
              <Input value={form.naf_code} onChange={e => setForm({...form, naf_code:e.target.value})} placeholder="28.41Z" className="font-mono" data-testid="form-naf" />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Secteur</Label>
              <Select value={form.secteur_id} onValueChange={v => setForm({...form, secteur_id:v})}>
                <SelectTrigger data-testid="form-secteur"><SelectValue placeholder="Choisir un secteur" /></SelectTrigger>
                <SelectContent>
                  {secteurs.map(s => <SelectItem key={s.id} value={s.id}>{s.libelle}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Source</Label>
              <Select value={form.source} onValueChange={v => setForm({...form, source:v})}>
                <SelectTrigger data-testid="form-source"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">CA (EUR)</Label>
              <Input type="number" value={form.ca} onChange={e => setForm({...form, ca:e.target.value})} placeholder="5000000" data-testid="form-ca" className="font-inter" />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Effectif</Label>
              <Input type="number" value={form.effectif} onChange={e => setForm({...form, effectif:e.target.value})} placeholder="50" data-testid="form-effectif" className="font-inter" />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Ville</Label>
              <Input value={form.ville} onChange={e => setForm({...form, ville:e.target.value})} placeholder="Lyon" data-testid="form-ville" className="font-inter" />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Region</Label>
              <Select value={form.region} onValueChange={v => setForm({...form, region:v})}>
                <SelectTrigger data-testid="form-region"><SelectValue placeholder="Choisir une region" /></SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Site web</Label>
              <Input value={form.site_web} onChange={e => setForm({...form, site_web:e.target.value})} placeholder="https://example.com" data-testid="form-site-web" className="font-inter" />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Authority Score (0-100)</Label>
              <Input type="number" min={0} max={100} value={form.authority_score} onChange={e => setForm({...form, authority_score:e.target.value})} placeholder="0" data-testid="form-authority" className="font-inter" />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Statut pipeline</Label>
              <Select value={form.statut_pipeline} onValueChange={v => setForm({...form, statut_pipeline:v})}>
                <SelectTrigger data-testid="form-statut"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Proprietaire</Label>
              <Select value={form.proprietaire} onValueChange={v => setForm({...form, proprietaire:v})}>
                <SelectTrigger data-testid="form-proprietaire"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {PROPRIETAIRES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="font-inter">Signaux digitaux</Label>
              <div className="flex flex-wrap gap-3">
                {SIGNAUX_OPTIONS.map(s => (
                  <label key={s.value} className="flex items-center gap-2 text-sm font-inter cursor-pointer">
                    <Checkbox
                      checked={form.signaux_digitaux.includes(s.value)}
                      onCheckedChange={() => toggleSignal(s.value)}
                      data-testid={`form-signal-${s.value}`}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="font-inter">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} rows={3} placeholder="Notes..." data-testid="form-notes" className="font-inter" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} className="font-inter border-brand-border" data-testid="form-cancel-btn">Annuler</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="form-save-btn">
              {saving ? 'Creation...' : 'Creer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div data-testid="entreprises-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">Entreprises</h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1">{total} entreprise{total > 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/import')} className="font-inter border-brand-border" data-testid="import-btn">
            <Upload className="w-4 h-4 mr-2" /> Importer Excel
          </Button>
          <Button onClick={() => {setForm({...EMPTY_FORM, proprietaire: user?.nom?.split(' ')[0]?.toLowerCase() || 'lucas'}); setShowCreate(true);}} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="add-entreprise-btn">
            <Plus className="w-4 h-4 mr-2" /> Ajouter entreprise
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-secondary" />
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Rechercher par nom, ville, SIRET..."
            className="pl-9 font-inter"
            data-testid="entreprises-search"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters(true)}
          className={`font-inter border-brand-border ${hasActiveFilters ? 'border-brand-primary text-brand-primary' : ''}`}
          data-testid="open-filters-btn"
        >
          <Filter className="w-4 h-4 mr-2" /> Filtres {hasActiveFilters ? `(${[filters.secteur_ids.length, filters.regions.length, filters.statuts.length, filters.proprietaire ? 1 : 0, filters.score_icp_min > 0 ? 1 : 0, filters.signaux.length].reduce((a,b)=>a+b,0)})` : ''}
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-brand-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-brand-bg">
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Nom</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden lg:table-cell">Secteur</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden md:table-cell">CA</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden lg:table-cell">Effectif</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden md:table-cell">Region</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden lg:table-cell">Auth.</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Statut</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">ICP</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden sm:table-cell">Proprio.</TableHead>
                <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden lg:table-cell">Dern. int.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-brand-text-secondary font-inter">Chargement...</TableCell></TableRow>
              ) : entreprises.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-brand-text-secondary font-inter">Aucun resultat</TableCell></TableRow>
              ) : (
                entreprises.map(e => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer hover:bg-brand-bg/50"
                    onClick={() => navigate(`/entreprises/${e.id}`)}
                    data-testid={`entreprise-row-${e.id}`}
                  >
                    <TableCell className="font-inter font-medium text-sm text-brand-text-primary">{e.nom}</TableCell>
                    <TableCell className="text-sm text-brand-text-secondary font-inter hidden lg:table-cell">{e.secteur_libelle || '-'}</TableCell>
                    <TableCell className="font-inter text-sm hidden md:table-cell">{formatCA(e.ca)}</TableCell>
                    <TableCell className="font-inter text-sm hidden lg:table-cell">{e.effectif || '-'}</TableCell>
                    <TableCell className="font-inter text-sm hidden md:table-cell">{e.region || '-'}</TableCell>
                    <TableCell className="font-mono text-sm hidden lg:table-cell">{e.authority_score ?? '-'}</TableCell>
                    <TableCell>
                      <Badge className={`${PIPELINE_COLORS[e.statut_pipeline] || 'bg-gray-100 text-gray-700'} text-xs font-inter border-0`}>
                        {STATUTS.find(s => s.value === e.statut_pipeline)?.label || e.statut_pipeline}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`font-mono text-sm font-medium ${
                        e.score_icp > 70 ? 'text-brand-success' : e.score_icp >= 40 ? 'text-brand-warning' : 'text-brand-danger'
                      }`}>
                        {e.score_icp}
                      </span>
                    </TableCell>
                    <TableCell className="font-inter text-sm capitalize hidden sm:table-cell">{e.proprietaire || '-'}</TableCell>
                    <TableCell className="font-inter text-sm hidden lg:table-cell">{e.date_derniere_interaction ? new Date(e.date_derniere_interaction).toLocaleDateString('fr-FR') : '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-brand-text-secondary font-inter">
            Page {page} sur {totalPages} ({total} resultats)
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="font-inter border-brand-border" data-testid="prev-page-btn">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="font-inter border-brand-border" data-testid="next-page-btn">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Filter Sheet */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="right" className="w-80 sm:w-96 overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-manrope">Filtres</SheetTitle>
            <SheetDescription className="font-inter text-sm">Affinez votre recherche</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            {/* Secteur filter */}
            <div>
              <Label className="font-inter font-medium text-sm mb-2 block">Secteur</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {secteurs.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-sm font-inter cursor-pointer">
                    <Checkbox
                      checked={filters.secteur_ids.includes(s.id)}
                      onCheckedChange={() => toggleFilter('secteur_ids', s.id)}
                      data-testid={`filter-secteur-${s.naf_code}`}
                    />
                    <span className="truncate">{s.libelle}</span>
                  </label>
                ))}
              </div>
            </div>
            {/* Region filter */}
            <div>
              <Label className="font-inter font-medium text-sm mb-2 block">Region</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {REGIONS.map(r => (
                  <label key={r} className="flex items-center gap-2 text-sm font-inter cursor-pointer">
                    <Checkbox
                      checked={filters.regions.includes(r)}
                      onCheckedChange={() => toggleFilter('regions', r)}
                      data-testid={`filter-region-${r}`}
                    />
                    <span className="truncate">{r}</span>
                  </label>
                ))}
              </div>
            </div>
            {/* Statut filter */}
            <div>
              <Label className="font-inter font-medium text-sm mb-2 block">Statut pipeline</Label>
              <div className="space-y-2">
                {STATUTS.map(s => (
                  <label key={s.value} className="flex items-center gap-2 text-sm font-inter cursor-pointer">
                    <Checkbox
                      checked={filters.statuts.includes(s.value)}
                      onCheckedChange={() => toggleFilter('statuts', s.value)}
                      data-testid={`filter-statut-${s.value}`}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            {/* Proprietaire filter */}
            <div>
              <Label className="font-inter font-medium text-sm mb-2 block">Proprietaire</Label>
              <Select value={filters.proprietaire} onValueChange={v => { setFilters(prev => ({...prev, proprietaire: v === '__all__' ? '' : v})); setPage(1); }}>
                <SelectTrigger data-testid="filter-proprietaire"><SelectValue placeholder="Tous" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tous</SelectItem>
                  <SelectItem value="lucas">Lucas</SelectItem>
                  <SelectItem value="ayoub">Ayoub</SelectItem>
                  <SelectItem value="david">David</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Score ICP min */}
            <div>
              <Label className="font-inter font-medium text-sm mb-2 block">Score ICP minimum : {filters.score_icp_min}</Label>
              <Slider
                value={[filters.score_icp_min]}
                onValueChange={([v]) => { setFilters(prev => ({...prev, score_icp_min: v})); setPage(1); }}
                max={100}
                step={5}
                className="mt-2"
                data-testid="filter-icp-slider"
              />
            </div>
            {/* Signaux filter */}
            <div>
              <Label className="font-inter font-medium text-sm mb-2 block">Signaux digitaux</Label>
              <div className="space-y-2">
                {SIGNAUX_OPTIONS.map(s => (
                  <label key={s.value} className="flex items-center gap-2 text-sm font-inter cursor-pointer">
                    <Checkbox
                      checked={filters.signaux.includes(s.value)}
                      onCheckedChange={() => toggleFilter('signaux', s.value)}
                      data-testid={`filter-signal-${s.value}`}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
            {/* Clear filters */}
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="w-full font-inter border-brand-border" data-testid="clear-filters-btn">
                <X className="w-4 h-4 mr-2" /> Reinitialiser les filtres
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {renderCreateDialog()}
    </div>
  );
}
