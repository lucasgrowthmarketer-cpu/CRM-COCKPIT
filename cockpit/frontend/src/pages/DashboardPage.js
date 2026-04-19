import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  CartesianGrid, Cell,
} from 'recharts';
import {
  TrendingUp, Users, Target as TargetIcon, Percent, RefreshCw, AlertCircle,
  Building2, ArrowRight, Repeat,
} from 'lucide-react';
import { toast } from 'sonner';

const formatEUR = (v, opts = {}) => {
  if (v == null) return '-';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0, ...opts,
  }).format(v);
};

const STATUT_COLORS = {
  qualifie: 'bg-blue-100 text-blue-700',
  contacte: 'bg-orange-100 text-orange-700',
  en_conversation: 'bg-yellow-100 text-yellow-700',
  diagnostic_envoye: 'bg-purple-100 text-purple-700',
  propale: 'bg-indigo-100 text-indigo-700',
};

const STATUT_LABELS = {
  qualifie: 'Qualifie',
  contacte: 'Contacte',
  en_conversation: 'En conversation',
  diagnostic_envoye: 'Diagnostic envoye',
  propale: 'Proposition',
};

const FUNNEL_COLORS = ['#3b82f6', '#a855f7', '#6366f1', '#f97316'];

function KpiCard({ icon: Icon, label, value, subtitle, testid }) {
  return (
    <div className="bg-white rounded-lg border border-brand-border shadow-sm p-5" data-testid={testid}>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-brand-bg flex items-center justify-center">
          <Icon className="w-4 h-4 text-brand-primary" />
        </div>
        <span className="font-inter text-xs uppercase text-brand-text-secondary tracking-wide">{label}</span>
      </div>
      <div className="font-manrope font-bold text-2xl text-brand-text-primary">{value}</div>
      {subtitle && <div className="font-inter text-xs text-brand-text-secondary mt-1">{subtitle}</div>}
    </div>
  );
}

function ProgressBar({ current, target, color = 'bg-brand-primary', label }) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <span className="font-inter text-sm text-brand-text-secondary">{label}</span>
        <span className="font-manrope font-semibold text-sm text-brand-text-primary">
          {formatEUR(current)} <span className="text-brand-text-secondary font-normal">/ {formatEUR(target)}</span>
        </span>
      </div>
      <div className="h-3 w-full bg-brand-bg rounded-full overflow-hidden border border-brand-border">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="font-inter text-xs text-brand-text-secondary mt-1 text-right">
        {pct.toFixed(0)}%
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [objectif, setObjectif] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('equipe'); // 'equipe' | 'mes_donnees'

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const proprietaire = scope === 'mes_donnees'
        ? user?.nom?.split(' ')[0]?.toLowerCase() || ''
        : '';
      const [metricsRes, objectifRes] = await Promise.all([
        api.get(`/dashboard/metrics${proprietaire ? `?proprietaire=${proprietaire}` : ''}`),
        api.get('/objectifs/actif').catch(() => ({ data: { data: null } })),
      ]);
      setMetrics(metricsRes.data);
      setObjectif(objectifRes.data?.data || null);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [scope, user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" data-testid="dashboard-loading">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
      </div>
    );
  }

  const { kpi, chart_ca_par_mois, funnel, top_opportunites, a_relancer, mrr_contracts } = metrics;
  const objectifMensuel = objectif?.objectif_mensuel_courant || objectif?.objectif_mensuel_cible || 0;

  // Empty state check: no data at all
  const isEmpty = kpi.prospects_actifs === 0 && kpi.ca_ytd === 0
    && (top_opportunites || []).length === 0 && (a_relancer || []).length === 0;

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-manrope font-bold text-2xl sm:text-3xl text-brand-text-primary">
            Bonjour, {user?.nom?.split(' ')[0]}
          </h1>
          <p className="text-brand-text-secondary font-inter text-sm mt-1">
            Voici ou nous en sommes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-brand-border bg-white overflow-hidden" data-testid="dashboard-scope-toggle">
            <button
              onClick={() => setScope('equipe')}
              className={`px-3 py-1.5 text-sm font-inter transition-colors ${
                scope === 'equipe' ? 'bg-brand-primary text-white' : 'text-brand-text-secondary hover:bg-brand-bg'
              }`}
              data-testid="scope-equipe"
            >
              Equipe
            </button>
            <button
              onClick={() => setScope('mes_donnees')}
              className={`px-3 py-1.5 text-sm font-inter transition-colors ${
                scope === 'mes_donnees' ? 'bg-brand-primary text-white' : 'text-brand-text-secondary hover:bg-brand-bg'
              }`}
              data-testid="scope-mes-donnees"
            >
              Mes donnees
            </button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchAll}
            title="Rafraichir"
            data-testid="dashboard-refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-12 text-center" data-testid="dashboard-empty-state">
          <Building2 className="w-10 h-10 text-brand-text-secondary mx-auto mb-4" />
          <h2 className="font-manrope font-semibold text-brand-text-primary">Votre cockpit est vide</h2>
          <p className="text-brand-text-secondary font-inter text-sm mt-2 mb-6">
            Pour commencer, importez votre pipeline ou ajoutez une entreprise.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/entreprises">
              <Button className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter">
                Ajouter une entreprise
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Objectif bars - Lucas only */}
      {objectif && objectifMensuel > 0 && (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-6" data-testid="dashboard-objectif">
          <div className="flex items-center gap-2 mb-4">
            <TargetIcon className="w-4 h-4 text-brand-primary" />
            <h2 className="font-manrope font-semibold text-brand-text-primary">
              Objectif mensuel
            </h2>
            {objectif.libelle && (
              <span className="text-xs text-brand-text-secondary font-inter">
                {objectif.libelle}
              </span>
            )}
          </div>
          <div className="space-y-5">
            <ProgressBar
              current={kpi.ca_mois_courant}
              target={objectifMensuel}
              color="bg-brand-primary"
              label={`CA signe ce mois (one-shot ${formatEUR(kpi.ca_mois_courant_one_shot)} + MRR ${formatEUR(kpi.mrr_total)})`}
            />
            <ProgressBar
              current={kpi.ca_pondere_pipeline}
              target={objectifMensuel}
              color="bg-brand-accent"
              label="Pipeline pondere (propales non closes)"
            />
          </div>
        </div>
      )}

      {!objectif && (
        <div className="bg-white rounded-lg border border-dashed border-brand-border p-5 text-sm font-inter text-brand-text-secondary flex items-center justify-between">
          <span>Aucun objectif actif defini.</span>
          <Link to="/objectifs">
            <Button variant="outline" size="sm" className="border-brand-border font-inter">
              Definir un objectif <ArrowRight className="w-3 h-3 ml-2" />
            </Button>
          </Link>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={TrendingUp} label="CA signe YTD" value={formatEUR(kpi.ca_ytd)}
          subtitle={`${formatEUR(kpi.ca_mois_courant)} ce mois`}
          testid="kpi-ca-ytd"
        />
        <KpiCard
          icon={TargetIcon} label="Pipeline pondere" value={formatEUR(kpi.ca_pondere_pipeline)}
          subtitle="Propales x probabilite"
          testid="kpi-pipeline"
        />
        <KpiCard
          icon={Users} label="Prospects actifs" value={kpi.prospects_actifs}
          subtitle="Statut != froid / signe / perdu"
          testid="kpi-prospects"
        />
        <KpiCard
          icon={Percent} label="Taux conversion 30j" value={`${kpi.taux_conversion_30j}%`}
          subtitle={`${kpi.signes_30j} signes / ${kpi.contactes_30j} contactes`}
          testid="kpi-conversion"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CA par mois */}
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-5" data-testid="chart-ca-par-mois">
          <h3 className="font-manrope font-semibold text-brand-text-primary mb-4">
            CA signe sur 12 mois
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart_ca_par_mois}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="mois" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(m) => m ? m.slice(5) : ''} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: 'Inter', fontSize: 12 }}
                  formatter={(v) => [formatEUR(v), 'CA signe']}
                />
                {objectifMensuel > 0 && (
                  <ReferenceLine y={objectifMensuel} stroke="#e89565" strokeDasharray="4 4" label={{ value: 'Objectif', position: 'right', fill: '#e89565', fontSize: 10 }} />
                )}
                <Bar dataKey="ca" fill="#207bff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Funnel */}
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-5" data-testid="chart-funnel">
          <h3 className="font-manrope font-semibold text-brand-text-primary mb-4">
            Entonnoir des opportunites
          </h3>
          {(funnel || []).every(f => f.count === 0) ? (
            <div className="h-64 flex items-center justify-center text-brand-text-secondary font-inter text-sm">
              Aucune opportunite en cours.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel} layout="vertical" margin={{ left: 30, right: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="stade" tick={{ fontSize: 11, fill: '#0f172a' }} width={100} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: 'Inter', fontSize: 12 }}
                    formatter={(v, name, p) => [`${formatEUR(v)} (${p.payload.count})`, 'Pondere']}
                  />
                  <Bar dataKey="montant_pondere" radius={[0, 4, 4, 0]}>
                    {funnel.map((e, idx) => <Cell key={idx} fill={FUNNEL_COLORS[idx % FUNNEL_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Tables row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 5 */}
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-5" data-testid="top-opportunites">
          <h3 className="font-manrope font-semibold text-brand-text-primary mb-4">Top 5 opportunites ponderees</h3>
          {(top_opportunites || []).length === 0 ? (
            <p className="text-sm font-inter text-brand-text-secondary py-8 text-center">Aucune opportunite en cours.</p>
          ) : (
            <ul className="space-y-2">
              {top_opportunites.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2 border-b border-brand-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-inter font-medium text-sm text-brand-text-primary truncate">{o.intitule}</div>
                    <div className="font-inter text-xs text-brand-text-secondary truncate">{o.entreprise_nom}</div>
                  </div>
                  <div className="font-manrope font-semibold text-sm text-brand-text-primary whitespace-nowrap">
                    {formatEUR(o.montant_pondere)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* A relancer */}
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-5" data-testid="a-relancer">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-brand-accent" />
            <h3 className="font-manrope font-semibold text-brand-text-primary">A relancer</h3>
            <span className="text-xs font-inter text-brand-text-secondary">
              (&gt; 14 jours sans interaction)
            </span>
          </div>
          {(a_relancer || []).length === 0 ? (
            <p className="text-sm font-inter text-brand-text-secondary py-8 text-center">Tout est a jour.</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {a_relancer.map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/entreprises/${e.id}`}
                    className="flex items-center justify-between gap-3 py-2 border-b border-brand-border last:border-0 hover:bg-brand-bg -mx-2 px-2 rounded"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-inter font-medium text-sm text-brand-text-primary truncate">{e.nom}</div>
                      <Badge className={`${STATUT_COLORS[e.statut_pipeline] || 'bg-gray-100 text-gray-700'} text-xs font-inter border-0 mt-1`}>
                        {STATUT_LABELS[e.statut_pipeline] || e.statut_pipeline}
                      </Badge>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className="font-inter text-xs text-brand-text-secondary">
                        {e.jours_depuis != null ? `${e.jours_depuis}j` : '-'}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* MRR / Clients actifs */}
      {(mrr_contracts || []).length > 0 && (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-5" data-testid="mrr-panel">
          <div className="flex items-center gap-2 mb-4">
            <Repeat className="w-4 h-4 text-brand-primary" />
            <h3 className="font-manrope font-semibold text-brand-text-primary">
              Clients recurrents ({mrr_contracts.length})
            </h3>
            <span className="text-xs font-inter text-brand-text-secondary ml-auto">
              MRR total : <span className="font-semibold text-brand-text-primary">{formatEUR(kpi.mrr_total)}</span> &middot; ARR : <span className="font-semibold text-brand-text-primary">{formatEUR(kpi.mrr_total * 12)}</span>
            </span>
          </div>
          <ul className="space-y-2">
            {mrr_contracts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 border-b border-brand-border last:border-0">
                <Link to={`/entreprises/${c.entreprise_id}`} className="min-w-0 flex-1 hover:text-brand-primary">
                  <div className="font-inter font-medium text-sm text-brand-text-primary truncate">{c.intitule}</div>
                </Link>
                <div className="font-manrope font-semibold text-sm text-brand-text-primary whitespace-nowrap">
                  {formatEUR(c.mrr)}<span className="text-xs font-normal text-brand-text-secondary">/mois</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
