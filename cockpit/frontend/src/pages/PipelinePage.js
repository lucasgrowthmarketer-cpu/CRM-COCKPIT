import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import {
  GripVertical, GitBranch, MapPin, TrendingUp, Users as UsersIcon,
  ArrowRight, CheckCircle2, XCircle, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

const STAGES_ACTIFS = [
  { value: 'froid',               label: 'Froid',              color: 'bg-slate-100 border-slate-300', header: 'text-slate-700' },
  { value: 'qualifie',            label: 'Qualifié',           color: 'bg-blue-50 border-blue-200',    header: 'text-blue-700' },
  { value: 'contacte',            label: 'Contacté',           color: 'bg-orange-50 border-orange-200',header: 'text-orange-700' },
  { value: 'en_conversation',     label: 'En conversation',    color: 'bg-amber-50 border-amber-200',  header: 'text-amber-700' },
  { value: 'diagnostic_envoye',   label: 'Diagnostic envoyé',  color: 'bg-purple-50 border-purple-200',header: 'text-purple-700' },
  { value: 'propale',             label: 'Proposition',        color: 'bg-indigo-50 border-indigo-200',header: 'text-indigo-700' },
];

const STAGES_SIGNE = [
  { value: 'signe',  label: 'Signé', color: 'bg-emerald-50 border-emerald-200', header: 'text-emerald-700' },
];

const STAGES_PERDU = [
  { value: 'perdu',  label: 'Perdu', color: 'bg-red-50 border-red-200', header: 'text-red-700' },
];

const TABS = [
  { key: 'actifs', label: 'En cours',  icon: GitBranch,     stages: STAGES_ACTIFS },
  { key: 'signe',  label: 'Signés',    icon: CheckCircle2,  stages: STAGES_SIGNE },
  { key: 'perdu',  label: 'Perdus',    icon: XCircle,       stages: STAGES_PERDU },
];

const formatCA = (ca) => {
  if (!ca && ca !== 0) return null;
  if (ca >= 1_000_000) return `${(ca / 1_000_000).toFixed(1)}M€`;
  if (ca >= 1_000) return `${Math.round(ca / 1_000)}k€`;
  return `${ca}€`;
};

export default function PipelinePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entreprises, setEntreprises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('actifs');
  const [filterOwner, setFilterOwner] = useState('');
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [detailEntreprise, setDetailEntreprise] = useState(null);

  // Track mobile/desktop
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const currentStages = TABS.find(t => t.key === activeTab)?.stages || STAGES_ACTIFS;

  const fetchEntreprises = useCallback(async () => {
    setLoading(true);
    try {
      const stageValues = (TABS.find(t => t.key === activeTab)?.stages || STAGES_ACTIFS).map(s => s.value);
      const params = new URLSearchParams();
      params.set('statuts', stageValues.join(','));
      if (filterOwner) params.set('proprietaire', filterOwner);
      params.set('limit', '500');
      const { data } = await api.get(`/entreprises?${params.toString()}`);
      setEntreprises(data.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterOwner]);

  useEffect(() => { fetchEntreprises(); }, [fetchEntreprises]);

  const updateStatut = async (id, newStatut) => {
    try {
      await api.put(`/entreprises/${id}`, { statut_pipeline: newStatut });
      toast.success('Statut mis à jour');
      fetchEntreprises();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, stage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stage) setDragOverStage(stage);
  };
  const handleDragLeave = () => setDragOverStage(null);
  const handleDrop = async (stage) => {
    setDragOverStage(null);
    if (!draggedId) return;
    const ent = entreprises.find(e => e.id === draggedId);
    if (!ent || ent.statut_pipeline === stage) { setDraggedId(null); return; }
    await updateStatut(draggedId, stage);
    setDraggedId(null);
  };

  // Group entreprises by stage
  const byStage = currentStages.reduce((acc, s) => {
    acc[s.value] = entreprises.filter(e => e.statut_pipeline === s.value);
    return acc;
  }, {});

  const totalDisplayed = entreprises.length;

  return (
    <div data-testid="pipeline-page" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">
            Pipeline commercial
          </h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1">
            {isMobile ? 'Cliquer une carte pour changer son stade' : 'Glisser-déposer pour changer le stade'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterOwner || '__all__'} onValueChange={v => setFilterOwner(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-40 font-inter" data-testid="pipeline-filter-owner">
              <SelectValue placeholder="Propriétaire" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toute l'équipe</SelectItem>
              <SelectItem value="lucas">Lucas</SelectItem>
              <SelectItem value="ayoub">Ayoub</SelectItem>
              <SelectItem value="david">David</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-brand-border">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = t.key === activeTab;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-inter font-medium border-b-2 transition-colors -mb-px ${
                active
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'
              }`}
              data-testid={`pipeline-tab-${t.key}`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {active && <span className="ml-1 text-xs opacity-60">({totalDisplayed})</span>}
            </button>
          );
        })}
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
        </div>
      ) : totalDisplayed === 0 ? (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-12 text-center">
          <GitBranch className="w-10 h-10 text-brand-text-secondary mx-auto mb-4" />
          <p className="font-inter text-brand-text-secondary mb-4">
            {activeTab === 'actifs' && "Aucun prospect actif pour le moment."}
            {activeTab === 'signe' && "Aucun contrat signé."}
            {activeTab === 'perdu' && "Aucune opportunité perdue."}
          </p>
          {activeTab === 'actifs' && (
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => navigate('/import')}
                className="font-inter border-brand-border"
              >
                Importer un fichier Excel
              </Button>
              <Button
                onClick={() => navigate('/entreprises')}
                className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
              >
                Ajouter une entreprise
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className={`grid gap-3 ${
          currentStages.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
        }`}>
          {currentStages.map(stage => {
            const items = byStage[stage.value] || [];
            const isDropTarget = dragOverStage === stage.value;
            return (
              <div
                key={stage.value}
                onDragOver={(e) => handleDragOver(e, stage.value)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(stage.value)}
                className={`rounded-lg border ${stage.color} flex flex-col min-h-[300px] transition-all ${
                  isDropTarget ? 'ring-2 ring-brand-primary ring-offset-2' : ''
                }`}
                data-testid={`pipeline-col-${stage.value}`}
              >
                <div className="px-3 py-2 border-b border-brand-border flex items-center justify-between bg-white rounded-t-lg">
                  <h3 className={`font-manrope font-semibold text-sm ${stage.header}`}>
                    {stage.label}
                  </h3>
                  <span className="text-xs text-brand-text-secondary font-inter">
                    {items.length}
                  </span>
                </div>
                <div className="p-2 space-y-2 flex-1">
                  {items.length === 0 && (
                    <div className="text-center text-xs text-brand-text-secondary font-inter py-6 italic">
                      Vide
                    </div>
                  )}
                  {items.map(ent => (
                    <PipelineCard
                      key={ent.id}
                      ent={ent}
                      isMobile={isMobile}
                      currentStage={stage.value}
                      onDragStart={(e) => handleDragStart(e, ent.id)}
                      onCardClick={() => isMobile && setDetailEntreprise(ent)}
                      onOpenDetail={() => navigate(`/entreprises/${ent.id}`)}
                      onUpdateStatut={(s) => updateStatut(ent.id, s)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile detail modal */}
      <Dialog open={!!detailEntreprise} onOpenChange={(v) => { if (!v) setDetailEntreprise(null); }}>
        <DialogContent className="sm:max-w-md" data-testid="pipeline-mobile-dialog">
          <DialogHeader>
            <DialogTitle className="font-manrope text-base">
              {detailEntreprise?.nom}
            </DialogTitle>
            <DialogDescription className="font-inter text-xs">
              {detailEntreprise?.ville || '—'} &middot; {detailEntreprise?.secteur_libelle || '—'}
            </DialogDescription>
          </DialogHeader>

          {detailEntreprise && (
            <div className="space-y-4">
              <div className="bg-brand-bg rounded-lg p-3 space-y-2 text-sm font-inter">
                {detailEntreprise.ca && (
                  <div className="flex justify-between">
                    <span className="text-brand-text-secondary">CA</span>
                    <span className="font-medium">{formatCA(detailEntreprise.ca)}</span>
                  </div>
                )}
                {detailEntreprise.effectif && (
                  <div className="flex justify-between">
                    <span className="text-brand-text-secondary">Effectif</span>
                    <span className="font-medium">{detailEntreprise.effectif}</span>
                  </div>
                )}
                {typeof detailEntreprise.score_icp === 'number' && (
                  <div className="flex justify-between">
                    <span className="text-brand-text-secondary">Score ICP</span>
                    <span className="font-medium">{detailEntreprise.score_icp}/100</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-brand-text-secondary">Propriétaire</span>
                  <span className="font-medium capitalize">{detailEntreprise.proprietaire || '—'}</span>
                </div>
              </div>

              <div>
                <label className="font-inter text-xs font-medium text-brand-text-primary mb-2 block">
                  Changer le stade
                </label>
                <Select
                  value={detailEntreprise.statut_pipeline}
                  onValueChange={async (v) => {
                    await updateStatut(detailEntreprise.id, v);
                    setDetailEntreprise(null);
                  }}
                >
                  <SelectTrigger className="font-inter" data-testid="mobile-stage-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...STAGES_ACTIFS, ...STAGES_SIGNE, ...STAGES_PERDU].map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setDetailEntreprise(null)}
              className="font-inter border-brand-border"
            >
              Fermer
            </Button>
            <Button
              onClick={() => {
                const id = detailEntreprise?.id;
                setDetailEntreprise(null);
                if (id) navigate(`/entreprises/${id}`);
              }}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
            >
              <ExternalLink className="w-3 h-3 mr-2" />
              Voir la fiche complète
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function PipelineCard({ ent, isMobile, currentStage, onDragStart, onCardClick, onOpenDetail, onUpdateStatut }) {
  const icpColor =
    ent.score_icp >= 70 ? 'bg-emerald-100 text-emerald-700' :
    ent.score_icp >= 40 ? 'bg-amber-100 text-amber-700' :
    'bg-slate-100 text-slate-600';

  return (
    <div
      draggable={!isMobile}
      onDragStart={onDragStart}
      onClick={isMobile ? onCardClick : undefined}
      className={`bg-white border border-brand-border rounded-md p-2.5 hover:shadow-sm transition-shadow group ${
        isMobile ? 'cursor-pointer active:scale-98' : 'cursor-move'
      }`}
      data-testid={`pipeline-card-${ent.id}`}
    >
      <div className="flex items-start gap-1.5 mb-1.5">
        {!isMobile && <GripVertical className="w-3 h-3 text-brand-text-secondary/60 mt-1 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="font-manrope font-semibold text-sm text-brand-text-primary truncate" title={ent.nom}>
            {ent.nom}
          </div>
          {ent.ville && (
            <div className="flex items-center gap-1 text-xs text-brand-text-secondary font-inter mt-0.5">
              <MapPin className="w-3 h-3" />
              {ent.ville}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-2">
        {typeof ent.score_icp === 'number' && ent.score_icp > 0 && (
          <Badge className={`${icpColor} text-[10px] font-inter border-0 px-1.5 py-0`}>
            ICP {ent.score_icp}
          </Badge>
        )}
        {ent.ca && (
          <Badge className="bg-brand-bg text-brand-text-secondary text-[10px] font-inter border border-brand-border px-1.5 py-0">
            <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
            {formatCA(ent.ca)}
          </Badge>
        )}
        {ent.effectif && (
          <Badge className="bg-brand-bg text-brand-text-secondary text-[10px] font-inter border border-brand-border px-1.5 py-0">
            <UsersIcon className="w-2.5 h-2.5 mr-0.5" />
            {ent.effectif}
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] font-inter text-brand-text-secondary">
        <span className="capitalize">{ent.proprietaire || '—'}</span>
        {!isMobile && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-brand-primary hover:underline"
            title="Voir la fiche"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
