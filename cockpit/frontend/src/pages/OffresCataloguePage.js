import React, { useState, useMemo } from 'react';
import { OFFRES, DOCTRINE, SKIP_LIST } from '../data/offres.data';
import DownloadPlaquetteButton from '../components/DownloadPlaquetteButton';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Slider } from '../components/ui/slider';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Maximize2, Minimize2, Star, ChevronDown, ChevronUp,
  Sparkles, Calculator, Package, AlertCircle,
} from 'lucide-react';

const TYPE_LABELS = {
  'one-shot': 'One-shot',
  'recurrent': 'Mensuel',
  'devis': 'Sur devis',
};

const formatEur = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export default function OffresCataloguePage() {
  const [activeTab, setActiveTab] = useState('all');
  const [expandedOffre, setExpandedOffre] = useState(null);
  const [presentationMode, setPresentationMode] = useState(false);

  const visibleOffres = activeTab === 'all'
    ? OFFRES
    : OFFRES.filter((o) => o.type === activeTab);

  const counts = {
    all: OFFRES.length,
    'one-shot': OFFRES.filter((o) => o.type === 'one-shot').length,
    'recurrent': OFFRES.filter((o) => o.type === 'recurrent').length,
    'devis': OFFRES.filter((o) => o.type === 'devis').length,
  };

  return (
    <div className={`space-y-6 ${presentationMode ? 'max-w-5xl mx-auto' : ''}`} data-testid="offres-page">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="font-jetbrains text-[10px] text-brand-primary uppercase tracking-wider font-semibold">
            Catalogue · Offres commerciales
          </div>
          <h1 className="font-manrope font-bold text-2xl md:text-3xl text-brand-text-primary leading-tight">
            Notre catalogue d'offres.
          </h1>
          <p className="text-sm text-brand-text-secondary font-inter mt-1.5 max-w-3xl">
            Cinq offres complémentaires pour couvrir tous les cas. Tu n'as pas à toutes les vendre — tu en présentes une ou deux selon le contexte.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <DownloadPlaquetteButton variant="ghost" />
          <Button
            variant={presentationMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPresentationMode(!presentationMode)}
            data-testid="presentation-toggle"
          >
            {presentationMode ? (
              <><Minimize2 className="w-3.5 h-3.5 mr-1.5" />Quitter présentation</>
            ) : (
              <><Maximize2 className="w-3.5 h-3.5 mr-1.5" />Mode présentation</>
            )}
          </Button>
        </div>
      </div>

      {/* Vue d'ensemble */}
      <div>
        <h2 className="font-manrope font-bold text-lg text-brand-text-primary mb-2">Vue d'ensemble</h2>
        <div className="bg-white rounded-lg border border-brand-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-brand-text-primary hover:bg-brand-text-primary">
                <TableHead className="text-white font-manrope text-xs">Offre</TableHead>
                <TableHead className="text-white font-manrope text-xs">Type</TableHead>
                <TableHead className="text-white font-manrope text-xs">Prix HT</TableHead>
                <TableHead className="text-white font-manrope text-xs">Pour qui</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {OFFRES.map((o) => (
                <TableRow
                  key={o.id}
                  className="cursor-pointer"
                  onClick={() => setExpandedOffre(o.id === expandedOffre ? null : o.id)}
                >
                  <TableCell className="font-medium">
                    {o.nom}
                    {o.featured && <Star className="inline w-3.5 h-3.5 ml-1.5 text-orange-500 fill-orange-500" />}
                  </TableCell>
                  <TableCell className="text-sm">{TYPE_LABELS[o.type]}</TableCell>
                  <TableCell className="font-jetbrains text-sm text-brand-primary font-semibold">
                    {o.prix_label}
                  </TableCell>
                  <TableCell className="text-sm text-brand-text-secondary">{o.cible}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Tabs filter */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">Toutes ({counts.all})</TabsTrigger>
          <TabsTrigger value="one-shot">One-shot ({counts['one-shot']})</TabsTrigger>
          <TabsTrigger value="recurrent">Récurrent ({counts.recurrent})</TabsTrigger>
          <TabsTrigger value="devis">Sur devis ({counts.devis})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Cards offres */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleOffres.map((o) => (
          <OffreCard
            key={o.id}
            offre={o}
            expanded={expandedOffre === o.id}
            onToggle={() => setExpandedOffre(o.id === expandedOffre ? null : o.id)}
          />
        ))}
      </div>

      {/* ROI Simulator */}
      <ROISimulator />

      {/* Plaquette commerciale */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Package className="w-4 h-4 text-brand-primary" />
          <h2 className="font-manrope font-bold text-lg text-brand-text-primary">Plaquette commerciale</h2>
        </div>
        <p className="text-sm text-brand-text-secondary font-inter mb-3">
          Le PDF officiel à envoyer aux prospects après un appel ou en pièce jointe d'un email.
        </p>
        <DownloadPlaquetteButton variant="card" showPreview />
      </div>

      {/* Doctrine + Skip list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg border border-brand-border p-5">
          <h2 className="font-manrope font-bold text-lg text-brand-text-primary mb-3">Doctrine commerciale</h2>
          <div className="space-y-3">
            <DoctrinePoint label="Budget non séparable" text={DOCTRINE.budget_lines} />
            <DoctrinePoint label="Prix au téléphone" text={DOCTRINE.pricing_at_call} />
            <DoctrinePoint label="Promesse formelle" text={DOCTRINE.promise} />
            <DoctrinePoint label="Pas de comparaisons" text={DOCTRINE.no_compare} />
            <DoctrinePoint label="Ton éditorial" text={DOCTRINE.language} />
          </div>
        </div>

        <div className="bg-orange-50 rounded-lg border border-orange-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-orange-600" />
            <h2 className="font-manrope font-bold text-base text-brand-text-primary">On NE travaille PAS avec</h2>
          </div>
          <ul className="space-y-2">
            {SKIP_LIST.map((item, i) => (
              <li key={i} className="text-xs text-orange-900 flex gap-2">
                <span className="text-orange-500 shrink-0">✕</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// OffreCard
// -------------------------------------------------------------
function OffreCard({ offre, expanded, onToggle }) {
  const accentColor = offre.color === 'orange' ? 'border-orange-500' : offre.color === 'dark' ? 'border-brand-text-primary' : 'border-brand-primary';
  const priceColor = offre.color === 'orange' ? 'text-orange-600' : offre.color === 'dark' ? 'text-brand-text-primary' : 'text-brand-primary';

  return (
    <div
      className={`bg-white rounded-lg border ${offre.featured ? `border-2 ${accentColor}` : 'border-brand-border'} p-5 flex flex-col relative`}
      data-testid={`offre-${offre.id}`}
    >
      {offre.featured && (
        <Badge className="absolute -top-2 right-3 bg-orange-500 hover:bg-orange-500 text-white">
          <Star className="w-3 h-3 mr-1 fill-white" />
          Recommandée
        </Badge>
      )}

      <div className="font-jetbrains text-[9px] uppercase tracking-wider text-brand-primary font-semibold mb-2">
        {offre.cible}
      </div>
      <h3 className="font-manrope font-bold text-lg text-brand-text-primary mb-2">{offre.nom}</h3>

      <div className="mb-1">
        <span className={`font-manrope font-bold text-2xl ${priceColor}`}>{offre.prix_label}</span>
      </div>
      <div className="text-xs text-brand-text-secondary italic mb-3">{offre.delai}</div>

      <p className="text-xs text-brand-text-primary leading-relaxed mb-3">{offre.pitch}</p>

      {expanded ? (
        <>
          <div className="mb-3">
            <div className="font-jetbrains text-[9px] text-brand-primary uppercase tracking-wider font-semibold mb-1.5">
              Livrables
            </div>
            <ul className="space-y-1 text-xs text-brand-text-primary list-disc pl-4">
              {offre.livrables.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-2 py-2 border-y border-brand-border mb-3 text-xs">
            <div>
              <div className="font-jetbrains text-[9px] text-brand-text-secondary uppercase tracking-wider mb-0.5">Échéancier</div>
              <div>{offre.echeancier}</div>
            </div>
            <div>
              <div className="font-jetbrains text-[9px] text-brand-text-secondary uppercase tracking-wider mb-0.5">Engagement</div>
              <div>{offre.engagement}</div>
            </div>
          </div>

          <div className="bg-brand-bg rounded-md p-2.5 mb-2">
            <div className="font-jetbrains text-[9px] text-brand-primary uppercase tracking-wider font-semibold mb-1">
              Quand la proposer
            </div>
            <p className="text-xs text-brand-text-secondary">{offre.when_propose}</p>
          </div>

          <Button variant="ghost" size="sm" onClick={onToggle} className={`text-xs ${priceColor} self-start mt-auto`}>
            <ChevronUp className="w-3 h-3 mr-1" />Replier
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={onToggle} className="text-xs mt-auto">
          Voir détails
          <ChevronDown className="w-3 h-3 ml-1" />
        </Button>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// DoctrinePoint
// -------------------------------------------------------------
function DoctrinePoint({ label, text }) {
  return (
    <div>
      <div className="font-manrope font-semibold text-sm text-brand-primary mb-1">{label}</div>
      <p className="text-xs text-brand-text-primary leading-relaxed">{text}</p>
    </div>
  );
}

// -------------------------------------------------------------
// ROI Simulator
// -------------------------------------------------------------
function ROISimulator() {
  const [panier, setPanier] = useState(5000);
  const [conversion, setConversion] = useState(20);
  const [leads, setLeads] = useState(5);
  const [packPrice, setPackPrice] = useState(4250);
  const [monthlyPrice, setMonthlyPrice] = useState(1500);

  const stats = useMemo(() => {
    const leads_an = leads * 12;
    const clients_an = leads_an * (conversion / 100);
    const ca_an = clients_an * panier;
    const invest_an = packPrice + (monthlyPrice * 12);
    const roi = invest_an > 0 ? ca_an / invest_an : 0;
    const amort_mois = invest_an > 0 ? Math.ceil(invest_an / (ca_an / 12 || 1)) : 0;
    return { leads_an, clients_an: clients_an.toFixed(1), ca_an, invest_an, roi: roi.toFixed(1), amort_mois };
  }, [panier, conversion, leads, packPrice, monthlyPrice]);

  return (
    <div className="bg-brand-text-primary rounded-lg p-6 text-white" data-testid="roi-simulator">
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-4 h-4 text-orange-400" />
        <span className="font-jetbrains text-[10px] text-orange-400 uppercase tracking-wider font-semibold">
          Outil démo
        </span>
      </div>
      <h2 className="font-manrope font-bold text-xl mb-1">Simulateur ROI</h2>
      <p className="text-xs text-blue-200 max-w-2xl mb-5">
        À utiliser en visio quand un dirigeant te dit « c'est cher ». Ajuste les curseurs avec ses chiffres à lui, le ROI se recalcule en live.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <ROIInput
            label="Panier client moyen (€)"
            value={panier} onChange={setPanier}
            min={500} max={500000} step={500} unit="€"
          />
          <ROIInput
            label="Taux de conversion lead → client (%)"
            value={conversion} onChange={setConversion}
            min={1} max={50} step={1} unit="%"
          />
          <ROIInput
            label="Leads / mois (engagement Industrial Decision)"
            value={leads} onChange={setLeads}
            min={5} max={15} step={1} unit="/mois"
            hint="Notre engagement formel : 5 à 15 leads/mois en 6 semaines"
          />
          <hr className="border-blue-800" />
          <ROIInput
            label="Pack initial (€ HT)"
            value={packPrice} onChange={setPackPrice}
            min={2500} max={15000} step={250} unit="€"
            presets={[
              { label: 'Audit', val: 2500 },
              { label: 'Démarrage', val: 4250 },
              { label: 'Performance', val: 8500 },
            ]}
          />
          <ROIInput
            label="Accompagnement mensuel (€/mois HT)"
            value={monthlyPrice} onChange={setMonthlyPrice}
            min={0} max={5000} step={250} unit="€/mois"
            presets={[
              { label: 'Aucun', val: 0 },
              { label: 'Essentiel', val: 1500 },
              { label: 'Performance', val: 2500 },
              { label: 'Croissance', val: 3500 },
            ]}
          />
        </div>

        <div>
          <div className="bg-blue-950/40 rounded-lg p-5">
            <ResultLine label="Leads / an" value={stats.leads_an} />
            <ResultLine label="Nouveaux clients / an" value={stats.clients_an} />
            <ResultLine label="Investissement année 1" value={formatEur(stats.invest_an)} />
            <ResultLine label="CA additionnel / an" value={formatEur(stats.ca_an)} />
            <hr className="border-blue-800 my-3" />
            <ResultLine label="ROI brut année 1" value={`${stats.roi}x`} highlight />
            <ResultLine label="Amortissement" value={`${stats.amort_mois} mois`} highlight />
          </div>

          <div className="mt-3 text-[11px] text-blue-200 leading-relaxed bg-blue-950/40 border-l-2 border-orange-400 p-3 rounded">
            <Sparkles className="inline w-3 h-3 mr-1" />
            Ces calculs sont des illustrations de potentiel, pas des promesses. Notre engagement formel reste : <strong className="text-white">5 à 15 leads qualifiés / mois en 6 semaines</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}

function ROIInput({ label, value, onChange, min, max, step, unit, hint, presets }) {
  return (
    <div>
      <label className="block font-jetbrains text-[10px] text-blue-200 uppercase tracking-wider mb-2">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <Slider
          min={min} max={max} step={step}
          value={[value]}
          onValueChange={(v) => onChange(v[0])}
          className="flex-1"
        />
        <Input
          type="number"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-24 h-8 bg-blue-950/40 border-blue-800 text-white text-xs font-jetbrains"
        />
        <span className="text-[10px] text-blue-300 w-14 shrink-0">{unit}</span>
      </div>
      {presets && (
        <div className="flex flex-wrap gap-1 mt-2">
          {presets.map((p) => (
            <button
              key={p.val}
              type="button"
              onClick={() => onChange(p.val)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                value === p.val
                  ? 'bg-orange-400 border-orange-400 text-white font-semibold'
                  : 'bg-transparent border-blue-700 text-blue-200 hover:border-orange-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {hint && (
        <div className="text-[10px] text-blue-400/70 italic mt-1.5">{hint}</div>
      )}
    </div>
  );
}

function ResultLine({ label, value, highlight }) {
  return (
    <div className={`flex justify-between py-1.5 ${highlight ? 'font-manrope font-bold text-base' : 'font-jetbrains text-xs'} ${highlight ? 'text-white' : 'text-blue-100'}`}>
      <span>→ {label}</span>
      <span className={highlight ? 'text-orange-400' : 'text-white font-semibold'}>{value}</span>
    </div>
  );
}
