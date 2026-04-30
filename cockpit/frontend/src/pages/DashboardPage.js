import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Legend, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, Users, Target as TargetIcon, Percent, RefreshCw, AlertCircle,
  ArrowRight, Repeat, Layers, FileText, Calendar, Flag,
  Clock, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import MesActionsCard from '../components/MesActionsCard';

const formatEUR = (n) => {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M€`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k€`;
  return `${Math.round(n)}€`;
};

const MONTH_LABELS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const formatMois = (key) => {
  if (!key) return '';
  const [y, m] = key.split('-');
  return `${MONTH_LABELS_FR[parseInt(m, 10) - 1] || m}`;
};

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
};

const MODE_OPTIONS = [
  { value: 'equipe',          label: 'Équipe',           desc: 'Toutes données' },
  { value: 'mes_donnees',     label: 'Mes données',      desc: 'Filtrées sur ton compte' },
  { value: 'lucas_personnel', label: 'Lucas personnel',  desc: 'Pipeline + objectifs 40k portés par Lucas' },
];

function KpiCard({ icon: Icon, label, value, subtitle, testid, accent }) {
  return (
    <div
      data-testid={testid}
      className={`bg-white rounded-lg border border-brand-border p-4 shadow-sm ${accent ? 'ring-2 ring-brand-primary/20' : ''}`}
    >
      <div className="flex items-center gap-2 text-brand-text-secondary text-xs font-inter mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-brand-primary" />}
        {label}
      </div>
      <div className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">{value}</div>
      {subtitle && <div className="text-xs text-brand-text-secondary font-inter mt-1">{subtitle}</div>}
    </div>
  );
}

function ProgressBar({ value, max, color = 'bg-brand-primary', height = 'h-2' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`w-full bg-brand-bg rounded-full overflow-hidden ${height}`}>
      <div
        className={`${height} ${color} transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState('equipe');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contractDialog, setContractDialog] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('mode', mode);
      const { data: res } = await api.get(`/dashboard/metrics?${params.toString()}`);
      setData(res);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-lg border border-brand-border p-8 text-center">
        <p className="text-brand-text-secondary font-inter">Impossible de charger les données.</p>
      </div>
    );
  }

  const kpi = data.kpi || {};
  const obj = data.objectif;
  const oneShot = data.one_shot_tracker || {};
  const notifications = data.notifications || [];
  const mrrContracts = data.mrr_contracts || [];
  const chartData = data.chart_ca_par_mois || [];
  const funnel = data.funnel || [];
  const topOpps = data.top_opportunites || [];
  const aRelancer = data.a_relancer || [];

  // Compute chart monthly target (annual / 12) for reference line
  const monthlyTarget = obj?.annuel_cible ? obj.annuel_cible / 12 : null;

  return (
    <div data-testid="dashboard-page" className="space-y-4">
      {/* Header + mode switch */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">
            Dashboard
          </h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1">
            Vue{mode === 'lucas_personnel' ? ' Lucas personnel' : mode === 'mes_donnees' ? ' mes données' : ' équipe'} — temps réel
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-brand-border rounded-lg p-1">
          {MODE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setMode(opt.value)}
              title={opt.desc}
              className={`px-3 py-1.5 text-xs font-inter rounded transition-colors ${
                mode === opt.value
                  ? 'bg-brand-primary text-white font-medium'
                  : 'text-brand-text-secondary hover:text-brand-text-primary'
              }`}
              data-testid={`mode-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
       </div>
      </div>

      {/* Mes actions du jour (Tasks + Todos) */}
      <MesActionsCard />

      {/* Notifications banner */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                n.severity === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
              data-testid="dashboard-notification"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <div className="flex-1 text-sm font-inter">{n.message}</div>
              {n.type === 'factures_a_lancer' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toast.info('Ouvre le panneau MRR ci-dessous pour marquer tes factures comme émises.')}
                  className="font-inter text-xs border-amber-300 bg-white"
                >
                  Voir
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ligne de vie MRR — TOP priority widget */}
      {obj && (
        <div className="bg-gradient-to-br from-brand-primary to-brand-primary-hover text-white rounded-lg p-4 sm:p-5 shadow-sm" data-testid="ligne-de-vie-mrr">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 text-white/80 text-xs font-inter mb-1">
                <Repeat className="w-3.5 h-3.5" />
                Ligne de vie MRR
              </div>
              <div className="font-manrope font-bold text-2xl sm:text-3xl">
                {formatEUR(kpi.mrr_total)}
                <span className="text-base font-normal text-white/70 ml-2">
                  / mois
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-inter text-white/80 mb-1">
                Cible {obj.date_cible ? formatDate(obj.date_cible) : 'juin'}
              </div>
              <div className="font-manrope font-semibold text-xl">
                {formatEUR(obj.mensuel_cible)}
              </div>
            </div>
          </div>
          <ProgressBar
            value={kpi.mrr_total}
            max={obj.mensuel_cible}
            color="bg-white"
            height="h-2.5"
          />
          <div className="flex justify-between items-center mt-2 text-xs font-inter text-white/80">
            <span>
              {kpi.mrr_total >= obj.mensuel_cible
                ? `✓ Objectif MRR atteint`
                : `Manque ${formatEUR(obj.mensuel_cible - kpi.mrr_total)} / mois`}
            </span>
            <span>
              {obj.mensuel_cible > 0 ? Math.round((kpi.mrr_total / obj.mensuel_cible) * 100) : 0}%
            </span>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={TrendingUp}
          label="CA 2025 (YTD)"
          value={formatEUR(kpi.ca_ytd)}
          subtitle={obj ? `Objectif ${formatEUR(obj.annuel_cible)}` : null}
          testid="kpi-ca-ytd"
        />
        <KpiCard
          icon={Calendar}
          label="Ce mois"
          value={formatEUR(kpi.ca_mois_courant)}
          subtitle={`dont ${formatEUR(kpi.mrr_total)} MRR`}
          testid="kpi-ca-mois"
        />
        <KpiCard
          icon={TargetIcon}
          label="Pipeline pondéré"
          value={formatEUR(kpi.ca_pondere_pipeline)}
          subtitle={`${kpi.prospects_actifs} prospects actifs`}
          testid="kpi-pipeline"
        />
        <KpiCard
          icon={Percent}
          label="Conversion 30j"
          value={`${kpi.taux_conversion_30j || 0}%`}
          subtitle={`${kpi.signes_30j} signés / ${kpi.contactes_30j} contactés`}
          testid="kpi-conversion"
        />
      </div>

      {/* CA manquant widget + Prochain one-shot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {obj && (
          <div className="bg-white rounded-lg border border-brand-border p-4 shadow-sm" data-testid="ca-manquant">
            <div className="flex items-center gap-2 mb-3">
              <Flag className="w-4 h-4 text-brand-primary" />
              <h3 className="font-manrope font-semibold text-sm text-brand-text-primary">
                Objectif annuel — avancement
              </h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-inter mb-1.5">
                  <span className="text-brand-text-secondary">Réalisé YTD</span>
                  <span className="font-medium text-brand-text-primary">{formatEUR(obj.ca_ytd)}</span>
                </div>
                <ProgressBar value={obj.ca_ytd} max={obj.annuel_cible} color="bg-emerald-500" />
              </div>
              <div>
                <div className="flex justify-between text-xs font-inter mb-1.5">
                  <span className="text-brand-text-secondary">Projeté avec récurrents</span>
                  <span className="font-medium text-brand-text-primary">
                    {formatEUR(obj.ca_ytd + obj.ca_prevu_reste_annee)}
                  </span>
                </div>
                <ProgressBar value={obj.ca_ytd + obj.ca_prevu_reste_annee} max={obj.annuel_cible} color="bg-brand-primary" />
              </div>
              <div className="pt-2 border-t border-brand-border">
                {obj.manquant > 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs text-brand-text-secondary font-inter">Manque pour atteindre {formatEUR(obj.annuel_cible)}</div>
                      <div className="font-manrope font-bold text-lg text-brand-text-primary">{formatEUR(obj.manquant)}</div>
                    </div>
                    <Badge className="bg-brand-primary/10 text-brand-primary font-inter border-0 text-xs">
                      {obj.one_shots_requis} one-shot{obj.one_shots_requis > 1 ? 's' : ''} à 4 250€
                    </Badge>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-700 text-sm font-inter">
                    <CheckCircle2 className="w-4 h-4" />
                    Objectif déjà atteint avec les récurrents projetés !
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-brand-border p-4 shadow-sm" data-testid="one-shot-tracker">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-brand-accent" />
            <h3 className="font-manrope font-semibold text-sm text-brand-text-primary">
              Prochain one-shot
            </h3>
          </div>
          {oneShot.dernier ? (
            <div className="space-y-3">
              <div className="text-xs font-inter text-brand-text-secondary">
                Dernier signé il y a <span className="font-medium text-brand-text-primary">{oneShot.jours_depuis_dernier}j</span>
              </div>
              <div className="bg-brand-bg rounded p-2">
                <div className="text-sm font-inter font-medium text-brand-text-primary truncate">
                  {oneShot.dernier.entreprise_nom} — {formatEUR(oneShot.dernier.montant)}
                </div>
                <div className="text-xs text-brand-text-secondary font-inter truncate">
                  {oneShot.dernier.intitule} • {formatDate(oneShot.dernier.date_signature)}
                </div>
              </div>
              {oneShot.cible_prochain && (
                <div>
                  <div className="flex justify-between text-xs font-inter mb-1">
                    <span className="text-brand-text-secondary">Cible prochain (J+60)</span>
                    <span className={`font-medium ${oneShot.jours_jusqu_cible < 0 ? 'text-red-600' : oneShot.jours_jusqu_cible < 14 ? 'text-amber-600' : 'text-brand-text-primary'}`}>
                      {oneShot.jours_jusqu_cible < 0
                        ? `En retard de ${Math.abs(oneShot.jours_jusqu_cible)}j`
                        : `Dans ${oneShot.jours_jusqu_cible}j`}
                    </span>
                  </div>
                  <div className="text-xs text-brand-text-secondary font-inter">
                    {formatDate(oneShot.cible_prochain)}
                  </div>
                </div>
              )}
              <div className="text-xs font-inter text-brand-text-secondary pt-2 border-t border-brand-border">
                Pipeline pondéré actuel : <span className="font-semibold text-brand-text-primary">{formatEUR(kpi.ca_pondere_pipeline)}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-brand-text-secondary font-inter italic">
              Aucun one-shot signé récemment.
            </div>
          )}
        </div>
      </div>

      {/* Main chart: 12 mois ventilation réalisé / prévu */}
      <div className="bg-white rounded-lg border border-brand-border p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-manrope font-semibold text-sm text-brand-text-primary">
            CA mensuel 2025 — Réalisé + Projection
          </h3>
          <div className="flex items-center gap-3 text-[10px] font-inter">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Payé/Émis
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-brand-primary/40 border border-brand-primary" /> Prévu
            </span>
            {monthlyTarget && (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-red-500" /> Cible mensuelle
              </span>
            )}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="mois"
              tickFormatter={formatMois}
              stroke="#64748b"
              fontSize={11}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickFormatter={(v) => formatEUR(v)}
            />
            <Tooltip
              formatter={(v, name) => [formatEUR(v), name === 'realise' ? 'Réalisé' : 'Prévu']}
              labelFormatter={formatMois}
              contentStyle={{ fontSize: 12, fontFamily: 'inherit' }}
            />
            <Bar dataKey="realise" stackId="ca" fill="#10b981" name="realise" />
            <Bar dataKey="prevu" stackId="ca" fill="#207bff" fillOpacity={0.4} stroke="#207bff" strokeWidth={1} name="prevu" />
            {monthlyTarget && (
              <ReferenceLine y={monthlyTarget} stroke="#ef4444" strokeDasharray="4 2" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* MRR Contracts list + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {mrrContracts.length > 0 && (
          <div className="bg-white rounded-lg border border-brand-border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-manrope font-semibold text-sm text-brand-text-primary">
                Contrats récurrents actifs
              </h3>
              <Badge className="bg-emerald-100 text-emerald-700 font-inter border-0 text-xs">
                MRR {formatEUR(kpi.mrr_total)} / ARR {formatEUR(kpi.mrr_total * 12)}
              </Badge>
            </div>
            <div className="space-y-2">
              {mrrContracts.map(c => (
                <button
                  key={c.id}
                  onClick={() => setContractDialog(c)}
                  className="w-full text-left bg-brand-bg rounded p-2.5 hover:bg-brand-primary/5 transition-colors border border-transparent hover:border-brand-primary/20"
                  data-testid={`mrr-contract-${c.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-inter text-sm font-medium text-brand-text-primary truncate">
                        {c.entreprise_nom || c.intitule}
                      </div>
                      <div className="text-xs text-brand-text-secondary font-inter truncate">
                        {c.intitule}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-manrope font-bold text-sm text-brand-text-primary">
                        {formatEUR(c.mrr)}
                      </div>
                      <div className="text-[10px] text-brand-text-secondary font-inter">/ mois</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {funnel.length > 0 && (
          <div className="bg-white rounded-lg border border-brand-border p-4 shadow-sm">
            <h3 className="font-manrope font-semibold text-sm text-brand-text-primary mb-3">
              Funnel pipeline
            </h3>
            <div className="space-y-2">
              {funnel.map(f => (
                <div key={f.stade} className="flex items-center gap-3">
                  <div className="w-28 text-xs font-inter text-brand-text-secondary capitalize shrink-0">
                    {f.stade.replace('_', ' ')}
                  </div>
                  <div className="flex-1">
                    <ProgressBar
                      value={f.montant_pondere}
                      max={Math.max(...funnel.map(x => x.montant_pondere)) || 1}
                    />
                  </div>
                  <div className="w-24 text-right text-xs font-inter shrink-0">
                    <div className="font-medium text-brand-text-primary">{formatEUR(f.montant_pondere)}</div>
                    <div className="text-brand-text-secondary text-[10px]">{f.count} opps</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top opps + À relancer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border border-brand-border p-4 shadow-sm">
          <h3 className="font-manrope font-semibold text-sm text-brand-text-primary mb-3">
            Top 5 opportunités pondérées
          </h3>
          {topOpps.length === 0 ? (
            <div className="text-sm text-brand-text-secondary font-inter italic py-4 text-center">
              Aucune opportunité en pipeline.
            </div>
          ) : (
            <div className="space-y-2">
              {topOpps.map(o => (
                <Link
                  key={o.id}
                  to={`/entreprises/${o.entreprise_id}`}
                  className="block bg-brand-bg rounded p-2.5 hover:bg-brand-primary/5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-inter text-sm font-medium text-brand-text-primary truncate">
                        {o.entreprise_nom}
                      </div>
                      <div className="text-xs text-brand-text-secondary font-inter truncate">
                        {o.intitule} • {o.stade}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-manrope font-bold text-sm text-brand-text-primary">
                        {formatEUR(o.montant_pondere)}
                      </div>
                      <div className="text-[10px] text-brand-text-secondary font-inter">
                        {o.probabilite}% × {formatEUR(o.montant_estime)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-brand-border p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <h3 className="font-manrope font-semibold text-sm text-brand-text-primary">
              À relancer (&gt; 14j sans interaction)
            </h3>
          </div>
          {aRelancer.length === 0 ? (
            <div className="text-sm text-brand-text-secondary font-inter italic py-4 text-center">
              Tout est à jour.
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {aRelancer.map(e => (
                <Link
                  key={e.id}
                  to={`/entreprises/${e.id}`}
                  className="flex items-center justify-between gap-2 p-1.5 rounded hover:bg-brand-bg text-sm font-inter"
                >
                  <div className="min-w-0 flex-1 truncate">{e.nom}</div>
                  <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px] font-inter shrink-0">
                    {e.jours_depuis ? `${e.jours_depuis}j` : '—'}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contract Detail Dialog */}
      <ContractHistoryDialog
        contract={contractDialog}
        onClose={() => setContractDialog(null)}
        onRefresh={fetchData}
      />
    </div>
  );
}


function ContractHistoryDialog({ contract, onClose, onRefresh }) {
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/factures/by-opportunite/${contract.id}`);
      setFactures(data.data || []);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [contract]);

  useEffect(() => {
    if (contract) load();
  }, [contract, load]);

  const markAs = async (factureId, statut) => {
    try {
      await api.put(`/factures/${factureId}`, { statut });
      toast.success('Facture mise à jour');
      await load();
      onRefresh?.();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  if (!contract) return null;

  const totalPaye = factures.filter(f => f.statut === 'payee').reduce((s, f) => s + (f.montant || 0), 0);
  const totalEmis = factures.filter(f => f.statut === 'emise').reduce((s, f) => s + (f.montant || 0), 0);
  const totalPrevu = factures.filter(f => f.statut === 'prevue').reduce((s, f) => s + (f.montant || 0), 0);

  const STATUT_STYLES = {
    payee:   { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Payée' },
    emise:   { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Émise' },
    prevue:  { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Prévue' },
    annulee: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Annulée' },
  };

  return (
    <Dialog open={!!contract} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-manrope">
            {contract.entreprise_nom || contract.intitule}
          </DialogTitle>
          <DialogDescription className="font-inter text-sm">
            {contract.intitule} • {formatEUR(contract.mrr)}/mois • Du {formatDate(contract.date_debut_contrat)} au {formatDate(contract.date_fin_contrat)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-center">
            <div className="text-[10px] uppercase text-emerald-700 font-inter">Payé</div>
            <div className="font-manrope font-bold text-sm text-emerald-700">{formatEUR(totalPaye)}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-center">
            <div className="text-[10px] uppercase text-blue-700 font-inter">Émis</div>
            <div className="font-manrope font-bold text-sm text-blue-700">{formatEUR(totalEmis)}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded p-2 text-center">
            <div className="text-[10px] uppercase text-amber-700 font-inter">Prévu</div>
            <div className="font-manrope font-bold text-sm text-amber-700">{formatEUR(totalPrevu)}</div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-primary" />
          </div>
        ) : factures.length === 0 ? (
          <div className="text-center py-8 text-brand-text-secondary font-inter text-sm">
            Aucune facture pour ce contrat.
          </div>
        ) : (
          <div className="space-y-1">
            {factures.map(f => {
              const style = STATUT_STYLES[f.statut] || STATUT_STYLES.prevue;
              return (
                <div
                  key={f.id}
                  className="flex items-center gap-2 p-2 rounded hover:bg-brand-bg border border-transparent hover:border-brand-border"
                >
                  <div className="w-16 font-jetbrains text-xs text-brand-text-secondary">{f.mois}</div>
                  <div className="w-16 font-manrope font-semibold text-sm text-brand-text-primary">
                    {formatEUR(f.montant)}
                  </div>
                  <Badge className={`${style.bg} ${style.text} border-0 text-[10px] font-inter`}>
                    {style.label}
                  </Badge>
                  <div className="flex-1 text-xs text-brand-text-secondary font-inter">
                    {f.date_paiement ? `Payée le ${formatDate(f.date_paiement)}`
                      : f.date_emission ? `Émise le ${formatDate(f.date_emission)}`
                      : '—'}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {f.statut === 'prevue' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] font-inter border-brand-border"
                        onClick={() => markAs(f.id, 'emise')}
                      >
                        Émettre
                      </Button>
                    )}
                    {(f.statut === 'prevue' || f.statut === 'emise') && (
                      <Button
                        size="sm"
                        className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-inter"
                        onClick={() => markAs(f.id, 'payee')}
                      >
                        Encaisser
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="font-inter border-brand-border">
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
