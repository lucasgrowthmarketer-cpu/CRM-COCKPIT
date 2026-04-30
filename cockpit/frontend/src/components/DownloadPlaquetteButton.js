import React, { useState, useEffect } from 'react';
import api, { formatApiError } from '../lib/api';
import { Button } from './ui/button';
import { Download, Eye, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * DownloadPlaquetteButton
 *
 * Variants:
 *   <DownloadPlaquetteButton />                  - bouton standard
 *   <DownloadPlaquetteButton variant="ghost" />  - version discrete
 *   <DownloadPlaquetteButton variant="card" />   - bloc complet avec metadata
 *   <DownloadPlaquetteButton showPreview />      - ajoute un bouton "Apercu"
 */
export default function DownloadPlaquetteButton({
  variant = 'default',
  showPreview = false,
  label = 'Télécharger la plaquette',
}) {
  const [info, setInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/plaquette/info')
      .then(({ data }) => { if (!cancelled) setInfo(data); })
      .catch(() => { if (!cancelled) setInfo(null); });
    return () => { cancelled = true; };
  }, []);

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await api.get('/plaquette/download', { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = info?.filename || 'Industrial_Decision_Plaquette.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Plaquette téléchargée');
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setDownloading(false);
    }
  };

  const openPreview = async () => {
    setPreviewing(true);
    try {
      const res = await api.get('/plaquette/preview', { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      window.open(url, '_blank');
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setPreviewing(false);
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'long', year: 'numeric',
      });
    } catch { return iso; }
  };

  // ===========================================================
  // Variant: card
  // ===========================================================
  if (variant === 'card') {
    return (
      <div className="bg-white rounded-lg border border-brand-border border-l-[3px] border-l-brand-primary p-4 flex items-center justify-between gap-4"
           data-testid="plaquette-card">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-md bg-brand-primary/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-brand-primary" />
          </div>
          <div className="min-w-0">
            <div className="font-manrope font-bold text-sm text-brand-text-primary">
              Plaquette commerciale
            </div>
            <div className="font-jetbrains text-[11px] text-brand-text-secondary mt-0.5">
              {info ? `Version ${info.version} · ${info.size_kb} Ko · 15 pages` : 'Chargement…'}
            </div>
            {info && (
              <div className="text-[11px] text-brand-text-secondary mt-0.5">
                Mise à jour : {formatDate(info.modified_at)}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {showPreview && (
            <Button
              variant="outline"
              size="sm"
              onClick={openPreview}
              disabled={previewing || !info}
              data-testid="plaquette-preview-btn"
            >
              {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
              Aperçu
            </Button>
          )}
          <Button
            size="sm"
            onClick={downloadPdf}
            disabled={downloading || !info}
            data-testid="plaquette-download-btn"
          >
            {downloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <><Download className="w-3.5 h-3.5 mr-1.5" />Télécharger</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ===========================================================
  // Variant: ghost
  // ===========================================================
  if (variant === 'ghost') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={downloadPdf}
        disabled={downloading || !info}
        data-testid="plaquette-download-ghost"
      >
        {downloading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <><Download className="w-3.5 h-3.5 mr-1.5" />Plaquette PDF</>
        )}
      </Button>
    );
  }

  // ===========================================================
  // Variant: default
  // ===========================================================
  return (
    <div className="inline-flex gap-2">
      <Button onClick={downloadPdf} disabled={downloading || !info} data-testid="plaquette-download-btn">
        {downloading ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Téléchargement…</>
        ) : (
          <><Download className="w-4 h-4 mr-2" />{label}</>
        )}
      </Button>
      {showPreview && (
        <Button variant="outline" onClick={openPreview} disabled={previewing || !info}>
          {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
          Aperçu
        </Button>
      )}
    </div>
  );
}
