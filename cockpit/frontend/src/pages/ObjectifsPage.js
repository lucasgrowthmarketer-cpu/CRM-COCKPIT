import React, { useState, useEffect, useCallback } from 'react';
import api, { formatApiError } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import { Target, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const formatEUR = (v) => {
  if (v == null) return '-';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(v);
};

const today = () => new Date().toISOString().slice(0, 10);
const plusMonths = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

const EMPTY_FORM = {
  objectif_mensuel_cible: '',
  objectif_annuel_cible: '',
  one_shot_moyen: '',
  date_debut: today(),
  date_cible: plusMonths(6),
  objectif_mensuel_courant: '',
  libelle: '',
  actif: true,
};

export default function ObjectifsPage() {
  const [objectifs, setObjectifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchObjectifs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/objectifs');
      setObjectifs(data.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchObjectifs(); }, [fetchObjectifs]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  };

  const openEdit = (o) => {
    setEditingId(o.id);
    setForm({
      objectif_mensuel_cible: String(o.objectif_mensuel_cible),
      objectif_annuel_cible: o.objectif_annuel_cible != null ? String(o.objectif_annuel_cible) : '',
      one_shot_moyen: o.one_shot_moyen != null ? String(o.one_shot_moyen) : '',
      date_debut: o.date_debut || today(),
      date_cible: o.date_cible || plusMonths(6),
      objectif_mensuel_courant: o.objectif_mensuel_courant != null ? String(o.objectif_mensuel_courant) : '',
      libelle: o.libelle || '',
      actif: !!o.actif,
    });
    setShowDialog(true);
  };

  const save = async () => {
    const cible = parseFloat(form.objectif_mensuel_cible);
    if (!cible || cible <= 0) {
      toast.error('L\'objectif mensuel cible doit etre superieur a 0');
      return;
    }
    if (!form.date_cible || !form.date_debut) {
      toast.error('Dates debut et cible sont requises');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        objectif_mensuel_cible: cible,
        date_debut: form.date_debut,
        date_cible: form.date_cible,
        actif: form.actif,
      };
      if (form.objectif_mensuel_courant) payload.objectif_mensuel_courant = parseFloat(form.objectif_mensuel_courant);
      if (form.objectif_annuel_cible) payload.objectif_annuel_cible = parseFloat(form.objectif_annuel_cible);
      if (form.one_shot_moyen) payload.one_shot_moyen = parseFloat(form.one_shot_moyen);
      if (form.libelle) payload.libelle = form.libelle;
      if (editingId) {
        await api.put(`/objectifs/${editingId}`, payload);
        toast.success('Objectif mis a jour');
      } else {
        await api.post('/objectifs', payload);
        toast.success('Objectif cree');
      }
      setShowDialog(false);
      fetchObjectifs();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const activate = async (o) => {
    try {
      await api.put(`/objectifs/${o.id}`, { actif: true });
      toast.success('Objectif active');
      fetchObjectifs();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const del = async (o) => {
    if (!window.confirm(`Supprimer l'objectif ${formatEUR(o.objectif_mensuel_cible)}/mois ?`)) return;
    try {
      await api.delete(`/objectifs/${o.id}`);
      toast.success('Objectif supprime');
      fetchObjectifs();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div data-testid="objectifs-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">
            Objectifs financiers
          </h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1">
            Un seul objectif actif a la fois. La barre du dashboard utilise l'objectif actif.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="add-objectif-btn">
          <Plus className="w-4 h-4 mr-2" /> Nouvel objectif
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary" />
        </div>
      ) : objectifs.length === 0 ? (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-12 text-center" data-testid="objectifs-empty">
          <Target className="w-10 h-10 text-brand-text-secondary mx-auto mb-4" />
          <p className="font-inter text-brand-text-secondary mb-6">Aucun objectif defini.</p>
          <Button onClick={openCreate} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter">
            <Plus className="w-4 h-4 mr-2" /> Definir mon premier objectif
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {objectifs.map((o) => (
            <div
              key={o.id}
              className={`bg-white rounded-lg border shadow-sm p-5 ${o.actif ? 'border-brand-primary ring-1 ring-brand-primary/20' : 'border-brand-border'}`}
              data-testid={`objectif-card-${o.id}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-manrope font-semibold text-lg text-brand-text-primary">
                      {formatEUR(o.objectif_mensuel_cible)}<span className="text-sm font-normal text-brand-text-secondary">/mois</span>
                    </h3>
                    {o.actif && (
                      <Badge className="bg-brand-primary text-white text-xs border-0">Actif</Badge>
                    )}
                  </div>
                  {o.libelle && (
                    <p className="text-sm font-inter text-brand-text-secondary mt-1">{o.libelle}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {!o.actif && (
                    <Button variant="ghost" size="icon" onClick={() => activate(o)} title="Activer" data-testid={`activate-${o.id}`}>
                      <Check className="w-4 h-4 text-brand-text-secondary" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(o)} title="Modifier" data-testid={`edit-${o.id}`}>
                    <Pencil className="w-4 h-4 text-brand-text-secondary" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => del(o)} title="Supprimer" data-testid={`delete-${o.id}`}>
                    <Trash2 className="w-4 h-4 text-brand-danger" />
                  </Button>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm font-inter">
                <dt className="text-brand-text-secondary">Debut</dt>
                <dd className="text-brand-text-primary text-right font-jetbrains text-xs">{o.date_debut}</dd>
                <dt className="text-brand-text-secondary">Cible</dt>
                <dd className="text-brand-text-primary text-right font-jetbrains text-xs">{o.date_cible}</dd>
                {o.objectif_mensuel_courant != null && (
                  <>
                    <dt className="text-brand-text-secondary">Cible mois courant</dt>
                    <dd className="text-brand-text-primary text-right font-semibold">{formatEUR(o.objectif_mensuel_courant)}</dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-manrope">{editingId ? 'Modifier l\'objectif' : 'Nouvel objectif'}</DialogTitle>
            <DialogDescription className="font-inter text-sm">
              L'objectif cible est atteint progressivement entre la date de debut et la date cible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-inter">Libelle (optionnel)</Label>
              <Input
                value={form.libelle}
                onChange={(e) => setForm({ ...form, libelle: e.target.value })}
                placeholder="Objectif Q2 2026"
                className="font-inter"
                data-testid="objectif-libelle"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Objectif mensuel cible (EUR) *</Label>
              <Input
                type="number" min={0} step={100}
                value={form.objectif_mensuel_cible}
                onChange={(e) => setForm({ ...form, objectif_mensuel_cible: e.target.value })}
                placeholder="5000"
                className="font-inter"
                data-testid="objectif-cible"
              />
              <p className="text-xs text-brand-text-secondary font-inter">
                Le montant a atteindre chaque mois d'ici la date cible.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-inter">Date de debut</Label>
                <Input
                  type="date"
                  value={form.date_debut}
                  onChange={(e) => setForm({ ...form, date_debut: e.target.value })}
                  className="font-inter"
                  data-testid="objectif-debut"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-inter">Date cible</Label>
                <Input
                  type="date"
                  value={form.date_cible}
                  onChange={(e) => setForm({ ...form, date_cible: e.target.value })}
                  className="font-inter"
                  data-testid="objectif-cible-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Objectif mois courant (optionnel)</Label>
              <Input
                type="number" min={0} step={100}
                value={form.objectif_mensuel_courant}
                onChange={(e) => setForm({ ...form, objectif_mensuel_courant: e.target.value })}
                placeholder="3000"
                className="font-inter"
                data-testid="objectif-courant"
              />
              <p className="text-xs text-brand-text-secondary font-inter">
                Si rempli, la barre du dashboard utilise cette valeur pour le mois courant au lieu de la cible finale.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-inter">Objectif annuel (optionnel)</Label>
                <Input
                  type="number" min={0} step={1000}
                  value={form.objectif_annuel_cible}
                  onChange={(e) => setForm({ ...form, objectif_annuel_cible: e.target.value })}
                  placeholder="40000"
                  className="font-inter"
                  data-testid="objectif-annuel"
                />
                <p className="text-xs text-brand-text-secondary font-inter">
                  Défaut : mensuel × 12.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="font-inter">One-shot moyen (€)</Label>
                <Input
                  type="number" min={0} step={100}
                  value={form.one_shot_moyen}
                  onChange={(e) => setForm({ ...form, one_shot_moyen: e.target.value })}
                  placeholder="4250"
                  className="font-inter"
                  data-testid="objectif-oneshot"
                />
                <p className="text-xs text-brand-text-secondary font-inter">
                  Sert à calculer combien de deals manquent.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.actif}
                onChange={(e) => setForm({ ...form, actif: e.target.checked })}
                className="rounded"
                data-testid="objectif-actif"
              />
              <span className="font-inter text-sm text-brand-text-primary">
                Activer cet objectif (desactive les autres)
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} className="font-inter border-brand-border">
              Annuler
            </Button>
            <Button onClick={save} disabled={saving} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter" data-testid="objectif-save">
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
