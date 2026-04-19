import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2,
  AlertTriangle, X, Download, Building2, Users,
} from 'lucide-react';
import { toast } from 'sonner';

const STEPS = [
  { key: 'upload', label: 'Fichier' },
  { key: 'sheet', label: 'Onglet' },
  { key: 'preview', label: 'Aperçu' },
  { key: 'mapping', label: 'Correspondances' },
  { key: 'options', label: 'Options' },
  { key: 'result', label: 'Import' },
];

const TARGETS = [
  {
    value: 'entreprises',
    label: 'Entreprises',
    icon: Building2,
    desc: 'Chaque ligne crée une entreprise dans le pipeline.',
  },
  {
    value: 'contacts',
    label: 'Contacts',
    icon: Users,
    desc: "Chaque ligne crée un contact rattaché à une entreprise. Les entreprises manquantes sont créées automatiquement.",
  },
];

const DUP_STRATEGIES = [
  { value: 'skip', label: 'Ignorer les doublons', desc: "Ne touche pas aux enregistrements existants." },
  { value: 'merge', label: 'Fusionner (sûr)', desc: "Complète uniquement les champs vides des enregistrements existants." },
  { value: 'overwrite', label: 'Écraser', desc: "Remplace toutes les données existantes. Destructif." },
];

const PROPRIETAIRES = [
  { value: 'lucas', label: 'Lucas' },
  { value: 'ayoub', label: 'Ayoub' },
  { value: 'david', label: 'David' },
];

function Stepper({ current }) {
  const currentIdx = STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-6">
      {STEPS.map((s, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <React.Fragment key={s.key}>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-inter whitespace-nowrap ${
              active ? 'bg-brand-primary text-white font-medium' :
              done ? 'bg-brand-success/10 text-brand-success' :
              'bg-brand-bg text-brand-text-secondary'
            }`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                active ? 'bg-white text-brand-primary' :
                done ? 'bg-brand-success text-white' :
                'bg-white text-brand-text-secondary border border-brand-border'
              }`}>
                {done ? '✓' : idx + 1}
              </span>
              {s.label}
            </div>
            {idx < STEPS.length - 1 && (
              <ArrowRight className="w-3 h-3 text-brand-text-secondary shrink-0" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function ImportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInput = useRef(null);

  const [step, setStep] = useState('upload');
  const [loading, setLoading] = useState(false);

  // Step 1: file
  const [file, setFile] = useState(null);
  const [uploadData, setUploadData] = useState(null); // { token, filename, sheets: [...] }

  // Step 2: sheet
  const [selectedSheet, setSelectedSheet] = useState(null);

  // Step 4: mapping
  const [target, setTarget] = useState('entreprises');
  const [mapping, setMapping] = useState({}); // { header: target_field }
  const [targetFields, setTargetFields] = useState([]);

  // Step 5: options
  const [dupStrategy, setDupStrategy] = useState('skip');
  const [defaultOwner, setDefaultOwner] = useState(() => {
    const myName = user?.nom?.split(' ')[0]?.toLowerCase() || 'lucas';
    return ['lucas', 'ayoub', 'david'].includes(myName) ? myName : 'lucas';
  });

  // Step 6: result
  const [result, setResult] = useState(null);

  const goToStep = (s) => setStep(s);

  // === Step 1: Upload ===
  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f);
  };

  const doUpload = async () => {
    if (!file) { toast.error('Aucun fichier sélectionné'); return; }
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/import/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (!data.sheets?.length) {
        toast.error('Aucun onglet lisible dans le fichier');
        return;
      }
      setUploadData(data);
      // Auto-skip sheet step if only 1 sheet
      if (data.sheets.length === 1) {
        setSelectedSheet(data.sheets[0]);
        await fetchSuggestions(data.sheets[0].headers, target);
        goToStep('preview');
      } else {
        goToStep('sheet');
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  // === Step 2: Sheet selection ===
  const selectSheet = async (sheet) => {
    setSelectedSheet(sheet);
    await fetchSuggestions(sheet.headers, target);
    goToStep('preview');
  };

  // Fetch auto-suggestions when target changes
  const fetchSuggestions = useCallback(async (headers, tgt) => {
    try {
      const { data } = await api.post('/import/suggest', { headers, target: tgt });
      setMapping(data.suggestions || {});
      setTargetFields(data.target_fields || []);
    } catch (err) {
      toast.error(formatApiError(err));
    }
  }, []);

  const changeTarget = async (newTarget) => {
    setTarget(newTarget);
    if (selectedSheet) {
      await fetchSuggestions(selectedSheet.headers, newTarget);
    }
  };

  // === Step 5 → 6: Execute ===
  const doImport = async () => {
    setLoading(true);
    try {
      const payload = {
        token: uploadData.token,
        sheet_name: selectedSheet?.name && uploadData.sheets.length > 1 ? selectedSheet.name : (selectedSheet?.name || null),
        target,
        mapping,
        duplicate_strategy: dupStrategy,
        default_proprietaire: defaultOwner,
      };
      const { data } = await api.post('/import/execute', payload);
      setResult(data);
      goToStep('result');
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setStep('upload');
    setFile(null);
    setUploadData(null);
    setSelectedSheet(null);
    setMapping({});
    setResult(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  const downloadErrors = () => {
    if (!result?.errors?.length) return;
    const csv = 'ligne,erreur\n' + result.errors.map(e =>
      `${e.row},"${String(e.error).replace(/"/g, '""')}"`
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'erreurs_import.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Validation per step
  const requiredField = target === 'entreprises' ? 'nom' : 'entreprise_nom';
  const mappedFieldsSet = new Set(Object.values(mapping));
  const requiredFieldPresent = mappedFieldsSet.has(requiredField);
  const hasSecondRequired = target === 'contacts' ? (mappedFieldsSet.has('nom') || mappedFieldsSet.has('contact_raw')) : true;
  const canProceedMapping = requiredFieldPresent && hasSecondRequired;

  return (
    <div data-testid="import-page" className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-manrope font-bold text-xl sm:text-2xl text-brand-text-primary">
          Import Excel / CSV
        </h1>
        <p className="text-sm text-brand-text-secondary font-inter mt-1">
          Charger un fichier pour créer en masse des entreprises ou des contacts.
        </p>
      </div>

      <Stepper current={step} />

      {/* === STEP 1: Upload === */}
      {step === 'upload' && (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInput.current?.click()}
            className="border-2 border-dashed border-brand-border rounded-lg p-12 text-center cursor-pointer hover:bg-brand-bg transition-colors"
            data-testid="upload-zone"
          >
            <Upload className="w-10 h-10 text-brand-text-secondary mx-auto mb-3" />
            <p className="font-inter text-brand-text-primary font-medium mb-1">
              {file ? file.name : 'Glisser-déposer ou cliquer pour choisir'}
            </p>
            <p className="text-xs text-brand-text-secondary font-inter">
              .xlsx ou .csv — 10 Mo max
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              className="hidden"
              data-testid="file-input"
            />
          </div>
          <div className="flex justify-end mt-4">
            <Button
              onClick={doUpload}
              disabled={!file || loading}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
              data-testid="upload-submit"
            >
              {loading ? 'Analyse...' : (<>
                Analyser le fichier <ArrowRight className="w-4 h-4 ml-2" />
              </>)}
            </Button>
          </div>
        </div>
      )}

      {/* === STEP 2: Sheet === */}
      {step === 'sheet' && uploadData && (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-6" data-testid="sheet-step">
          <h2 className="font-manrope font-semibold text-brand-text-primary mb-4">
            Quel onglet importer ?
          </h2>
          <div className="space-y-2">
            {uploadData.sheets.map(s => (
              <button
                key={s.name}
                onClick={() => selectSheet(s)}
                className="w-full text-left p-4 rounded-lg border border-brand-border hover:border-brand-primary hover:bg-brand-bg transition-colors flex items-center justify-between group"
                data-testid={`sheet-option-${s.name}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-brand-primary shrink-0" />
                    <span className="font-inter font-medium text-brand-text-primary">{s.name}</span>
                  </div>
                  <div className="text-xs text-brand-text-secondary font-inter mt-1">
                    {s.total_rows} ligne{s.total_rows > 1 ? 's' : ''} &middot; {s.headers.length} colonne{s.headers.length > 1 ? 's' : ''}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-brand-text-secondary group-hover:text-brand-primary" />
              </button>
            ))}
          </div>
          <div className="flex justify-start mt-4">
            <Button variant="outline" onClick={() => goToStep('upload')} className="font-inter border-brand-border">
              <ArrowLeft className="w-4 h-4 mr-2" /> Retour
            </Button>
          </div>
        </div>
      )}

      {/* === STEP 3: Preview === */}
      {step === 'preview' && selectedSheet && (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-6" data-testid="preview-step">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-manrope font-semibold text-brand-text-primary">
                Aperçu — {selectedSheet.name}
              </h2>
              <p className="text-xs text-brand-text-secondary font-inter mt-1">
                {selectedSheet.total_rows} ligne{selectedSheet.total_rows > 1 ? 's' : ''}, {selectedSheet.preview.length} affichées
              </p>
            </div>
            <Badge className="bg-brand-bg text-brand-text-secondary font-inter border border-brand-border">
              {selectedSheet.headers.length} colonnes
            </Badge>
          </div>
          <div className="overflow-x-auto border border-brand-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-brand-bg">
                <tr>
                  {selectedSheet.headers.map((h, i) => (
                    <th key={i} className="text-left px-3 py-2 font-manrope font-semibold text-xs text-brand-text-primary uppercase border-b border-brand-border whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedSheet.preview.map((row, i) => (
                  <tr key={i} className="border-b border-brand-border last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-2 font-inter text-brand-text-primary text-xs max-w-xs truncate" title={cell}>
                        {cell || <span className="text-brand-text-secondary italic">vide</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between mt-4">
            <Button variant="outline" onClick={() => uploadData.sheets.length > 1 ? goToStep('sheet') : goToStep('upload')} className="font-inter border-brand-border">
              <ArrowLeft className="w-4 h-4 mr-2" /> Retour
            </Button>
            <Button onClick={() => goToStep('mapping')} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter">
              Correspondances <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* === STEP 4: Mapping === */}
      {step === 'mapping' && selectedSheet && (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-6" data-testid="mapping-step">
          <h2 className="font-manrope font-semibold text-brand-text-primary mb-4">
            Cible de l'import
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {TARGETS.map(t => {
              const Icon = t.icon;
              const active = target === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => changeTarget(t.value)}
                  className={`text-left p-4 rounded-lg border-2 transition-colors ${
                    active ? 'border-brand-primary bg-brand-bg' : 'border-brand-border hover:border-brand-text-secondary'
                  }`}
                  data-testid={`target-${t.value}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${active ? 'text-brand-primary' : 'text-brand-text-secondary'}`} />
                    <span className="font-manrope font-semibold text-brand-text-primary">{t.label}</span>
                  </div>
                  <p className="text-xs text-brand-text-secondary font-inter">{t.desc}</p>
                </button>
              );
            })}
          </div>

          <h2 className="font-manrope font-semibold text-brand-text-primary mb-2">
            Correspondances
          </h2>
          <p className="text-xs text-brand-text-secondary font-inter mb-4">
            Pour chaque colonne du fichier, choisir le champ cible. Les colonnes non mappées sont ignorées.
          </p>

          {!canProceedMapping && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm font-inter">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                {target === 'entreprises'
                  ? 'Au moins une colonne doit être mappée sur "Nom".'
                  : 'Au moins une colonne doit être mappée sur "Nom de l\'entreprise", et une autre sur "Nom" ou "Nom complet".'}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {selectedSheet.headers.map((h) => {
              const currentValue = mapping[h] || '__skip__';
              return (
                <div key={h} className="flex items-center gap-3 p-2 rounded hover:bg-brand-bg">
                  <div className="flex-1 min-w-0 font-inter text-sm text-brand-text-primary truncate" title={h}>
                    {h}
                  </div>
                  <ArrowRight className="w-3 h-3 text-brand-text-secondary shrink-0" />
                  <Select
                    value={currentValue}
                    onValueChange={(v) => setMapping(prev => ({ ...prev, [h]: v }))}
                  >
                    <SelectTrigger className="w-64 font-inter text-sm" data-testid={`mapping-${h}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {targetFields.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between mt-6">
            <Button variant="outline" onClick={() => goToStep('preview')} className="font-inter border-brand-border">
              <ArrowLeft className="w-4 h-4 mr-2" /> Retour
            </Button>
            <Button
              onClick={() => goToStep('options')}
              disabled={!canProceedMapping}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
              data-testid="to-options"
            >
              Options <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* === STEP 5: Options === */}
      {step === 'options' && (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-6 space-y-6" data-testid="options-step">
          <div>
            <Label className="font-inter font-medium mb-3 block">Gestion des doublons</Label>
            <div className="space-y-2">
              {DUP_STRATEGIES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setDupStrategy(s.value)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                    dupStrategy === s.value ? 'border-brand-primary bg-brand-bg' : 'border-brand-border hover:border-brand-text-secondary'
                  }`}
                  data-testid={`dup-${s.value}`}
                >
                  <div className="font-inter font-medium text-brand-text-primary text-sm">{s.label}</div>
                  <div className="text-xs text-brand-text-secondary font-inter mt-0.5">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="font-inter font-medium mb-3 block">Propriétaire par défaut</Label>
            <Select value={defaultOwner} onValueChange={setDefaultOwner}>
              <SelectTrigger className="w-64 font-inter" data-testid="default-owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPRIETAIRES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-brand-text-secondary font-inter mt-2">
              Appliqué aux nouveaux enregistrements créés par cet import.
            </p>
          </div>

          <div className="bg-brand-bg rounded-lg p-4 text-sm font-inter">
            <div className="font-semibold text-brand-text-primary mb-2">Résumé avant lancement</div>
            <ul className="space-y-1 text-brand-text-secondary">
              <li>Fichier : <span className="text-brand-text-primary">{uploadData?.filename}</span></li>
              {selectedSheet && <li>Onglet : <span className="text-brand-text-primary">{selectedSheet.name}</span> ({selectedSheet.total_rows} lignes)</li>}
              <li>Cible : <span className="text-brand-text-primary">{TARGETS.find(t => t.value === target)?.label}</span></li>
              <li>Colonnes mappées : <span className="text-brand-text-primary">{Object.values(mapping).filter(v => v && v !== '__skip__').length}</span> / {selectedSheet?.headers.length}</li>
              <li>Doublons : <span className="text-brand-text-primary">{DUP_STRATEGIES.find(s => s.value === dupStrategy)?.label}</span></li>
            </ul>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goToStep('mapping')} className="font-inter border-brand-border">
              <ArrowLeft className="w-4 h-4 mr-2" /> Retour
            </Button>
            <Button
              onClick={doImport}
              disabled={loading}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
              data-testid="execute-import"
            >
              {loading ? 'Import en cours...' : (<>
                Lancer l'import <ArrowRight className="w-4 h-4 ml-2" />
              </>)}
            </Button>
          </div>
        </div>
      )}

      {/* === STEP 6: Result === */}
      {step === 'result' && result && (
        <div className="bg-white rounded-lg border border-brand-border shadow-sm p-6" data-testid="result-step">
          <div className="text-center mb-6">
            <CheckCircle2 className="w-12 h-12 text-brand-success mx-auto mb-3" />
            <h2 className="font-manrope font-bold text-xl text-brand-text-primary">Import terminé</h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-brand-bg rounded-lg p-4 text-center">
              <div className="font-manrope font-bold text-2xl text-brand-success">{result.created}</div>
              <div className="text-xs text-brand-text-secondary font-inter mt-1">Créés</div>
            </div>
            <div className="bg-brand-bg rounded-lg p-4 text-center">
              <div className="font-manrope font-bold text-2xl text-brand-primary">{result.updated}</div>
              <div className="text-xs text-brand-text-secondary font-inter mt-1">Mis à jour</div>
            </div>
            <div className="bg-brand-bg rounded-lg p-4 text-center">
              <div className="font-manrope font-bold text-2xl text-brand-text-secondary">{result.skipped}</div>
              <div className="text-xs text-brand-text-secondary font-inter mt-1">Ignorés</div>
            </div>
            <div className="bg-brand-bg rounded-lg p-4 text-center">
              <div className={`font-manrope font-bold text-2xl ${result.error_count > 0 ? 'text-brand-danger' : 'text-brand-text-secondary'}`}>
                {result.error_count}
              </div>
              <div className="text-xs text-brand-text-secondary font-inter mt-1">Erreurs</div>
            </div>
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="border border-brand-border rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-manrope font-semibold text-brand-text-primary text-sm">
                  Erreurs ({result.error_count})
                </h3>
                <Button variant="outline" size="sm" onClick={downloadErrors} className="font-inter border-brand-border">
                  <Download className="w-3 h-3 mr-2" /> CSV
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-xs font-inter text-brand-text-secondary flex gap-2">
                    <span className="font-mono text-brand-danger shrink-0">Ligne {e.row}</span>
                    <span className="truncate">{e.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={resetAll} className="font-inter border-brand-border">
              <Upload className="w-4 h-4 mr-2" /> Nouvel import
            </Button>
            <Button
              onClick={() => navigate(target === 'entreprises' ? '/entreprises' : '/contacts')}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter"
            >
              Voir les {target === 'entreprises' ? 'entreprises' : 'contacts'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
