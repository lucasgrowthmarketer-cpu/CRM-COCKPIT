import React, { useState, useEffect, useCallback } from 'react';
import api, { formatApiError } from '../lib/api';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Search, MousePointerClick, Eye, Percent, TrendingUp,
  RefreshCw, Globe, Monitor, Users, Clock, FileText, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const PERIODS = [
  { key: '24h', label: '24 h' },
  { key: '7d', label: '7 jours' },
  { key: '28d', label: '28 jours' },
  { key: '3m', label: '3 mois' },
  { key: '6m', label: '6 mois' },
  { key: '16m', label: '16 mois' },
];

const CHART = {
  clicks: '#207bff',
  impressions: '#94a3b8',
  sessions: '#207bff',
  users: '#e89565',
};

// Search Console renvoie des codes ISO-3
const COUNTRY_NAMES = {
  FRA: 'France', USA: 'États-Unis', DEU: 'Allemagne', GBR: 'Royaume-Uni',
  ESP: 'Espagne', ITA: 'Italie', BEL: 'Belgique', CHE: 'Suisse',
  CAN: 'Canada', MAR: 'Maroc', TUN: 'Tunisie', DZA: 'Algérie',
  NLD: 'Pays-Bas', PRT: 'Portugal', POL: 'Pologne', CHN: 'Chine',
  IND: 'Inde', JPN: 'Japon', BRA: 'Brésil', RUS: 'Russie',
  LUX: 'Luxembourg', AUT: 'Autriche', SWE: 'Suède', TUR: 'Turquie',
};

const DEVICE_NAMES = { MOBILE: 'Mobile', DESKTOP: 'Ordinateur', TABLET: 'Tablette' };

const formatNum = (n) => {
  if (n == null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString('fr-FR');
};

const formatDuration = (s) => {
  if (!s || isNaN(s)) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

const formatDateShort = (iso) => {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

const shortenUrl = (url) => {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? '/ (accueil)' : u.pathname;
  } catch {
    return url;
  }
};

function KpiCard({ icon: Icon, label, value, suffix = '', delta, hint, testid }) {
  const hasDelta = delta != null;
  const neutral = hasDelta && Math.abs(delta) < 0.5;
  const positive = hasDelta && delta > 0;

  return (
    <div data-testid={testid} className="bg-white rounded-lg border border-brand-border p-4 shadow-sm">
      <div className="flex items-center gap-2 text-brand-text-secondary text-xs font-inter mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-brand-primary" />}
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">
          {value}{suffix}
        </span>
        {hasDelta && (
          <span
            className={`text-xs font-inter font-medium ${
              neutral ? 'text-brand-text-secondary'
                : positive ? 'text-brand-success' : 'text-brand-danger'
            }`}
          >
            {positive ? '+' : ''}{delta}%
          </span>
        )}
      </div>
      {hint && <div className="text-xs text-brand-text-secondary font-inter mt-1">{hint}</div>}
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-lg border border-brand-border p-4 shadow-sm mb-4">
      <div className="mb-4">
        <h3 className="font-manrope font-bold text-brand-text-primary flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-brand-primary" />}
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-brand-text-secondary font-inter mt-1">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function DataTable({ columns, rows, empty = 'Aucune donnée sur cette période.' }) {
  const [sortKey, setSortKey] = useState(columns[1]?.key);
  const [desc, setDesc] = useState(true);

  if (!rows?.length) {
    return (
      <p className="text-sm text-brand-text-secondary font-inter py-8 text-center">{empty}</p>
    );
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'string') return desc ? bv.localeCompare(av) : av.localeCompare(bv);
    return desc ? bv - av : av - bv;
  });

  const toggle = (key) => {
    if (key === sortKey) setDesc(!desc);
    else { setSortKey(key); setDesc(true); }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-inter">
        <thead>
          <tr className="border-b border-brand-border">
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={() => toggle(c.key)}
                className={`py-2 px-2 font-medium text-brand-text-secondary text-xs cursor-pointer select-none hover:text-brand-text-primary ${
                  c.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {c.label}{sortKey === c.key && (desc ? ' ↓' : ' ↑')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} className="border-b border-brand-border/50 hover:bg-brand-bg">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`py-2 px-2 text-brand-text-primary ${
                    c.align === 'right' ? 'text-right tabular-nums' : ''
                  } ${c.mono ? 'font-jetbrains text-xs' : ''}`}
                >
                  {c.render ? c.render(row[c.key], row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  fontFamily: 'inherit',
};

export default function AnalyticsPage() {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState(null);
  const [period, setPeriod] = useState('28d');
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('search');

  useEffect(() => {
    (async () => {
      try {
        const [{ data: cfg }, { data: s }] = await Promise.all([
          api.get('/analytics/config'),
          api.get('/analytics/sites'),
        ]);
        setConfig(cfg);
        setSites(s.items || []);
        if (s.items?.length) setSiteId(s.items[0].id);
      } catch (err) {
        toast.error(formatApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fetchData = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const { data: res } = await api.get('/analytics/dashboard', {
        params: { period, site_id: siteId },
      });
      setData(res);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [period, siteId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Configuration incomplète : expliquer quoi faire plutôt qu'afficher du vide
  if (config && !config.ready) {
    return (
      <div className="max-w-2xl">
        <h1 className="font-manrope font-bold text-2xl text-brand-text-primary mb-4">Analytics</h1>
        <div className="bg-white rounded-lg border border-brand-border p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-brand-warning" />
            <h2 className="font-manrope font-bold text-brand-text-primary">
              Connexion Google à finaliser
            </h2>
          </div>
          <p className="text-sm text-brand-text-secondary font-inter mb-4">
            Renseignez les variables du backend sur Railway pour activer Search Console et Analytics.
          </p>
          <ul className="text-sm font-inter space-y-2 text-brand-text-primary">
            <li>
              <code className="font-jetbrains text-xs bg-brand-bg px-1.5 py-0.5 rounded">GOOGLE_SA_JSON_B64</code>
              {config.service_account_configured
                ? <span className="text-brand-success"> ✓ configuré</span>
                : <span className="text-brand-danger"> — manquant</span>}
            </li>
            <li>
              <code className="font-jetbrains text-xs bg-brand-bg px-1.5 py-0.5 rounded">ANALYTICS_SITES</code>
              {config.sites_count > 0
                ? <span className="text-brand-success"> ✓ {config.sites_count} site(s)</span>
                : <span className="text-brand-danger"> — manquant</span>}
            </li>
          </ul>
          {config.service_account_email && (
            <p className="text-sm text-brand-text-secondary font-inter mt-4">
              Autorisez{' '}
              <code className="font-jetbrains text-xs bg-brand-bg px-1.5 py-0.5 rounded">
                {config.service_account_email}
              </code>{' '}
              dans chaque Search Console et propriété GA4.
            </p>
          )}
        </div>
      </div>
    );
  }

  const gsc = data?.gsc_overview;
  const ga4 = data?.ga4_overview;
  const errors = data?.errors || {};

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-manrope font-bold text-2xl text-brand-text-primary">Analytics</h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1">
            {gsc?.range
              ? `Du ${gsc.range.start} au ${gsc.range.end}`
              : 'Search Console et Google Analytics'}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm font-inter bg-brand-primary text-white rounded-lg hover:bg-brand-primary-hover disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {sites.length > 1 && (
          <select
            value={siteId || ''}
            onChange={(e) => setSiteId(e.target.value)}
            className="px-3 py-2 text-sm font-inter bg-white border border-brand-border rounded-lg text-brand-text-primary"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        )}
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-2 text-sm font-inter rounded-lg border transition-colors ${
                period === p.key
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-white text-brand-text-secondary border-brand-border hover:border-brand-primary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="bg-white border border-brand-warning/40 rounded-lg p-3 mb-4 text-sm font-inter text-brand-text-secondary">
          <span className="text-brand-warning font-medium">Blocs indisponibles :</span>{' '}
          {Object.entries(errors).map(([k, v]) => `${k} (${v})`).join(' · ')}
        </div>
      )}

      <div className="flex gap-1 border-b border-brand-border mb-5">
        {[
          { key: 'search', label: 'Recherche Google' },
          { key: 'audience', label: 'Audience du site' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-inter font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-brand-primary text-brand-text-primary'
                : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
        </div>
      )}

      {tab === 'search' && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiCard icon={MousePointerClick} label="Clics" value={formatNum(gsc?.current?.clicks)} delta={gsc?.delta?.clicks} testid="kpi-clicks" />
            <KpiCard icon={Eye} label="Impressions" value={formatNum(gsc?.current?.impressions)} delta={gsc?.delta?.impressions} testid="kpi-impressions" />
            <KpiCard icon={Percent} label="CTR moyen" value={gsc?.current?.ctr ?? '—'} suffix="%" delta={gsc?.delta?.ctr} testid="kpi-ctr" />
            <KpiCard
              icon={TrendingUp}
              label="Position moyenne"
              value={gsc?.current?.position ?? '—'}
              delta={gsc?.delta?.position}
              hint="Un chiffre plus bas est meilleur"
              testid="kpi-position"
            />
          </div>

          <Panel
            title="Évolution quotidienne"
            subtitle={`Search Console publie avec ${config?.gsc_lag_days ?? 3} jours de décalage.`}
            icon={TrendingUp}
          >
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data?.gsc_timeseries?.series || []}>
                <defs>
                  <linearGradient id="gClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART.clicks} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={CHART.clicks} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gImpr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART.impressions} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={CHART.impressions} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, n) => [formatNum(v), n === 'clicks' ? 'Clics' : 'Impressions']}
                />
                <Legend formatter={(v) => (v === 'clicks' ? 'Clics' : 'Impressions')} wrapperStyle={{ fontSize: 12 }} />
                <Area yAxisId="r" type="monotone" dataKey="impressions" stroke={CHART.impressions} fill="url(#gImpr)" strokeWidth={1.5} />
                <Area yAxisId="l" type="monotone" dataKey="clicks" stroke={CHART.clicks} fill="url(#gClicks)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel
              title="Requêtes"
              subtitle="La colonne Opport. signale les requêtes très vues mais peu cliquées, déjà dans le top 20."
              icon={Search}
            >
              <DataTable
                columns={[
                  { key: 'query', label: 'Requête' },
                  { key: 'clicks', label: 'Clics', align: 'right' },
                  { key: 'impressions', label: 'Impr.', align: 'right', render: formatNum },
                  { key: 'ctr', label: 'CTR', align: 'right', render: (v) => `${v}%` },
                  { key: 'position', label: 'Pos.', align: 'right' },
                  {
                    key: 'opportunity_score', label: 'Opport.', align: 'right',
                    render: (v) => (v > 0
                      ? <span className="text-brand-accent font-medium">{v}</span>
                      : <span className="text-brand-text-secondary">—</span>),
                  },
                ]}
                rows={data?.gsc_queries?.items}
              />
            </Panel>

            <Panel title="Pages" subtitle="Les pages qui captent le trafic de recherche." icon={FileText}>
              <DataTable
                columns={[
                  { key: 'page', label: 'Page', render: shortenUrl, mono: true },
                  { key: 'clicks', label: 'Clics', align: 'right' },
                  { key: 'impressions', label: 'Impr.', align: 'right', render: formatNum },
                  { key: 'ctr', label: 'CTR', align: 'right', render: (v) => `${v}%` },
                  { key: 'position', label: 'Pos.', align: 'right' },
                ]}
                rows={data?.gsc_pages?.items}
              />
            </Panel>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="Pays" subtitle="Répartition géographique des clics." icon={Globe}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={(data?.gsc_countries?.items || []).slice(0, 8).map((c) => ({
                    ...c, name: COUNTRY_NAMES[c.country] || c.country,
                  }))}
                  layout="vertical"
                  margin={{ left: 10, right: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={85} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatNum(v), 'Clics']} />
                  <Bar dataKey="clicks" fill={CHART.clicks} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Appareils" subtitle="Comment vos visiteurs accèdent au site." icon={Monitor}>
              <DataTable
                columns={[
                  { key: 'device', label: 'Appareil', render: (v) => DEVICE_NAMES[v] || v },
                  { key: 'clicks', label: 'Clics', align: 'right' },
                  { key: 'impressions', label: 'Impr.', align: 'right', render: formatNum },
                  { key: 'ctr', label: 'CTR', align: 'right', render: (v) => `${v}%` },
                  { key: 'position', label: 'Pos.', align: 'right' },
                ]}
                rows={data?.gsc_devices?.items}
              />
            </Panel>
          </div>
        </>
      )}

      {tab === 'audience' && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiCard icon={Users} label="Sessions" value={formatNum(ga4?.current?.sessions)} delta={ga4?.delta?.sessions} />
            <KpiCard icon={Users} label="Utilisateurs" value={formatNum(ga4?.current?.totalUsers)} delta={ga4?.delta?.totalUsers} />
            <KpiCard icon={Eye} label="Pages vues" value={formatNum(ga4?.current?.screenPageViews)} delta={ga4?.delta?.screenPageViews} />
            <KpiCard icon={Clock} label="Durée moyenne" value={formatDuration(ga4?.current?.averageSessionDuration)} delta={ga4?.delta?.averageSessionDuration} />
          </div>

          <Panel title="Trafic quotidien" subtitle="Sessions et utilisateurs jour par jour." icon={TrendingUp}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data?.ga4_timeseries?.series || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={formatNum} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, n) => [formatNum(v), { sessions: 'Sessions', users: 'Utilisateurs', pageviews: 'Pages vues' }[n] || n]}
                />
                <Legend formatter={(v) => ({ sessions: 'Sessions', users: 'Utilisateurs', pageviews: 'Pages vues' }[v] || v)} wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="sessions" stroke={CHART.sessions} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="users" stroke={CHART.users} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Panel title="Sources de trafic" subtitle="D'où arrivent les visiteurs." icon={Globe}>
              <DataTable
                columns={[
                  { key: 'source', label: 'Source' },
                  { key: 'medium', label: 'Canal' },
                  { key: 'sessions', label: 'Sessions', align: 'right', render: formatNum },
                  { key: 'engagement_rate', label: 'Engag.', align: 'right', render: (v) => `${v}%` },
                ]}
                rows={data?.ga4_sources?.items}
              />
            </Panel>

            <Panel title="Pages les plus consultées" subtitle="Vues et temps passé sur place." icon={FileText}>
              <DataTable
                columns={[
                  { key: 'page', label: 'Page', mono: true },
                  { key: 'views', label: 'Vues', align: 'right', render: formatNum },
                  { key: 'users', label: 'Util.', align: 'right', render: formatNum },
                  { key: 'avg_duration_sec', label: 'Durée', align: 'right', render: formatDuration },
                ]}
                rows={data?.ga4_pages?.items}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
