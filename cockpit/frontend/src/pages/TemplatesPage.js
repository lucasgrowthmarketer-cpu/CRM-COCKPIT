import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api, { formatApiError } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import {
  FileText, Plus, Pencil, Trash2, Eye, Copy, AlertTriangle, Check,
  Mail, Send, ArrowLeftRight, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

const TYPES = [
  { value: 'cold_initial',     label: 'Cold initial',        color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'relance_j3',       label: 'Relance J+3',         color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'breakup_j10',      label: 'Breakup J+10',        color: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'reengagement_j30', label: 'Ré-engagement J+30',  color: 'bg-purple-100 text-purple-700 border-purple-200' },
];

const KNOWN_VARIABLES = [
  'nom_entreprise', 'dirigeant', 'ville', 'region', 'ca',
  'signal_principal', 'secteur', 'naf_code',
];

const SAMPLE_VALUES = {
  nom_entreprise: 'SCOMO',
  dirigeant: 'Corine Benac',
  ville: 'Toulouse',
  region: 'Occitanie',
  ca: '25M€',
  signal_principal: 'site obsolète',
  secteur: 'Commerce de gros de machines-outils',
  naf_code: '46.62Z',
};

const EMPTY_FORM = {
  nom: '',
  secteur_id: '',
  type: 'cold_initial',
  objet: '',
  corps: '',
  actif: true,
};

// Extract {variable} occurrences from text
function extractVariables(text) {
  const matches = [...(text || '').matchAll(/\{([a-z_]+)\}/g)];
  return [...new Set(matches.map(m => m[1]))];
}

// Render template: replace {var} with sample value
function renderPreview(template, values = SAMPLE_VALUES) {
  if (!template) return '';
  return template.replace(/\{([a-z_]+)\}/g, (match, key) => {
    if (values[key] != null) return values[key];
    return `[${key}?]`;
  });
}

// Count words (rough French word count)
function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getTypeStyle(type) {
  return TYPES.find(t => t.value === type)?.color || 'bg-slate-100 text-slate-700 border-slate-200';
}
function getTypeLabel(type) {
  return TYPES.find(t => t.value === type)?.label || type;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [secteurs, setSecteurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterSecteur, setFilterSecteur] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [previewOnly, setPreviewOnly] = useState(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);
      if (filterSecteur) params.set('secteur_id', filterSecteur);
      const { data } = await api.get(`/templates?${params.toString()}`);
      setTemplates(data.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [filterType, filterSecteur]);

  const fetchSecteurs = useCallback(async () => {
    try {
      const { data } = await api.get('/secteurs');
      setSecteurs(data.data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchSecteurs(); }, [fetchSecteurs]);
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setForm({
      nom: t.nom || '',
      secteur_id: t.secteur_id || '',
      type: t.type || 'cold_initial',
      objet: t.objet || '',
      corps: t.corps || '',
      actif: !!t.actif,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.nom.trim() || !form.objet.trim() || !form.corps.trim()) {
      toast.error('Nom, objet et corps sont requis');
      return;
    }
    setSaving(true);
    try {
      const variables = extractVariables(form.objet + ' ' + form.corps);
      const payload = { ...form, variables };
      if (!payload.secteur_id) payload.secteur_id = null;
      if (editingId) {
        await api.put(`/templates/${editingId}`, payload);
        toast.success('Template mis à jour');
      } else {
        await api.post('/templates', payload);
        toast.success('Template créé');
      }
      setShowDialog(false);
      fetchTemplates();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Supprimer "${t.nom}" ?`)) return;
    try {
      await api.delete(`/templates/${t.id}`);
      toast.success('Template supprimé');
      fetchTemplates();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const handleDuplicate = async (t) => {
    try {
      const payload = {
        nom: `${t.nom} (copie)`,
        secteur_id: t.secteur_id,
        type: t.type,
        objet: t.objet,
        corps: t.corps,
        variables: t.variables || [],
        actif: false,
      };
      await api.post('/templates', payload);
      toast.success('Template dupliqué');
      fetchTemplates();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const handleCopyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('Copié'),
      () => toast.error('Impossible de copier')
    );
  };

  // Doctrine compliance checks for the form
  const objetLen = form.objet.length;
  const corpsWords = countWords(form.corps);
  const objetWords = countWords(form.objet);
  const startsWithCompany = /^\{nom_entreprise\}/i.test(form.corps.trim()) ||
    form.corps.trim().toLowerCase().startsWith(SAMPLE_VALUES.nom_entreprise.toLowerCase());
  const usedVars = useMemo(() => extractVariables(form.objet + ' ' + form.corps), [form.objet, form.corps]);
  const unknownVars = usedVars.filter(v => !KNOWN_VARIABLES.includes(v));

  // Group templates by type for display
  const byType = TYPES.map(t => ({
    ...t,
    items: templates.filter(tpl => tpl.type === t.value),
  }));

  return (
    <div data-testid="templates-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">
            Templates d'emails
          </h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1">
            Modèles de cold emails, relances, breakup et ré-engagement. Variables dynamiques entre {'{accolades}'}.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
          data-testid="add-template-btn"
        >
          <Plus className="w-4 h-4 mr-2" /> Nouveau template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={filterType || '__all__'} onValueChange={v => setFilterType(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-52 font-inter" data-testid="tpl-filter-type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous types</SelectItem>
            {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSecteur || '__all__'} onValueChange={v => setFilterSecteur(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-64 font-inter" data-testid="tpl-filter-secteur">
            <SelectValue placeholder="Secteur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tous secteurs</SelectItem>
            {secteurs.map(s => <SelectItem key={s.id} value={s.id}>{s.libelle}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-12 text-center">
          <FileText className="w-10 h-10 text-brand-text-secondary mx-auto mb-4" />
          <p className="font-inter text-brand-text-secondary mb-4">
            Aucun template {filterType || filterSecteur ? 'avec ces filtres' : 'pour le moment'}.
          </p>
          <Button
            onClick={openCreate}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
          >
            <Plus className="w-4 h-4 mr-2" /> Créer un template
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {byType.map(group => {
            if (group.items.length === 0) return null;
            return (
              <div key={group.value}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge className={`${group.color} text-xs font-inter border`}>
                    {group.label}
                  </Badge>
                  <span className="text-xs text-brand-text-secondary font-inter">
                    {group.items.length} template{group.items.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.items.map(t => (
                    <div
                      key={t.id}
                      className={`bg-white border border-brand-border rounded-lg p-4 hover:shadow-sm transition-shadow ${
                        !t.actif ? 'opacity-60' : ''
                      }`}
                      data-testid={`tpl-card-${t.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-manrope font-semibold text-sm text-brand-text-primary truncate" title={t.nom}>
                            {t.nom}
                          </h3>
                          {t.secteur_libelle && (
                            <p className="text-xs text-brand-text-secondary font-inter truncate mt-0.5">
                              {t.secteur_libelle}
                            </p>
                          )}
                        </div>
                        {!t.actif && (
                          <Badge className="bg-slate-100 text-slate-600 text-[10px] font-inter border-0 shrink-0">
                            Inactif
                          </Badge>
                        )}
                      </div>

                      <div className="bg-brand-bg rounded p-2 mb-3 space-y-1">
                        <div className="text-xs font-inter">
                          <span className="text-brand-text-secondary">Objet : </span>
                          <span className="text-brand-text-primary font-medium truncate block" title={t.objet}>
                            {t.objet}
                          </span>
                        </div>
                        <div className="text-xs font-inter text-brand-text-secondary line-clamp-3">
                          {t.corps}
                        </div>
                      </div>

                      {t.variables && t.variables.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {t.variables.slice(0, 4).map(v => (
                            <Badge key={v} className="bg-brand-primary/10 text-brand-primary text-[10px] font-jetbrains border-0 px-1.5 py-0">
                              {`{${v}}`}
                            </Badge>
                          ))}
                          {t.variables.length > 4 && (
                            <Badge className="bg-brand-bg text-brand-text-secondary text-[10px] font-inter border-0">
                              +{t.variables.length - 4}
                            </Badge>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1 justify-end border-t border-brand-border pt-2">
                        <button
                          onClick={() => setPreviewOnly(t)}
                          className="text-brand-text-secondary hover:text-brand-primary p-1.5 rounded hover:bg-brand-bg"
                          title="Prévisualiser"
                          data-testid={`tpl-preview-${t.id}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEdit(t)}
                          className="text-brand-text-secondary hover:text-brand-primary p-1.5 rounded hover:bg-brand-bg"
                          title="Modifier"
                          data-testid={`tpl-edit-${t.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDuplicate(t)}
                          className="text-brand-text-secondary hover:text-brand-primary p-1.5 rounded hover:bg-brand-bg"
                          title="Dupliquer"
                          data-testid={`tpl-duplicate-${t.id}`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(t)}
                          className="text-brand-text-secondary hover:text-brand-danger p-1.5 rounded hover:bg-brand-bg"
                          title="Supprimer"
                          data-testid={`tpl-delete-${t.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={showDialog} onOpenChange={(v) => { setShowDialog(v); if (!v) setEditingId(null); }}>
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto" data-testid="tpl-dialog">
          <DialogHeader>
            <DialogTitle className="font-manrope">
              {editingId ? 'Modifier le template' : 'Nouveau template'}
            </DialogTitle>
            <DialogDescription className="font-inter text-sm">
              Variables disponibles : {KNOWN_VARIABLES.map(v => `{${v}}`).join(', ')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left column: editor */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label className="font-inter text-sm">Nom du template</Label>
                  <Input
                    value={form.nom}
                    onChange={e => setForm({ ...form, nom: e.target.value })}
                    placeholder="Ex: Cold initial - Machines-outils"
                    className="font-inter"
                    data-testid="tpl-form-nom"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-inter text-sm">Type</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                    <SelectTrigger data-testid="tpl-form-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-inter text-sm">Secteur (optionnel)</Label>
                  <Select value={form.secteur_id || '__none__'} onValueChange={v => setForm({ ...form, secteur_id: v === '__none__' ? '' : v })}>
                    <SelectTrigger data-testid="tpl-form-secteur">
                      <SelectValue placeholder="Aucun" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Aucun (générique)</SelectItem>
                      {secteurs.map(s => <SelectItem key={s.id} value={s.id}>{s.libelle}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="font-inter text-sm">Objet</Label>
                  <span className={`text-[10px] font-inter ${
                    objetLen > 40 ? 'text-amber-600' : 'text-brand-text-secondary'
                  }`}>
                    {objetWords} mots &middot; {objetLen} chars {objetLen > 40 && '(long)'}
                  </span>
                </div>
                <Input
                  value={form.objet}
                  onChange={e => setForm({ ...form, objet: e.target.value })}
                  placeholder="{nom_entreprise} — parc machines"
                  className="font-inter"
                  data-testid="tpl-form-objet"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="font-inter text-sm">Corps du message</Label>
                  <span className={`text-[10px] font-inter ${
                    corpsWords > 80 ? 'text-amber-600' : 'text-brand-text-secondary'
                  }`}>
                    {corpsWords} mots {corpsWords > 80 && '(doctrine : < 80)'}
                  </span>
                </div>
                <Textarea
                  value={form.corps}
                  onChange={e => setForm({ ...form, corps: e.target.value })}
                  rows={14}
                  placeholder="Bonjour {dirigeant},&#10;&#10;{nom_entreprise} ..."
                  className="font-inter font-mono text-xs"
                  data-testid="tpl-form-corps"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-sm font-inter cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.actif}
                    onChange={e => setForm({ ...form, actif: e.target.checked })}
                    className="rounded border-brand-border"
                    data-testid="tpl-form-actif"
                  />
                  <span>Template actif</span>
                </label>
                {usedVars.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] font-inter text-brand-text-secondary">
                    <Sparkles className="w-3 h-3" />
                    {usedVars.length} variable{usedVars.length > 1 ? 's' : ''} détectée{usedVars.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {/* Doctrine checks */}
              {(corpsWords > 80 || !startsWithCompany || unknownVars.length > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-inter font-medium text-amber-900">
                    <AlertTriangle className="w-4 h-4" /> Doctrine cold email
                  </div>
                  <ul className="text-xs font-inter text-amber-800 space-y-1 list-inside">
                    {corpsWords > 80 && (
                      <li>• Corps dépasse 80 mots ({corpsWords})</li>
                    )}
                    {!startsWithCompany && form.corps.trim() && (
                      <li>• Le corps ne commence pas par le nom de l'entreprise</li>
                    )}
                    {unknownVars.length > 0 && (
                      <li>• Variables inconnues : {unknownVars.map(v => `{${v}}`).join(', ')}</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* Right column: preview */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-brand-primary" />
                <Label className="font-inter text-sm font-medium">Aperçu avec exemple</Label>
              </div>

              <div className="bg-white border border-brand-border rounded-lg overflow-hidden">
                <div className="bg-brand-bg px-4 py-2 border-b border-brand-border flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-brand-text-secondary" />
                  <div className="text-xs font-inter text-brand-text-secondary">À : corine.benac@scomo.fr</div>
                </div>
                <div className="px-4 py-2 border-b border-brand-border">
                  <div className="text-[10px] uppercase font-inter text-brand-text-secondary tracking-wide mb-0.5">Objet</div>
                  <div className="font-manrope font-medium text-sm text-brand-text-primary">
                    {renderPreview(form.objet) || <span className="italic text-brand-text-secondary">(vide)</span>}
                  </div>
                </div>
                <div className="px-4 py-3 text-sm font-inter text-brand-text-primary whitespace-pre-wrap">
                  {renderPreview(form.corps) || <span className="italic text-brand-text-secondary">(vide)</span>}
                </div>
              </div>

              <div className="bg-brand-bg rounded-lg p-3 text-xs font-inter text-brand-text-secondary">
                <div className="font-medium text-brand-text-primary mb-1">Valeurs de test utilisées :</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {Object.entries(SAMPLE_VALUES).slice(0, 6).map(([k, v]) => (
                    <div key={k}>
                      <span className="font-jetbrains text-brand-primary">{`{${k}}`}</span>
                      {' → '}
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyToClipboard(renderPreview(form.objet))}
                  disabled={!form.objet}
                  className="font-inter border-brand-border text-xs"
                >
                  <Copy className="w-3 h-3 mr-1.5" /> Copier objet
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyToClipboard(renderPreview(form.corps))}
                  disabled={!form.corps}
                  className="font-inter border-brand-border text-xs"
                >
                  <Copy className="w-3 h-3 mr-1.5" /> Copier corps
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setShowDialog(false); setEditingId(null); }}
              className="font-inter border-brand-border"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
              data-testid="tpl-save-btn"
            >
              {saving ? '...' : (editingId ? 'Enregistrer' : 'Créer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview-only dialog (click on Eye icon) */}
      <Dialog open={!!previewOnly} onOpenChange={(v) => { if (!v) setPreviewOnly(null); }}>
        <DialogContent className="sm:max-w-2xl" data-testid="tpl-preview-dialog">
          <DialogHeader>
            <DialogTitle className="font-manrope">{previewOnly?.nom}</DialogTitle>
            <DialogDescription className="font-inter text-sm">
              <Badge className={`${getTypeStyle(previewOnly?.type)} text-xs font-inter border mr-2`}>
                {getTypeLabel(previewOnly?.type)}
              </Badge>
              {previewOnly?.secteur_libelle}
            </DialogDescription>
          </DialogHeader>
          {previewOnly && (
            <>
              <div className="bg-white border border-brand-border rounded-lg overflow-hidden">
                <div className="bg-brand-bg px-4 py-2 border-b border-brand-border">
                  <div className="text-[10px] uppercase font-inter text-brand-text-secondary tracking-wide mb-0.5">Objet</div>
                  <div className="font-manrope font-medium text-sm">
                    {renderPreview(previewOnly.objet)}
                  </div>
                </div>
                <div className="px-4 py-3 text-sm font-inter whitespace-pre-wrap">
                  {renderPreview(previewOnly.corps)}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyToClipboard(renderPreview(previewOnly.objet))}
                  className="font-inter border-brand-border"
                >
                  <Copy className="w-3 h-3 mr-1.5" /> Copier objet
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyToClipboard(renderPreview(previewOnly.corps))}
                  className="font-inter border-brand-border"
                >
                  <Copy className="w-3 h-3 mr-1.5" /> Copier corps
                </Button>
                <Button
                  size="sm"
                  onClick={() => { openEdit(previewOnly); setPreviewOnly(null); }}
                  className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
                >
                  <Pencil className="w-3 h-3 mr-1.5" /> Modifier
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
