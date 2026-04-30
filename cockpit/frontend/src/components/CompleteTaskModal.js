import React, { useState } from 'react';
import api, { formatApiError } from '../lib/api';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { Checkbox } from './ui/checkbox';
import { CheckCheck } from 'lucide-react';
import { toast } from 'sonner';

const OUTCOMES = [
  { value: 'joint', label: 'Joint au tel' },
  { value: 'pas_joint', label: 'Pas joint (mess. vocal)' },
  { value: 'repondu_positif', label: 'Réponse positive' },
  { value: 'repondu_negatif', label: 'Réponse négative' },
  { value: 'rdv_booked', label: 'RDV booké 🎯' },
  { value: 'rappel_demande', label: 'Demande à être rappelé' },
  { value: 'refus', label: 'Refus net' },
  { value: 'no_reply', label: 'Pas de réponse' },
];

const FOLLOWUP_SUGGESTIONS = {
  pas_joint: { days: 1, channel: 'phone', template: 'phone_call', title: 'Rappeler' },
  no_reply: { days: 3, channel: 'email', template: 'relance_1_soft', title: 'Relance email' },
  rappel_demande: { days: 0, channel: 'phone', template: 'phone_call', title: 'Rappel demandé' },
  joint: { days: 7, channel: 'email', template: 'relance_2_value', title: 'Suivi post-appel' },
  repondu_positif: { days: 1, channel: 'email', template: 'relance_2_value', title: 'Suivi post-réponse positive' },
};

export default function CompleteTaskModal({ open, task, onClose, onCompleted }) {
  const [outcome, setOutcome] = useState(null);
  const [notes, setNotes] = useState('');
  const [createFollowup, setCreateFollowup] = useState(false);
  const [followupDays, setFollowupDays] = useState(3);
  const [followupChannel, setFollowupChannel] = useState('email');
  const [followupTitle, setFollowupTitle] = useState('');
  const [followupTemplate, setFollowupTemplate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!task) return null;

  const handleOutcomeChange = (val) => {
    setOutcome(val);
    const sug = FOLLOWUP_SUGGESTIONS[val];
    if (sug) {
      setCreateFollowup(true);
      setFollowupDays(sug.days);
      setFollowupChannel(sug.channel);
      setFollowupTemplate(sug.template);
      setFollowupTitle(`${sug.title} · ${task.prospect?.nom || ''}`.trim());
    } else {
      setCreateFollowup(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        outcome,
        notes_outcome: notes || null,
        create_followup: createFollowup,
        followup_days: createFollowup ? followupDays : null,
        followup_channel: createFollowup ? followupChannel : null,
        followup_template: createFollowup ? followupTemplate || null : null,
        followup_title: createFollowup ? followupTitle || null : null,
      };
      const { data } = await api.post(`/tasks/${task.id}/complete`, payload);
      toast.success(data.followup ? 'Tâche faite + relance créée' : 'Tâche marquée faite');
      onCompleted && onCompleted(data);
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="font-manrope flex items-center gap-2">
            <CheckCheck className="w-5 h-5 text-brand-primary" />
            Marquer comme fait
          </DialogTitle>
          <DialogDescription className="font-inter text-sm">
            <span className="font-medium text-brand-text-primary">{task.title}</span>
            {task.prospect && (
              <span className="block mt-0.5">
                {task.prospect.nom}
                {task.contact && <span> · {task.contact.prenom} {task.contact.nom}</span>}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Outcome buttons */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide font-medium text-brand-text-secondary">
              Que s'est-il passé ?
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <Button
                  key={o.value}
                  type="button"
                  variant={outcome === o.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleOutcomeChange(o.value)}
                  className="justify-start text-xs h-9"
                  data-testid={`outcome-${o.value}`}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes (optionnel)</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ce qui a été dit, points à retenir, contexte..."
              rows={3}
            />
          </div>

          {/* Auto-followup block */}
          <div className="bg-brand-bg rounded-md p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={createFollowup}
                onCheckedChange={setCreateFollowup}
                data-testid="task-followup-checkbox"
              />
              <span className="text-sm font-medium text-brand-text-primary">
                Créer la tâche de relance suivante
              </span>
            </label>

            {createFollowup && (
              <div className="space-y-2 pl-6">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-brand-text-secondary">Dans</Label>
                    <Select value={String(followupDays)} onValueChange={(v) => setFollowupDays(parseInt(v, 10))}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Aujourd'hui</SelectItem>
                        <SelectItem value="1">1 jour</SelectItem>
                        <SelectItem value="2">2 jours</SelectItem>
                        <SelectItem value="3">3 jours</SelectItem>
                        <SelectItem value="7">1 semaine</SelectItem>
                        <SelectItem value="14">2 semaines</SelectItem>
                        <SelectItem value="30">1 mois</SelectItem>
                        <SelectItem value="90">3 mois</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-brand-text-secondary">Canal</Label>
                    <Select value={followupChannel} onValueChange={setFollowupChannel}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="phone">Appel</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="meeting">RDV</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-brand-text-secondary">Titre</Label>
                  <Input
                    value={followupTitle}
                    onChange={(e) => setFollowupTitle(e.target.value)}
                    placeholder="Ex: Relance 2 - apport de valeur"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-brand-text-secondary">Template suggéré</Label>
                  <Select
                    value={followupTemplate || 'none'}
                    onValueChange={(v) => setFollowupTemplate(v === 'none' ? '' : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Aucun —</SelectItem>
                      <SelectItem value="relance_1_soft">Relance 1 - Bump léger</SelectItem>
                      <SelectItem value="relance_2_value">Relance 2 - Apport de valeur</SelectItem>
                      <SelectItem value="relance_3_pivot">Relance 3 - Pivot d'angle</SelectItem>
                      <SelectItem value="breakup">Breakup - Dernière relance</SelectItem>
                      <SelectItem value="phone_call">Appel téléphonique</SelectItem>
                      <SelectItem value="linkedin_connect">LinkedIn - Connexion</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} disabled={submitting} data-testid="task-complete-btn">
            {submitting ? 'Enregistrement…' : 'Marquer fait'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
