import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { formatApiError } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Textarea } from '../components/ui/textarea';
import { ArrowLeft, Pencil, Save, X, Trash2, Plus, ExternalLink, Mail, Phone, Linkedin, MessageSquare, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { useAuth } from '../contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import EntrepriseEmailsBlock from '../components/EntrepriseEmailsBlock';

const REGIONS = [
  "Auvergne-Rhone-Alpes","Bourgogne-Franche-Comte","Bretagne","Centre-Val de Loire",
  "Corse","Grand Est","Hauts-de-France","Ile-de-France","Normandie",
  "Nouvelle-Aquitaine","Occitanie","Pays de la Loire","Provence-Alpes-Cote d'Azur"
];
const STATUTS = [
  { value:"froid", label:"Froid" },{ value:"qualifie", label:"Qualifie" },
  { value:"contacte", label:"Contacte" },{ value:"en_conversation", label:"En conversation" },
  { value:"diagnostic_envoye", label:"Diagnostic envoye" },{ value:"propale", label:"Proposition" },
  { value:"signe", label:"Signe" },{ value:"perdu", label:"Perdu" }
];
const SIGNAUX_OPTIONS = [
  { value:"ownership_transition", label:"Transition de propriete" },
  { value:"site_obsolete", label:"Site obsolete" },
  { value:"seo_faible", label:"SEO faible" },
  { value:"pas_https", label:"Pas HTTPS" }
];
const PIPELINE_COLORS = {
  froid:"bg-gray-100 text-gray-700",qualifie:"bg-blue-100 text-blue-700",
  contacte:"bg-orange-100 text-orange-700",en_conversation:"bg-yellow-100 text-yellow-700",
  diagnostic_envoye:"bg-purple-100 text-purple-700",propale:"bg-indigo-100 text-indigo-700",
  signe:"bg-green-100 text-green-700",perdu:"bg-red-100 text-red-700"
};

const formatCA = (ca) => {
  if (!ca && ca !== 0) return "-";
  return new Intl.NumberFormat('fr-FR', { style:'currency', currency:'EUR', maximumFractionDigits:0 }).format(ca);
};

export default function EntrepriseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [entreprise, setEntreprise] = useState(null);
  const [secteurs, setSecteurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchEntreprise = useCallback(async () => {
    try {
      const { data } = await api.get(`/entreprises/${id}`);
      setEntreprise(data);
      setEditData(data);
    } catch (err) {
      toast.error(formatApiError(err));
      navigate('/entreprises');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchSecteurs = useCallback(async () => {
    try {
      const { data } = await api.get('/secteurs');
      setSecteurs(data.data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchEntreprise(); fetchSecteurs(); }, [fetchEntreprise, fetchSecteurs]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...editData };
      // Clean up computed/read-only fields
      delete payload.id;
      delete payload.score_icp;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.secteur;
      delete payload.secteur_libelle;
      delete payload.secteur_naf;
      // Convert numbers
      if (payload.ca !== null && payload.ca !== undefined && payload.ca !== '') payload.ca = parseFloat(payload.ca);
      else payload.ca = null;
      if (payload.effectif !== null && payload.effectif !== undefined && payload.effectif !== '') payload.effectif = parseInt(payload.effectif);
      else payload.effectif = null;
      if (payload.authority_score !== null && payload.authority_score !== undefined && payload.authority_score !== '') payload.authority_score = parseInt(payload.authority_score);
      else payload.authority_score = null;

      const { data } = await api.put(`/entreprises/${id}`, payload);
      setEntreprise(data);
      setEditData(data);
      setEditing(false);
      toast.success('Entreprise mise a jour');
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Supprimer cette entreprise ?')) return;
    try {
      await api.delete(`/entreprises/${id}`);
      toast.success('Entreprise supprimee');
      navigate('/entreprises');
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const handleNoteSave = async () => {
    try {
      await api.put(`/entreprises/${id}`, { notes: editData.notes });
      setEntreprise(prev => ({ ...prev, notes: editData.notes }));
      toast.success('Notes enregistrees');
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  const toggleSignal = (val) => {
    setEditData(prev => {
      const arr = prev.signaux_digitaux || [];
      return {
        ...prev,
        signaux_digitaux: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
      </div>
    );
  }

  if (!entreprise) return null;

  const icpColor = entreprise.score_icp > 70 ? 'bg-brand-success text-white' :
    entreprise.score_icp >= 40 ? 'bg-brand-warning text-white' : 'bg-brand-danger text-white';

  return (
    <div data-testid="entreprise-detail-page">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/entreprises')} data-testid="back-btn" className="text-brand-text-secondary">
          <ArrowLeft className="w-4 h-4 mr-1" /> Entreprises
        </Button>
        <span className="text-brand-text-secondary">/</span>
        <span className="text-sm font-inter font-medium text-brand-text-primary">{entreprise.nom}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Company Info */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-brand-border shadow-sm">
            <div className="p-5 border-b border-brand-border flex items-center justify-between">
              <h2 className="font-manrope font-bold text-lg text-brand-text-primary">Informations</h2>
              <div className="flex items-center gap-1">
                {editing ? (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(false); setEditData(entreprise); }} data-testid="cancel-edit-btn">
                      <X className="w-4 h-4 text-brand-text-secondary" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleSave} disabled={saving} data-testid="save-edit-btn">
                      <Save className="w-4 h-4 text-brand-primary" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(true)} data-testid="edit-btn">
                      <Pencil className="w-4 h-4 text-brand-text-secondary" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleDelete} data-testid="delete-entreprise-btn">
                      <Trash2 className="w-4 h-4 text-brand-danger" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="p-5 space-y-4">
              {/* Score ICP badge */}
              <div className="flex items-center gap-2 mb-2">
                <Badge className={`${icpColor} border-0 font-mono text-sm`}>ICP: {entreprise.score_icp}</Badge>
                <Badge className={`${PIPELINE_COLORS[entreprise.statut_pipeline] || 'bg-gray-100 text-gray-700'} border-0 text-xs font-inter`}>
                  {STATUTS.find(s => s.value === entreprise.statut_pipeline)?.label || entreprise.statut_pipeline}
                </Badge>
              </div>

              {/* Fields */}
              <Field label="Nom" editing={editing} value={editData.nom}
                onChange={v => setEditData({...editData, nom: v})} display={entreprise.nom} />
              <Field label="SIRET" editing={editing} value={editData.siret || ''}
                onChange={v => setEditData({...editData, siret: v})} display={entreprise.siret} mono maxLength={14} />
              <Field label="Code NAF" editing={editing} value={editData.naf_code || ''}
                onChange={v => setEditData({...editData, naf_code: v})} display={entreprise.naf_code} mono />

              {editing ? (
                <div className="space-y-1">
                  <p className="text-xs font-inter text-brand-text-secondary">Secteur</p>
                  <Select value={editData.secteur_id || ''} onValueChange={v => setEditData({...editData, secteur_id: v})}>
                    <SelectTrigger data-testid="edit-secteur"><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>
                      {secteurs.map(s => <SelectItem key={s.id} value={s.id}>{s.libelle}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <FieldDisplay label="Secteur" value={
                  // Support both new format (string) and legacy (object {libelle})
                  typeof entreprise.secteur === 'string' ? entreprise.secteur :
                    entreprise.secteur?.libelle || entreprise.secteur_libelle
                } />
              )}

              <Field label="CA" editing={editing} value={editData.ca ?? ''}
                onChange={v => setEditData({...editData, ca: v})} display={formatCA(entreprise.ca)} type="number" />
              <Field label="Effectif" editing={editing} value={editData.effectif ?? ''}
                onChange={v => setEditData({...editData, effectif: v})} display={entreprise.effectif} type="number" />
              <Field label="Ville" editing={editing} value={editData.ville || ''}
                onChange={v => setEditData({...editData, ville: v})} display={entreprise.ville} />

              {entreprise.dept_code && !editing ? (
                <FieldDisplay label="Departement" value={entreprise.dept_code} mono />
              ) : null}

              {editing ? (
                <div className="space-y-1">
                  <p className="text-xs font-inter text-brand-text-secondary">Region</p>
                  <Select value={editData.region || ''} onValueChange={v => setEditData({...editData, region: v})}>
                    <SelectTrigger data-testid="edit-region"><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>
                      {REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <FieldDisplay label="Region" value={entreprise.region} />
              )}

              <Field label="Adresse" editing={editing} value={editData.adresse || ''}
                onChange={v => setEditData({...editData, adresse: v})} display={entreprise.adresse} />
              <Field label="Site web" editing={editing} value={editData.site_web || ''}
                onChange={v => setEditData({...editData, site_web: v})} display={entreprise.site_web} link />
              <Field label="Authority Score" editing={editing} value={editData.authority_score ?? ''}
                onChange={v => setEditData({...editData, authority_score: v})} display={entreprise.authority_score} type="number" />

              {editing ? (
                <div className="space-y-1">
                  <p className="text-xs font-inter text-brand-text-secondary">Statut pipeline</p>
                  <Select value={editData.statut_pipeline} onValueChange={v => setEditData({...editData, statut_pipeline: v})}>
                    <SelectTrigger data-testid="edit-statut"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {/* Signaux digitaux */}
              <div className="space-y-1">
                <p className="text-xs font-inter text-brand-text-secondary">Signaux digitaux</p>
                {editing ? (
                  <div className="flex flex-wrap gap-2">
                    {SIGNAUX_OPTIONS.map(s => (
                      <label key={s.value} className="flex items-center gap-1.5 text-xs font-inter cursor-pointer">
                        <Checkbox
                          checked={(editData.signaux_digitaux || []).includes(s.value)}
                          onCheckedChange={() => toggleSignal(s.value)}
                          data-testid={`edit-signal-${s.value}`}
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(entreprise.signaux_digitaux || []).length > 0 ? (
                      entreprise.signaux_digitaux.map(s => (
                        <span key={s} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-brand-bg text-brand-text-secondary font-inter border border-brand-border">
                          {SIGNAUX_OPTIONS.find(o => o.value === s)?.label || s}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-brand-text-secondary font-inter">-</span>
                    )}
                  </div>
                )}
              </div>

              <FieldDisplay label="Proprietaire" value={entreprise.proprietaire} capitalize />
              <FieldDisplay label="Source" value={entreprise.source} />
            </div>
          </div>
        </div>

        {/* Right Column - Tabs */}
        <div className="lg:col-span-2">
          {/* Outreach card - shows ready-to-send email and metadata */}
          <OutreachCard entreprise={entreprise} onMarkSent={() => fetchEntreprise()} />

          <div className="bg-white rounded-lg border border-brand-border shadow-sm">
            <Tabs defaultValue="contacts" className="w-full">
              <TabsList className="w-full justify-start border-b border-brand-border rounded-none bg-transparent h-auto p-0">
                <TabsTrigger value="contacts" className="font-inter text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none px-4 py-3" data-testid="tab-contacts">
                  Contacts
                </TabsTrigger>
                <TabsTrigger value="opportunites" className="font-inter text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none px-4 py-3" data-testid="tab-opportunites">
                  Opportunites
                </TabsTrigger>
                <TabsTrigger value="interactions" className="font-inter text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none px-4 py-3" data-testid="tab-interactions">
                  Interactions
                </TabsTrigger>
                <TabsTrigger value="emails" className="font-inter text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none px-4 py-3" data-testid="tab-emails">
                  Emails
                </TabsTrigger>
                <TabsTrigger value="notes" className="font-inter text-sm rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none px-4 py-3" data-testid="tab-notes">
                  Notes
                </TabsTrigger>
              </TabsList>
              <TabsContent value="contacts" className="p-6">
                <ContactsTab entrepriseId={id} />
              </TabsContent>
              <TabsContent value="opportunites" className="p-6">
                <OpportunitesTab entrepriseId={id} user={user} />
              </TabsContent>
              <TabsContent value="interactions" className="p-6">
                <InteractionsTab entrepriseId={id} user={user} />
              </TabsContent>
              <TabsContent value="emails" className="p-6">
                <EntrepriseEmailsBlock
                  entrepriseId={entreprise.id}
                  entrepriseNom={entreprise.nom}
                />
              </TabsContent>
              <TabsContent value="notes" className="p-6">
                <div data-testid="notes-section">
                  <Textarea
                    value={editData.notes || ''}
                    onChange={e => setEditData({...editData, notes: e.target.value})}
                    placeholder="Ajoutez des notes sur cette entreprise..."
                    rows={8}
                    className="font-inter text-sm mb-3"
                    data-testid="notes-textarea"
                  />
                  <Button
                    onClick={handleNoteSave}
                    className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter text-sm"
                    data-testid="save-notes-btn"
                  >
                    Enregistrer les notes
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== Contacts Tab ====================
const DECIDEUR_NIVEAUX = [
  { value: 'primaire', label: 'Primaire' }, { value: 'secondaire', label: 'Secondaire' },
  { value: 'influenceur', label: 'Influenceur' }, { value: 'skip', label: 'Skip' },
];
const ROLE_FLAGS = [
  { value: 'dirigeant', label: 'Dirigeant' }, { value: 'daf', label: 'DAF' },
  { value: 'drh', label: 'DRH' }, { value: 'achats', label: 'Achats' },
  { value: 'tech', label: 'Tech' }, { value: 'commercial', label: 'Commercial' },
  { value: 'autre', label: 'Autre' },
];
const DECIDEUR_COLORS = {
  primaire: 'bg-green-100 text-green-700', secondaire: 'bg-blue-100 text-blue-700',
  influenceur: 'bg-purple-100 text-purple-700', skip: 'bg-gray-100 text-gray-700',
};
const TYPE_MISSIONS = [
  { value: 'audit_drs', label: 'Audit DRS' }, { value: 'accompagnement', label: 'Accompagnement' },
  { value: 'pack', label: 'Pack' }, { value: 'one_shot', label: 'One Shot' },
  { value: 'personnalise', label: 'Personnalise' },
];
const STADES_OPP = [
  { value: 'qualification', label: 'Qualification' }, { value: 'diagnostic', label: 'Diagnostic' },
  { value: 'propale', label: 'Proposition' }, { value: 'negociation', label: 'Negociation' },
  { value: 'signe', label: 'Signe' }, { value: 'perdu', label: 'Perdu' },
];
const STADE_COLORS = {
  qualification: 'bg-blue-100 text-blue-700', diagnostic: 'bg-purple-100 text-purple-700',
  propale: 'bg-indigo-100 text-indigo-700', negociation: 'bg-orange-100 text-orange-700',
  signe: 'bg-green-100 text-green-700', perdu: 'bg-red-100 text-red-700',
};
const INTERACTION_TYPES = [
  { value: 'linkedin_message', label: 'LinkedIn' }, { value: 'email_cold', label: 'Email cold' },
  { value: 'email_suivi', label: 'Email suivi' }, { value: 'email_breakup', label: 'Email breakup' },
  { value: 'email_reengagement', label: 'Email reengagement' }, { value: 'appel', label: 'Appel' },
  { value: 'rdv', label: 'RDV' }, { value: 'propale_envoyee', label: 'Propale envoyee' },
  { value: 'autre', label: 'Autre' },
];
const INTERACTION_STATUTS = [
  { value: 'envoye', label: 'Envoye' }, { value: 'ouvert', label: 'Ouvert' },
  { value: 'repondu', label: 'Repondu' }, { value: 'rdv_pris', label: 'RDV pris' },
  { value: 'ignore', label: 'Ignore' }, { value: 'bounced', label: 'Bounced' },
];
const INT_STATUT_COLORS = {
  envoye: 'bg-blue-100 text-blue-700', ouvert: 'bg-yellow-100 text-yellow-700',
  repondu: 'bg-green-100 text-green-700', rdv_pris: 'bg-green-100 text-green-700',
  ignore: 'bg-gray-100 text-gray-700', bounced: 'bg-red-100 text-red-700',
};

function ContactsTab({ entrepriseId }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nom: '', prenom: '', titre: '', email: '', telephone: '', linkedin_url: '', decideur_niveau: 'secondaire', role_flag: 'autre', notes: '' });
  const [saving, setSaving] = useState(false);

  const fetch_ = useCallback(async () => {
    try {
      const { data } = await api.get(`/contacts?entreprise_id=${entrepriseId}&limit=100`);
      setContacts(data.data || []);
    } catch {} finally { setLoading(false); }
  }, [entrepriseId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleSave = async () => {
    if (!form.nom.trim()) { toast.error('Le nom est requis'); return; }
    setSaving(true);
    try {
      const payload = { ...form, entreprise_id: entrepriseId };
      Object.keys(payload).forEach(k => { if (!payload[k] && k !== 'decideur_niveau' && k !== 'role_flag' && k !== 'entreprise_id') delete payload[k]; });
      await api.post('/contacts', payload);
      toast.success('Contact cree');
      setShowModal(false);
      setForm({ nom: '', prenom: '', titre: '', email: '', telephone: '', linkedin_url: '', decideur_niveau: 'secondaire', role_flag: 'autre', notes: '' });
      fetch_();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-center py-4 text-brand-text-secondary font-inter text-sm">Chargement...</div>;

  return (
    <div data-testid="contacts-tab">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-brand-text-secondary font-inter">{contacts.length} contact{contacts.length > 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => setShowModal(true)} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter text-xs" data-testid="add-contact-tab-btn">
          <Plus className="w-3 h-3 mr-1" /> Ajouter contact
        </Button>
      </div>
      {contacts.length === 0 ? (
        <p className="text-center py-6 text-brand-text-secondary font-inter text-sm">Aucun contact</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-brand-bg">
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Nom</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden sm:table-cell">Titre</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Decideur</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden sm:table-cell">Email</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden md:table-cell">Telephone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.map(c => (
              <TableRow key={c.id} data-testid={`detail-contact-${c.id}`}>
                <TableCell className="font-inter text-sm font-medium">{[c.prenom, c.nom].filter(Boolean).join(' ')}</TableCell>
                <TableCell className="font-inter text-sm text-brand-text-secondary hidden sm:table-cell">{c.titre || '-'}</TableCell>
                <TableCell>
                  <Badge className={`${DECIDEUR_COLORS[c.decideur_niveau] || 'bg-gray-100 text-gray-700'} text-xs font-inter border-0`}>
                    {DECIDEUR_NIVEAUX.find(d => d.value === c.decideur_niveau)?.label || c.decideur_niveau}
                  </Badge>
                </TableCell>
                <TableCell className="font-inter text-sm hidden sm:table-cell">{c.email || '-'}</TableCell>
                <TableCell className="font-inter text-sm hidden md:table-cell">{c.telephone || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-manrope">Nouveau contact</DialogTitle>
            <DialogDescription className="font-inter text-sm">Ajouter un contact a cette entreprise.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="font-inter text-xs">Prenom</Label>
                <Input value={form.prenom} onChange={e => setForm({...form, prenom: e.target.value})} className="font-inter" data-testid="detail-contact-prenom" /></div>
              <div className="space-y-1"><Label className="font-inter text-xs">Nom *</Label>
                <Input value={form.nom} onChange={e => setForm({...form, nom: e.target.value})} className="font-inter" data-testid="detail-contact-nom" /></div>
            </div>
            <div className="space-y-1"><Label className="font-inter text-xs">Titre</Label>
              <Input value={form.titre} onChange={e => setForm({...form, titre: e.target.value})} placeholder="President..." className="font-inter" data-testid="detail-contact-titre" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="font-inter text-xs">Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="font-inter" data-testid="detail-contact-email" /></div>
              <div className="space-y-1"><Label className="font-inter text-xs">Telephone</Label>
                <Input value={form.telephone} onChange={e => setForm({...form, telephone: e.target.value})} className="font-inter" data-testid="detail-contact-tel" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="font-inter text-xs">Niveau decideur</Label>
                <Select value={form.decideur_niveau} onValueChange={v => setForm({...form, decideur_niveau: v})}>
                  <SelectTrigger data-testid="detail-contact-decideur"><SelectValue /></SelectTrigger>
                  <SelectContent>{DECIDEUR_NIVEAUX.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="font-inter text-xs">Role</Label>
                <Select value={form.role_flag} onValueChange={v => setForm({...form, role_flag: v})}>
                  <SelectTrigger data-testid="detail-contact-role"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLE_FLAGS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} className="font-inter border-brand-border text-sm">Annuler</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter text-sm" data-testid="detail-contact-save">
              {saving ? 'Creation...' : 'Creer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== Opportunites Tab ====================
function OpportunitesTab({ entrepriseId, user }) {
  const [opps, setOpps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type_mission: 'audit_drs', intitule: '', montant_estime: '', probabilite: '50', date_signature_prevue: '', stade: 'qualification', ca_reel_signe: '', motif_perdu: '' });
  const [saving, setSaving] = useState(false);

  const fetch_ = useCallback(async () => {
    try {
      const { data } = await api.get(`/opportunites?entreprise_id=${entrepriseId}&limit=100`);
      setOpps(data.data || []);
    } catch {} finally { setLoading(false); }
  }, [entrepriseId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleSave = async () => {
    if (!form.intitule.trim() || !form.montant_estime) { toast.error('Intitule et montant requis'); return; }
    setSaving(true);
    try {
      const payload = {
        entreprise_id: entrepriseId, ...form,
        montant_estime: parseFloat(form.montant_estime),
        probabilite: parseInt(form.probabilite),
      };
      if (!payload.date_signature_prevue) delete payload.date_signature_prevue;
      if (!payload.ca_reel_signe) delete payload.ca_reel_signe;
      else payload.ca_reel_signe = parseFloat(payload.ca_reel_signe);
      if (!payload.motif_perdu) delete payload.motif_perdu;
      await api.post('/opportunites', payload);
      toast.success('Opportunite creee');
      setShowModal(false);
      setForm({ type_mission: 'audit_drs', intitule: '', montant_estime: '', probabilite: '50', date_signature_prevue: '', stade: 'qualification', ca_reel_signe: '', motif_perdu: '' });
      fetch_();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-center py-4 text-brand-text-secondary font-inter text-sm">Chargement...</div>;

  return (
    <div data-testid="opportunites-tab">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-brand-text-secondary font-inter">{opps.length} opportunite{opps.length > 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => setShowModal(true)} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter text-xs" data-testid="add-opp-tab-btn">
          <Plus className="w-3 h-3 mr-1" /> Creer opportunite
        </Button>
      </div>
      {opps.length === 0 ? (
        <p className="text-center py-6 text-brand-text-secondary font-inter text-sm">Aucune opportunite</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-brand-bg">
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Intitule</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden sm:table-cell">Type</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Mont. pond.</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase">Stade</TableHead>
              <TableHead className="font-manrope font-semibold text-brand-text-primary text-xs uppercase hidden sm:table-cell">Date sign.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {opps.map(o => (
              <TableRow key={o.id} data-testid={`detail-opp-${o.id}`}>
                <TableCell className="font-inter text-sm font-medium">{o.intitule}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge className="bg-brand-bg text-brand-text-secondary border-brand-border text-xs font-inter">
                    {TYPE_MISSIONS.find(t => t.value === o.type_mission)?.label || o.type_mission}
                  </Badge>
                </TableCell>
                <TableCell className="font-inter text-sm font-bold">{formatCA(o.montant_pondere)}</TableCell>
                <TableCell>
                  <Badge className={`${STADE_COLORS[o.stade] || 'bg-gray-100 text-gray-700'} text-xs font-inter border-0`}>
                    {STADES_OPP.find(s => s.value === o.stade)?.label || o.stade}
                  </Badge>
                </TableCell>
                <TableCell className="font-inter text-sm hidden sm:table-cell">{o.date_signature_prevue || '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-manrope">Nouvelle opportunite</DialogTitle>
            <DialogDescription className="font-inter text-sm">Creer une opportunite pour cette entreprise.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="font-inter text-xs">Intitule *</Label>
              <Input value={form.intitule} onChange={e => setForm({...form, intitule: e.target.value})} placeholder="Refonte site + audit SEO" className="font-inter" data-testid="detail-opp-intitule" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="font-inter text-xs">Type mission</Label>
                <Select value={form.type_mission} onValueChange={v => setForm({...form, type_mission: v})}>
                  <SelectTrigger data-testid="detail-opp-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_MISSIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="font-inter text-xs">Stade</Label>
                <Select value={form.stade} onValueChange={v => setForm({...form, stade: v})}>
                  <SelectTrigger data-testid="detail-opp-stade"><SelectValue /></SelectTrigger>
                  <SelectContent>{STADES_OPP.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="font-inter text-xs">Montant estime (EUR) *</Label>
                <Input type="number" value={form.montant_estime} onChange={e => setForm({...form, montant_estime: e.target.value})} className="font-inter" data-testid="detail-opp-montant" /></div>
              <div className="space-y-1"><Label className="font-inter text-xs">Probabilite (%) *</Label>
                <Input type="number" min={0} max={100} value={form.probabilite} onChange={e => setForm({...form, probabilite: e.target.value})} className="font-inter" data-testid="detail-opp-prob" /></div>
            </div>
            <div className="space-y-1"><Label className="font-inter text-xs">Date signature prevue</Label>
              <Input type="date" value={form.date_signature_prevue} onChange={e => setForm({...form, date_signature_prevue: e.target.value})} className="font-inter" data-testid="detail-opp-date" /></div>
            {form.stade === 'signe' && (
              <div className="space-y-1"><Label className="font-inter text-xs">CA reel signe (EUR)</Label>
                <Input type="number" value={form.ca_reel_signe} onChange={e => setForm({...form, ca_reel_signe: e.target.value})} className="font-inter" data-testid="detail-opp-ca-reel" /></div>
            )}
            {form.stade === 'perdu' && (
              <div className="space-y-1"><Label className="font-inter text-xs">Motif perdu</Label>
                <Textarea value={form.motif_perdu} onChange={e => setForm({...form, motif_perdu: e.target.value})} rows={2} className="font-inter" data-testid="detail-opp-motif" /></div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} className="font-inter border-brand-border text-sm">Annuler</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter text-sm" data-testid="detail-opp-save">
              {saving ? 'Creation...' : 'Creer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== Interactions Tab ====================
function InteractionsTab({ entrepriseId, user }) {
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: 'email_cold', date: new Date().toISOString().split('T')[0], sujet: '', contenu: '', statut: 'envoye', notes: '' });
  const [saving, setSaving] = useState(false);

  const fetch_ = useCallback(async () => {
    try {
      const { data } = await api.get(`/interactions?entreprise_id=${entrepriseId}&limit=100`);
      setInteractions(data.data || []);
    } catch {} finally { setLoading(false); }
  }, [entrepriseId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleSave = async () => {
    if (!form.type || !form.date) { toast.error('Type et date sont requis'); return; }
    setSaving(true);
    try {
      const payload = { entreprise_id: entrepriseId, ...form };
      if (!payload.sujet) delete payload.sujet;
      if (!payload.contenu) delete payload.contenu;
      if (!payload.notes) delete payload.notes;
      await api.post('/interactions', payload);
      toast.success('Interaction creee');
      setShowModal(false);
      setForm({ type: 'email_cold', date: new Date().toISOString().split('T')[0], sujet: '', contenu: '', statut: 'envoye', notes: '' });
      fetch_();
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="text-center py-4 text-brand-text-secondary font-inter text-sm">Chargement...</div>;

  return (
    <div data-testid="interactions-tab">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-brand-text-secondary font-inter">{interactions.length} interaction{interactions.length > 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => setShowModal(true)} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter text-xs" data-testid="add-interaction-tab-btn">
          <Plus className="w-3 h-3 mr-1" /> Ajouter interaction
        </Button>
      </div>
      {interactions.length === 0 ? (
        <p className="text-center py-6 text-brand-text-secondary font-inter text-sm">Aucune interaction</p>
      ) : (
        <div className="space-y-3">
          {interactions.map(i => (
            <div key={i.id} className="flex items-start gap-3 p-3 rounded-lg border border-brand-border bg-brand-bg/50" data-testid={`detail-interaction-${i.id}`}>
              <div className="w-8 h-8 rounded-full bg-white border border-brand-border flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-brand-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`${INT_STATUT_COLORS[i.statut] || 'bg-gray-100 text-gray-700'} text-xs font-inter border-0`}>
                    {INTERACTION_STATUTS.find(s => s.value === i.statut)?.label || i.statut}
                  </Badge>
                  <Badge className="bg-white text-brand-text-secondary border-brand-border text-xs font-inter">
                    {INTERACTION_TYPES.find(t => t.value === i.type)?.label || i.type}
                  </Badge>
                  <span className="text-xs text-brand-text-secondary font-inter">{new Date(i.date).toLocaleDateString('fr-FR')}</span>
                  <span className="text-xs text-brand-text-secondary font-inter capitalize">- {i.auteur}</span>
                </div>
                {i.sujet && <p className="text-sm font-inter font-medium text-brand-text-primary mt-1">{i.sujet}</p>}
                {i.contenu && <p className="text-xs text-brand-text-secondary font-inter mt-1 line-clamp-2">{i.contenu}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-manrope">Nouvelle interaction</DialogTitle>
            <DialogDescription className="font-inter text-sm">Enregistrer une interaction avec cette entreprise.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="font-inter text-xs">Type *</Label>
                <Select value={form.type} onValueChange={v => setForm({...form, type: v})}>
                  <SelectTrigger data-testid="detail-int-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{INTERACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1"><Label className="font-inter text-xs">Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="font-inter" data-testid="detail-int-date" /></div>
            </div>
            <div className="space-y-1"><Label className="font-inter text-xs">Sujet</Label>
              <Input value={form.sujet} onChange={e => setForm({...form, sujet: e.target.value})} placeholder="Objet de l'interaction" className="font-inter" data-testid="detail-int-sujet" /></div>
            <div className="space-y-1"><Label className="font-inter text-xs">Contenu</Label>
              <Textarea value={form.contenu} onChange={e => setForm({...form, contenu: e.target.value})} rows={3} className="font-inter" data-testid="detail-int-contenu" /></div>
            <div className="space-y-1"><Label className="font-inter text-xs">Statut</Label>
              <Select value={form.statut} onValueChange={v => setForm({...form, statut: v})}>
                <SelectTrigger data-testid="detail-int-statut"><SelectValue /></SelectTrigger>
                <SelectContent>{INTERACTION_STATUTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1"><Label className="font-inter text-xs">Notes</Label>
              <Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="font-inter" data-testid="detail-int-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} className="font-inter border-brand-border text-sm">Annuler</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter text-sm" data-testid="detail-int-save">
              {saving ? 'Creation...' : 'Creer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, editing, value, onChange, display, mono, type, link, maxLength }) {
  if (editing) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-inter text-brand-text-secondary">{label}</p>
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          type={type || 'text'}
          className={`text-sm ${mono ? 'font-mono' : 'font-inter'}`}
          maxLength={maxLength}
          data-testid={`edit-${label.toLowerCase().replace(/\s/g, '-')}`}
        />
      </div>
    );
  }
  return <FieldDisplay label={label} value={display} mono={mono} link={link} />;
}

function FieldDisplay({ label, value, mono, link, capitalize }) {
  const displayVal = value || '-';
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-inter text-brand-text-secondary">{label}</p>
      {link && value ? (
        <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
          className={`text-sm text-brand-primary hover:underline ${mono ? 'font-mono' : 'font-inter'}`}>
          {displayVal}
        </a>
      ) : (
        <p className={`text-sm text-brand-text-primary ${mono ? 'font-mono' : 'font-inter'} ${capitalize ? 'capitalize' : ''}`}>
          {displayVal}
        </p>
      )}
    </div>
  );
}

// ==================== Outreach Card Component ====================
const SOURCE_LABELS = {
  brevo: { label: 'Brevo (cold email)', color: 'bg-blue-100 text-blue-700' },
  cold_email: { label: 'Cold email', color: 'bg-blue-100 text-blue-700' },
  relance_linkedin: { label: 'Relance LinkedIn', color: 'bg-purple-100 text-purple-700' },
  breakup: { label: 'Email breakup', color: 'bg-orange-100 text-orange-700' },
  reengagement: { label: 'Re-engagement', color: 'bg-green-100 text-green-700' },
};

const PRIORITE_COLORS = {
  HAUTE:   'bg-red-100 text-red-700 border-red-300',
  MOYENNE: 'bg-amber-100 text-amber-700 border-amber-300',
  BASSE:   'bg-slate-100 text-slate-600 border-slate-300',
};

function OutreachCard({ entreprise, onMarkSent }) {
  const outreach = entreprise.email_outreach;
  if (!outreach || !outreach.objet) return null;

  const sourceMeta = SOURCE_LABELS[outreach.source] || { label: outreach.source, color: 'bg-slate-100 text-slate-600' };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copié`),
      () => toast.error('Erreur copie')
    );
  };

  const copyFullEmail = () => {
    const fullText = `À : ${outreach.email_target || ''}\nObjet : ${outreach.objet}\n\n${outreach.corps}`;
    copyToClipboard(fullText, 'Email complet');
  };

  const markAsSent = async () => {
    if (!window.confirm(`Marquer ${entreprise.nom} comme contacté ?\n\nUne interaction sera créée avec l'objet "${outreach.objet}".`)) return;
    try {
      await api.post('/outreach/mark-sent', {
        entreprise_ids: [entreprise.id],
        note: `Email "${outreach.objet}" envoyé via ${sourceMeta.label}`,
      });
      toast.success('Marqué comme contacté');
      if (onMarkSent) onMarkSent();
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg shadow-sm mb-4 overflow-hidden">
      <div className="p-5 border-b border-blue-200 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4 text-brand-primary" />
            <h3 className="font-manrope font-bold text-base text-brand-text-primary">Email outreach prêt à envoyer</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`${sourceMeta.color} border-0 text-xs font-inter`}>{sourceMeta.label}</Badge>
            {entreprise.priorite && (
              <Badge className={`${PRIORITE_COLORS[entreprise.priorite]} border text-xs font-inter font-semibold`}>
                Priorité {entreprise.priorite}
              </Badge>
            )}
            {entreprise.statut_relance && (
              <Badge className="bg-white text-brand-text-secondary border border-brand-border text-xs font-inter">
                {entreprise.statut_relance}
              </Badge>
            )}
            {entreprise.canal_premier_contact && (
              <span className="text-xs text-brand-text-secondary font-inter">
                · {entreprise.canal_premier_contact}
              </span>
            )}
          </div>
          {entreprise.notes_specifiques && (
            <p className="text-xs text-brand-text-secondary font-inter italic mt-2">
              📝 {entreprise.notes_specifiques}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {entreprise.statut_pipeline === 'froid' && (
            <Button
              size="sm"
              onClick={markAsSent}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white font-inter text-xs"
              data-testid="outreach-mark-sent"
            >
              Marquer envoyé
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={copyFullEmail}
            className="font-inter text-xs border-brand-border bg-white"
            data-testid="outreach-copy-email"
          >
            Copier email
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-3">
        {outreach.email_target && (
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-inter text-brand-text-secondary uppercase shrink-0">À</span>
            <code className="text-xs bg-white px-2 py-1 rounded border border-blue-200 font-mono">
              {outreach.email_target}
            </code>
            <button
              onClick={() => copyToClipboard(outreach.email_target, 'Email')}
              className="text-xs text-brand-primary hover:underline font-inter"
            >
              Copier
            </button>
          </div>
        )}

        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs font-inter text-brand-text-secondary uppercase">Objet</span>
            <button
              onClick={() => copyToClipboard(outreach.objet, 'Objet')}
              className="text-xs text-brand-primary hover:underline font-inter"
            >
              Copier
            </button>
          </div>
          <p className="text-sm font-inter font-medium text-brand-text-primary bg-white border border-blue-200 rounded px-3 py-2">
            {outreach.objet}
          </p>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs font-inter text-brand-text-secondary uppercase">Corps</span>
            <button
              onClick={() => copyToClipboard(outreach.corps, 'Corps')}
              className="text-xs text-brand-primary hover:underline font-inter"
            >
              Copier
            </button>
          </div>
          <pre className="text-xs font-inter whitespace-pre-wrap text-brand-text-primary bg-white border border-blue-200 rounded px-3 py-2 max-h-64 overflow-y-auto leading-relaxed">
            {outreach.corps}
          </pre>
        </div>
      </div>
    </div>
  );
}
