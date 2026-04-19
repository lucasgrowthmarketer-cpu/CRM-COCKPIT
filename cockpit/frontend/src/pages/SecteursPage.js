import React, { useState, useEffect, useCallback } from 'react';
import api, { formatApiError } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_FORM = { naf_code: '', libelle: '', position: 'coeur', description: '' };

export default function SecteursPage() {
  const [secteurs, setSecteurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchSecteurs = useCallback(async () => {
    try {
      const { data } = await api.get('/secteurs');
      setSecteurs(data.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSecteurs(); }, [fetchSecteurs]);

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (s) => {
    setEditId(s.id);
    setForm({ naf_code: s.naf_code, libelle: s.libelle, position: s.position, description: s.description || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.naf_code || !form.libelle) {
      toast.error('Code NAF et libelle sont requis');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/secteurs/${editId}`, form);
        toast.success('Secteur mis a jour');
      } else {
        await api.post('/secteurs', form);
        toast.success('Secteur cree');
      }
      setShowModal(false);
      fetchSecteurs();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce secteur ?')) return;
    try {
      await api.delete(`/secteurs/${id}`);
      toast.success('Secteur supprime');
      fetchSecteurs();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
      </div>
    );
  }

  return (
    <div data-testid="secteurs-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">Secteurs</h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1">
            {secteurs.length} secteur{secteurs.length > 1 ? 's' : ''} configure{secteurs.length > 1 ? 's' : ''}
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
          data-testid="add-secteur-btn"
        >
          <Plus className="w-4 h-4 mr-2" /> Ajouter un secteur
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-brand-border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-brand-bg">
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Code NAF</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Libelle</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Position</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden sm:table-cell">Description</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {secteurs.map((s) => (
              <TableRow key={s.id} data-testid={`secteur-row-${s.naf_code}`}>
                <TableCell className="font-mono text-sm text-brand-text-primary">{s.naf_code}</TableCell>
                <TableCell className="font-inter text-sm text-brand-text-primary">{s.libelle}</TableCell>
                <TableCell>
                  <Badge
                    className={s.position === 'coeur'
                      ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20 hover:bg-brand-primary/10'
                      : 'bg-brand-accent/10 text-brand-accent border-brand-accent/20 hover:bg-brand-accent/10'
                    }
                  >
                    {s.position}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-brand-text-secondary font-inter hidden sm:table-cell max-w-xs truncate">
                  {s.description || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)} data-testid={`edit-secteur-${s.naf_code}`}>
                      <Pencil className="w-4 h-4 text-brand-text-secondary" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} data-testid={`delete-secteur-${s.naf_code}`}>
                      <Trash2 className="w-4 h-4 text-brand-danger" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-manrope">{editId ? 'Modifier le secteur' : 'Nouveau secteur'}</DialogTitle>
            <DialogDescription className="font-inter text-sm">
              {editId ? 'Modifiez les informations du secteur.' : 'Renseignez les informations du nouveau secteur.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-inter">Code NAF</Label>
              <Input
                value={form.naf_code}
                onChange={(e) => setForm({ ...form, naf_code: e.target.value })}
                placeholder="28.41Z"
                className="font-mono"
                data-testid="secteur-naf-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Libelle</Label>
              <Input
                value={form.libelle}
                onChange={(e) => setForm({ ...form, libelle: e.target.value })}
                placeholder="Nom du secteur"
                className="font-inter"
                data-testid="secteur-libelle-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Position</Label>
              <Select value={form.position} onValueChange={(v) => setForm({ ...form, position: v })}>
                <SelectTrigger data-testid="secteur-position-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coeur">Coeur</SelectItem>
                  <SelectItem value="adjacent">Adjacent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-inter">Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description optionnelle"
                className="font-inter"
                data-testid="secteur-description-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} className="font-inter border-brand-border" data-testid="secteur-cancel-btn">
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
              data-testid="secteur-save-btn"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
