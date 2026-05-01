import React, { useState, useEffect } from 'react';
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
import { Receipt, Send, Banknote, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const today = () => new Date().toISOString().slice(0, 10);

const STATUTS = [
  { value: 'prevue',  label: 'Prévue (à émettre)' },
  { value: 'emise',   label: 'Émise (en attente paiement)' },
  { value: 'payee',   label: 'Payée (encaissée)' },
  { value: 'annulee', label: 'Annulée' },
];

/**
 * MarkFactureModal
 * Modale d'édition fine d'une facture.
 * Permet de changer date_emission, date_paiement, statut, notes.
 *
 * Props:
 *  - open: bool
 *  - facture: object (la facture à éditer)
 *  - action: 'edit' | 'mark-emise' | 'mark-payee' (préfill du formulaire)
 *  - onClose: fn
 *  - onUpdated: fn
 */
export default function MarkFactureModal({ open, facture, action = 'edit', onClose, onUpdated }) {
  const [form, setForm] = useState({
    statut: 'prevue',
    date_emission: '',
    date_paiement: '',
    notes: '',
    montant: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open || !facture) return;
    // Préfill selon l'action
    let nextStatut = facture.statut || 'prevue';
    let nextEmis = facture.date_emission || '';
    let nextPay = facture.date_paiement || '';
    if (action === 'mark-emise') {
      nextStatut = 'emise';
      if (!nextEmis) nextEmis = today();
    } else if (action === 'mark-payee') {
      nextStatut = 'payee';
      if (!nextEmis) nextEmis = today();
      if (!nextPay) nextPay = today();
    }
    setForm({
      statut: nextStatut,
      date_emission: nextEmis,
      date_paiement: nextPay,
      notes: facture.notes || '',
      montant: String(facture.montant || ''),
    });
  }, [open, facture, action]);

  if (!facture) return null;

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        statut: form.statut,
        date_emission: form.date_emission || null,
        date_paiement: form.date_paiement || null,
        notes: form.notes || null,
      };
      // Permettre le changement de montant (utile si one-shot mal saisi)
      const newMontant = parseFloat(form.montant);
      if (!isNaN(newMontant) && newMontant > 0 && newMontant !== facture.montant) {
        payload.montant = newMontant;
      }
      await api.put(`/factures/${facture.id}`, payload);
      toast.success('Facture mise à jour');
      onUpdated && onUpdated();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Supprimer définitivement cette facture ?')) return;
    setDeleting(true);
    try {
      await api.delete(`/factures/${facture.id}`);
      toast.success('Facture supprimée');
      onUpdated && onUpdated();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setDeleting(false);
    }
  };

  const titleByAction = {
    'mark-emise': 'Marquer comme émise',
    'mark-payee': 'Marquer comme payée',
    'edit': 'Modifier la facture',
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="font-manrope flex items-center gap-2">
            <Receipt className="w-5 h-5 text-brand-primary" />
            {titleByAction[action] || 'Facture'}
          </DialogTitle>
          <DialogDescription className="font-inter text-sm">
            <span className="font-medium text-brand-text-primary">{facture.entreprise_nom || '?'}</span>
            <span className="text-brand-text-secondary"> · {facture.opportunite_intitule || ''}</span>
            <span className="block mt-0.5 font-jetbrains text-xs">
              Mois facturé : {facture.mois}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Statut */}
          <div className="space-y-1.5">
            <Label>Statut</Label>
            <Select value={form.statut} onValueChange={(v) => setForm((f) => ({ ...f, statut: v }))}>
              <SelectTrigger data-testid="facture-statut-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Montant */}
          <div className="space-y-1.5">
            <Label htmlFor="facture-montant">Montant (€)</Label>
            <Input
              id="facture-montant"
              type="number"
              step="0.01"
              value={form.montant}
              onChange={(e) => setForm((f) => ({ ...f, montant: e.target.value }))}
              data-testid="facture-montant-input"
            />
          </div>

          {/* Date émission */}
          <div className="space-y-1.5">
            <Label htmlFor="facture-date-emission">
              Date émission {form.statut === 'emise' || form.statut === 'payee' ? '*' : '(optionnel)'}
            </Label>
            <Input
              id="facture-date-emission"
              type="date"
              value={form.date_emission}
              onChange={(e) => setForm((f) => ({ ...f, date_emission: e.target.value }))}
              data-testid="facture-emission-input"
            />
          </div>

          {/* Date paiement */}
          <div className="space-y-1.5">
            <Label htmlFor="facture-date-paiement">
              Date paiement {form.statut === 'payee' ? '*' : '(optionnel)'}
            </Label>
            <Input
              id="facture-date-paiement"
              type="date"
              value={form.date_paiement}
              onChange={(e) => setForm((f) => ({ ...f, date_paiement: e.target.value }))}
              data-testid="facture-paiement-input"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="facture-notes">Notes (optionnel)</Label>
            <Textarea
              id="facture-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Ex: référence Qonto, retard de paiement, remise..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleting || saving}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            data-testid="facture-delete-btn"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
            Supprimer
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button onClick={submit} disabled={saving} data-testid="facture-save-btn">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
