import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Receipt, AlertCircle, CheckCircle2, Clock, RefreshCw,
  TrendingUp, Calendar as CalIcon, Building2, ChevronDown, ChevronUp,
  Send, Banknote, Loader2, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import MarkFactureModal from '../components/MarkFactureModal';

const formatEUR = (v) => {
  if (v == null) return '0 €';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(v);
};

const FR_MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const labelMonth = (mois) => {
  // mois format "2026-04"
  if (!mois || mois.length < 7) return mois;
  const [year, m] = mois.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${FR_MONTHS[idx]} ${year}`;
};

const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const STATUT_CONFIG = {
  prevue:  { label: 'Prévue',   color: 'bg-gray-100 text-gray-700',     icon: Clock },
  emise:   { label: 'Émise',    color: 'bg-blue-100 text-blue-700',     icon: Send },
  payee:   { label: 'Payée',    color: 'bg-green-100 text-green-700',   icon: CheckCircle2 },
  annulee: { label: 'Annulée',  color: 'bg-red-100 text-red-700',       icon: AlertCircle },
};

const TYPE_LABEL = {
  recurrent: 'Récurrent',
  one_shot: 'One-shot',
};

export default function FacturationPage() {
  const { user } = useAuth();
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMois, setFilterMois] = useState('all');
  const [filterStatut, setFilterStatut] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [marking, setMarking] = useState(null);  // { facture, action }
  const [view, setView] = useState('list');

  const fetchFactures = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/factures', { params: { limit: 2000 } });
      const items = data?.data || [];
      // Sort: most recent month first, then statut prevue/emise before payee
      const sorted = [...items].sort((a, b) => {
        if (b.mois !== a.mois) return b.mois.localeCompare(a.mois);
        const order = { prevue: 0, emise: 1, payee: 2, annulee: 3 };
        return (order[a.statut] ?? 9) - (order[b.statut] ?? 9);
      });
      setFactures(sorted);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFactures(); }, [fetchFactures]);

  // Quick mark: emise or payee directly with today's date
  const quickMark = async (facture, target) => {
    try {
      const payload = target === 'emise'
        ? { statut: 'emise', date_emission: facture.date_emission || today() }
        : { statut: 'payee', date_paiement: today(), date_emission: facture.date_emission || today() };
      await api.put(`/factures/${facture.id}`, payload);
      toast.success(target === 'emise' ? 'Facture marquée émise' : 'Facture marquée payée');
      fetchFactures();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  // Open modal for advanced edit (custom date)
  const openMarkModal = (facture, action) => setMarking({ facture, action });

  // Generate factures for all recurring opportunities
  const generateRecurring = async () => {
    setGenerating(true);
    try {
      // Get all opportunites
      const { data } = await api.get('/opportunites', { params: { limit: 500 } });
      const opps = data?.data || data || [];
      const recurringSigned = opps.filter(
        (o) => o.type_contrat === 'recurrent' && o.stade === 'signe' && o.mrr
      );
      let totalCreated = 0;
      for (const opp of recurringSigned) {
        try {
          const res = await api.post(`/opportunites/${opp.id}/generate-factures`);
          totalCreated += res.data?.created || 0;
        } catch (err) {
          console.warn(`Failed for opp ${opp.id}`, err);
        }
      }
      if (totalCreated > 0) {
        toast.success(`${totalCreated} facture${totalCreated > 1 ? 's' : ''} générée${totalCreated > 1 ? 's' : ''}`);
        fetchFactures();
      } else {
        toast.info('Toutes les factures sont déjà en base.');
      }
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setGenerating(false);
    }
  };

  // ============================================================
  // Aggregations
  // ============================================================
  const cm = currentMonth();
  const stats = useMemo(() => {
    const result = {
      a_emettre_count: 0, a_emettre_total: 0,
      emises_mois_count: 0, emises_mois_total: 0,
      payees_mois_count: 0, payees_mois_total: 0,
      en_retard_count: 0, en_retard_total: 0,
    };
    for (const f of factures) {
      if (f.statut === 'annulee') continue;
      // À émettre = statut prevue, mois <= courant
      if (f.statut === 'prevue' && f.mois <= cm) {
        result.a_emettre_count++;
        result.a_emettre_total += f.montant || 0;
      }
      // Émises ce mois (par mois facture, pas date emission)
      if (f.statut === 'emise' && f.mois === cm) {
        result.emises_mois_count++;
        result.emises_mois_total += f.montant || 0;
      }
      // Payées ce mois (par mois facture)
      if (f.statut === 'payee' && f.mois === cm) {
        result.payees_mois_count++;
        result.payees_mois_total += f.montant || 0;
      }
      // En retard = émise depuis > 30j non payée
      if (f.statut === 'emise' && f.date_emission) {
        const dEmis = new Date(f.date_emission);
        const days = (Date.now() - dEmis.getTime()) / (1000 * 3600 * 24);
        if (days > 30) {
          result.en_retard_count++;
          result.en_retard_total += f.montant || 0;
        }
      }
    }
    return result;
  }, [factures, cm]);

  // Récap mensuel par statut (par mois) — pour view "Récap"
  const monthlyRecap = useMemo(() => {
    const map = {};
    for (const f of factures) {
      if (f.statut === 'annulee') continue;
      if (!map[f.mois]) {
        map[f.mois] = { mois: f.mois, prevue: 0, emise: 0, payee: 0, total_count: 0 };
      }
      map[f.mois][f.statut] = (map[f.mois][f.statut] || 0) + (f.montant || 0);
      map[f.mois].total_count++;
    }
    return Object.values(map).sort((a, b) => b.mois.localeCompare(a.mois));
  }, [factures]);

  // Filtered factures for list view
  const filtered = useMemo(() => {
    return factures.filter((f) => {
      if (filterMois !== 'all' && f.mois !== filterMois) return false;
      if (filterStatut !== 'all' && f.statut !== filterStatut) return false;
      if (filterClient !== 'all' && f.entreprise_id !== filterClient) return false;
      return true;
    });
  }, [factures, filterMois, filterStatut, filterClient]);

  // Unique values for filter dropdowns
  const uniqueMonths = useMemo(() => {
    return [...new Set(factures.map((f) => f.mois))].sort().reverse();
  }, [factures]);
  const uniqueClients = useMemo(() => {
    const map = {};
    for (const f of factures) {
      if (f.entreprise_id && !map[f.entreprise_id]) {
        map[f.entreprise_id] = f.entreprise_nom || '?';
      }
    }
    return Object.entries(map).sort((a, b) => a[1].localeCompare(b[1]));
  }, [factures]);

  // Group filtered by client (for "by client" view)
  const byClient = useMemo(() => {
    const map = {};
    for (const f of filtered) {
      const key = f.entreprise_id || 'unknown';
      if (!map[key]) {
        map[key] = { entreprise_id: key, entreprise_nom: f.entreprise_nom || '?', factures: [] };
      }
      map[key].factures.push(f);
    }
    return Object.values(map).sort((a, b) => a.entreprise_nom.localeCompare(b.entreprise_nom));
  }, [filtered]);

  return (
    <div className="space-y-5" data-testid="facturation-page">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="font-jetbrains text-[10px] text-brand-primary uppercase tracking-wider font-semibold">
            Facturation · suivi
          </div>
          <h1 className="font-manrope font-bold text-2xl text-brand-text-primary">Facturation</h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1">
            Suivi léger pour le Dashboard. La facturation réelle reste dans Qonto.
          </p>
        </div>
        <Button
          onClick={generateRecurring}
          disabled={generating}
          variant="outline"
          data-testid="generate-recurring-btn"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Génération…</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-1.5" />Générer factures récurrentes</>
          )}
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="À émettre"
          icon={Send}
          count={stats.a_emettre_count}
          total={stats.a_emettre_total}
          accent={stats.a_emettre_count > 0}
          color="orange"
        />
        <StatCard
          label="Émises ce mois"
          icon={Receipt}
          count={stats.emises_mois_count}
          total={stats.emises_mois_total}
          color="blue"
        />
        <StatCard
          label="Payées ce mois"
          icon={CheckCircle2}
          count={stats.payees_mois_count}
          total={stats.payees_mois_total}
          color="green"
        />
        <StatCard
          label="En retard >30j"
          icon={AlertCircle}
          count={stats.en_retard_count}
          total={stats.en_retard_total}
          color={stats.en_retard_count > 0 ? 'red' : 'gray'}
        />
      </div>

      {/* Tabs */}
      <Tabs value={view} onValueChange={setView}>
        <TabsList>
          <TabsTrigger value="list" data-testid="tab-list">Liste</TabsTrigger>
          <TabsTrigger value="byclient" data-testid="tab-byclient">Par client</TabsTrigger>
          <TabsTrigger value="recap" data-testid="tab-recap">Récap mensuel</TabsTrigger>
        </TabsList>

        {/* Filters (visibles uniquement en list / byclient) */}
        {view !== 'recap' && (
          <div className="flex flex-wrap gap-2 mt-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-brand-text-secondary block mb-1">Mois</Label>
              <Select value={filterMois} onValueChange={setFilterMois}>
                <SelectTrigger className="w-[180px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les mois</SelectItem>
                  {uniqueMonths.map((m) => (
                    <SelectItem key={m} value={m}>{labelMonth(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-brand-text-secondary block mb-1">Statut</Label>
              <Select value={filterStatut} onValueChange={setFilterStatut}>
                <SelectTrigger className="w-[140px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="prevue">Prévue</SelectItem>
                  <SelectItem value="emise">Émise</SelectItem>
                  <SelectItem value="payee">Payée</SelectItem>
                  <SelectItem value="annulee">Annulée</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-brand-text-secondary block mb-1">Client</Label>
              <Select value={filterClient} onValueChange={setFilterClient}>
                <SelectTrigger className="w-[200px] h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {uniqueClients.map(([id, nom]) => (
                    <SelectItem key={id} value={id}>{nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end ml-auto">
              <span className="text-xs text-brand-text-secondary font-jetbrains">
                {filtered.length} facture{filtered.length > 1 ? 's' : ''} · {formatEUR(filtered.reduce((s, f) => s + (f.statut !== 'annulee' ? (f.montant || 0) : 0), 0))}
              </span>
            </div>
          </div>
        )}

        {/* List view */}
        <TabsContent value="list" className="mt-4">
          {loading ? (
            <div className="text-center py-12 text-sm text-brand-text-secondary">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-brand-text-secondary">
              Aucune facture sur ces filtres.
            </div>
          ) : (
            <FactureList factures={filtered} onQuickMark={quickMark} onEditMark={openMarkModal} />
          )}
        </TabsContent>

        {/* By client view */}
        <TabsContent value="byclient" className="mt-4">
          {loading ? (
            <div className="text-center py-12 text-sm text-brand-text-secondary">Chargement…</div>
          ) : byClient.length === 0 ? (
            <div className="text-center py-12 text-sm text-brand-text-secondary">Aucune facture.</div>
          ) : (
            <div className="space-y-5">
              {byClient.map((c) => (
                <ClientGroup
                  key={c.entreprise_id}
                  client={c}
                  onQuickMark={quickMark}
                  onEditMark={openMarkModal}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Récap mensuel view */}
        <TabsContent value="recap" className="mt-4">
          <MonthlyRecap recap={monthlyRecap} />
        </TabsContent>
      </Tabs>

      {/* Modal pour édition fine */}
      <MarkFactureModal
        open={!!marking}
        facture={marking?.facture}
        action={marking?.action}
        onClose={() => setMarking(null)}
        onUpdated={() => { setMarking(null); fetchFactures(); }}
      />
    </div>
  );
}

// =============================================================
// StatCard
// =============================================================
function StatCard({ label, icon: Icon, count, total, accent, color }) {
  const colors = {
    orange: 'text-orange-600',
    blue: 'text-brand-primary',
    green: 'text-green-600',
    red: 'text-red-600',
    gray: 'text-brand-text-secondary',
  };
  const valueColor = colors[color] || colors.gray;
  return (
    <div className={`bg-white rounded-lg border p-4 ${accent ? 'border-brand-primary border-2' : 'border-brand-border'}`}>
      <div className="flex items-center gap-1.5 text-brand-text-secondary text-xs font-inter mb-1">
        {Icon && <Icon className={`w-3.5 h-3.5 ${valueColor}`} />}
        {label}
      </div>
      <div className={`font-manrope font-bold text-2xl ${valueColor}`}>{count}</div>
      <div className="text-xs text-brand-text-secondary font-jetbrains mt-1">{formatEUR(total)}</div>
    </div>
  );
}

// =============================================================
// FactureList — liste tabulaire avec actions rapides
// =============================================================
function FactureList({ factures, onQuickMark, onEditMark }) {
  return (
    <div className="bg-white rounded-lg border border-brand-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Mois</TableHead>
            <TableHead className="text-xs">Client</TableHead>
            <TableHead className="text-xs">Type</TableHead>
            <TableHead className="text-xs text-right">Montant</TableHead>
            <TableHead className="text-xs">Statut</TableHead>
            <TableHead className="text-xs">Émise le</TableHead>
            <TableHead className="text-xs">Payée le</TableHead>
            <TableHead className="text-xs text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {factures.map((f) => (
            <FactureRow
              key={f.id}
              facture={f}
              onQuickMark={onQuickMark}
              onEditMark={onEditMark}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FactureRow({ facture, onQuickMark, onEditMark }) {
  const stat = STATUT_CONFIG[facture.statut] || STATUT_CONFIG.prevue;
  const StatIcon = stat.icon;
  const canMarkEmise = facture.statut === 'prevue';
  const canMarkPayee = facture.statut === 'prevue' || facture.statut === 'emise';

  return (
    <TableRow data-testid={`facture-row-${facture.id}`}>
      <TableCell className="font-jetbrains text-xs">{labelMonth(facture.mois)}</TableCell>
      <TableCell>
        {facture.entreprise_id ? (
          <Link
            to={`/entreprises/${facture.entreprise_id}`}
            className="text-sm font-medium text-brand-text-primary hover:text-brand-primary"
          >
            {facture.entreprise_nom}
          </Link>
        ) : (
          <span className="text-sm text-brand-text-secondary">{facture.entreprise_nom || '—'}</span>
        )}
        {facture.opportunite_intitule && (
          <div className="text-[11px] text-brand-text-secondary truncate max-w-[200px]">
            {facture.opportunite_intitule}
          </div>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">
          {TYPE_LABEL[facture.type] || facture.type}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-manrope font-semibold text-sm">
        {formatEUR(facture.montant)}
      </TableCell>
      <TableCell>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${stat.color}`}>
          <StatIcon className="w-2.5 h-2.5" />
          {stat.label}
        </span>
      </TableCell>
      <TableCell className="font-jetbrains text-[11px] text-brand-text-secondary">
        {facture.date_emission || '—'}
      </TableCell>
      <TableCell className="font-jetbrains text-[11px] text-brand-text-secondary">
        {facture.date_paiement || '—'}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1 justify-end">
          {canMarkEmise && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() => onQuickMark(facture, 'emise')}
              data-testid={`mark-emise-${facture.id}`}
              title="Marquer émise (date du jour)"
            >
              <Send className="w-3 h-3 mr-1" />
              Émise
            </Button>
          )}
          {canMarkPayee && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px] border-green-600 text-green-700 hover:bg-green-50"
              onClick={() => onQuickMark(facture, 'payee')}
              data-testid={`mark-payee-${facture.id}`}
              title="Marquer payée (date du jour)"
            >
              <Banknote className="w-3 h-3 mr-1" />
              Payée
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5 text-[11px]"
            onClick={() => onEditMark(facture, 'edit')}
            title="Modifier en détail"
          >
            …
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// =============================================================
// ClientGroup - vue par client
// =============================================================
function ClientGroup({ client, onQuickMark, onEditMark }) {
  const [expanded, setExpanded] = useState(true);
  const total = client.factures.reduce((s, f) => f.statut !== 'annulee' ? s + (f.montant || 0) : s, 0);
  const totalPaid = client.factures.filter((f) => f.statut === 'payee').reduce((s, f) => s + (f.montant || 0), 0);

  return (
    <div className="bg-white rounded-lg border border-brand-border overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-brand-bg/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Building2 className="w-4 h-4 text-brand-primary" />
          <div className="text-left">
            <div className="font-manrope font-bold text-sm text-brand-text-primary">
              {client.entreprise_nom}
            </div>
            <div className="text-[11px] text-brand-text-secondary">
              {client.factures.length} facture{client.factures.length > 1 ? 's' : ''} · Total {formatEUR(total)} · Encaissé {formatEUR(totalPaid)}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-brand-text-secondary" /> : <ChevronDown className="w-4 h-4 text-brand-text-secondary" />}
      </button>
      {expanded && (
        <div className="border-t border-brand-border">
          <FactureList factures={client.factures} onQuickMark={onQuickMark} onEditMark={onEditMark} />
        </div>
      )}
    </div>
  );
}

// =============================================================
// MonthlyRecap
// =============================================================
function MonthlyRecap({ recap }) {
  if (recap.length === 0) {
    return <div className="text-center py-12 text-sm text-brand-text-secondary">Aucune donnée.</div>;
  }
  return (
    <div className="bg-white rounded-lg border border-brand-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Mois</TableHead>
            <TableHead className="text-xs text-right">Prévu</TableHead>
            <TableHead className="text-xs text-right">Émis</TableHead>
            <TableHead className="text-xs text-right">Payé</TableHead>
            <TableHead className="text-xs text-right">Total mois</TableHead>
            <TableHead className="text-xs">Avancement</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recap.map((r) => {
            const total = r.prevue + r.emise + r.payee;
            const pctPaid = total > 0 ? (r.payee / total) * 100 : 0;
            const pctEmis = total > 0 ? ((r.payee + r.emise) / total) * 100 : 0;
            return (
              <TableRow key={r.mois}>
                <TableCell className="font-medium">{labelMonth(r.mois)}</TableCell>
                <TableCell className="text-right font-jetbrains text-sm text-gray-500">
                  {r.prevue > 0 ? formatEUR(r.prevue) : '—'}
                </TableCell>
                <TableCell className="text-right font-jetbrains text-sm text-brand-primary">
                  {r.emise > 0 ? formatEUR(r.emise) : '—'}
                </TableCell>
                <TableCell className="text-right font-jetbrains text-sm text-green-600 font-semibold">
                  {r.payee > 0 ? formatEUR(r.payee) : '—'}
                </TableCell>
                <TableCell className="text-right font-manrope font-bold text-sm">
                  {formatEUR(total)}
                </TableCell>
                <TableCell>
                  <div className="w-full bg-brand-bg rounded-full overflow-hidden h-2 relative">
                    {/* Émis bar (bleu) */}
                    <div
                      className="bg-brand-primary/30 absolute top-0 left-0 h-full"
                      style={{ width: `${pctEmis}%` }}
                    />
                    {/* Payée bar (vert) */}
                    <div
                      className="bg-green-500 absolute top-0 left-0 h-full"
                      style={{ width: `${pctPaid}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-brand-text-secondary font-jetbrains mt-0.5">
                    {pctPaid.toFixed(0)}% payé · {(pctEmis - pctPaid).toFixed(0)}% en attente
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
