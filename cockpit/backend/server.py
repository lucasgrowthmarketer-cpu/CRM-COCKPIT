from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Query, File, UploadFile
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from pydantic import BaseModel, Field
import bcrypt
import jwt
import csv
import io
import openpyxl
import shutil

# Upload dir for imports
UPLOAD_DIR = Path("/tmp/industrial_imports")
UPLOAD_DIR.mkdir(exist_ok=True)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT config
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET env variable is required. Set it in .env")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24 * 7  # 7 days per v2 spec

# Create app
app = FastAPI(docs_url="/api/docs", redoc_url="/api/redoc")
api_router = APIRouter(prefix="/api")

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ==================== Password Hashing ====================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ==================== JWT ====================
def create_token(user_id: str, email: str, nom: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "nom": nom,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


# ==================== Auth Dependency ====================
async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Non authentifie")
    token = auth_header[7:]
    try:
        payload = decode_token(token)
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utilisateur non trouve")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expire")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")


# ==================== Score ICP Calculation ====================
def calculate_score_icp(data: dict) -> int:
    score = 0
    if data.get("naf_code") in ["28.41Z", "28.49Z", "46.62Z"]:
        score += 40
    ca = data.get("ca")
    if ca is not None and 2_000_000 <= ca <= 50_000_000:
        score += 20
    effectif = data.get("effectif")
    if effectif is not None and 10 <= effectif <= 250:
        score += 15
    if data.get("region") in ["Auvergne-Rhone-Alpes", "Hauts-de-France", "Grand Est", "Bourgogne-Franche-Comte"]:
        score += 10
    signaux = data.get("signaux_digitaux") or []
    authority = data.get("authority_score")
    if (authority is not None and authority < 20) or "site_obsolete" in signaux or "pas_https" in signaux:
        score += 15
    return min(score, 100)


# ==================== Enum types (Literal) ====================
SourceT = Literal["import_excel", "pappers", "manuel", "linkedin"]
StatutPipelineT = Literal[
    "froid", "qualifie", "contacte", "en_conversation",
    "diagnostic_envoye", "propale", "signe", "perdu"
]
ProprietaireT = Literal["lucas", "ayoub", "david"]
DecideurNiveauT = Literal["primaire", "secondaire", "influenceur", "skip"]
RoleFlagT = Literal["dirigeant", "daf", "drh", "achats", "tech", "commercial", "autre"]
TypeMissionT = Literal["audit_drs", "accompagnement", "pack", "one_shot", "personnalise"]
StadeT = Literal["qualification", "diagnostic", "propale", "negociation", "signe", "perdu"]
TypeContratT = Literal["one_shot", "recurrent"]
InteractionTypeT = Literal[
    "linkedin_message", "email_cold", "email_suivi", "email_breakup",
    "email_reengagement", "appel", "rdv", "propale_envoyee", "autre"
]
InteractionStatutT = Literal["envoye", "ouvert", "repondu", "rdv_pris", "ignore", "bounced"]
TodoCategorieT = Literal["prospection", "audit_production", "admin", "dev_tech", "content_seo", "autre"]
TodoJourT = Literal["lundi", "mardi", "mercredi", "jeudi", "vendredi"]
TodoAssigneT = Literal["lucas", "ayoub"]
TodoStatutT = Literal["a_faire", "en_cours", "termine"]


# ==================== Pydantic Models ====================
class LoginRequest(BaseModel):
    email: str
    password: str


class EntrepriseCreate(BaseModel):
    nom: str = Field(min_length=1)
    siret: Optional[str] = None
    naf_code: Optional[str] = None
    secteur_id: Optional[str] = None
    ca: Optional[float] = Field(default=None, ge=0)
    effectif: Optional[int] = Field(default=None, ge=0)
    ville: Optional[str] = None
    region: Optional[str] = None
    adresse: Optional[str] = None
    site_web: Optional[str] = None
    authority_score: Optional[int] = Field(default=None, ge=0, le=100)
    trafic_organique_mensuel: Optional[int] = Field(default=None, ge=0)
    mots_cles_ranked: Optional[int] = Field(default=None, ge=0)
    date_dernier_audit: Optional[str] = None
    signaux_digitaux: Optional[List[str]] = []
    source: Optional[SourceT] = "manuel"
    statut_pipeline: Optional[StatutPipelineT] = "froid"
    tags: Optional[List[str]] = []
    notes: Optional[str] = None
    proprietaire: Optional[ProprietaireT] = None


class EntrepriseUpdate(BaseModel):
    nom: Optional[str] = Field(default=None, min_length=1)
    siret: Optional[str] = None
    naf_code: Optional[str] = None
    secteur_id: Optional[str] = None
    ca: Optional[float] = Field(default=None, ge=0)
    effectif: Optional[int] = Field(default=None, ge=0)
    ville: Optional[str] = None
    region: Optional[str] = None
    adresse: Optional[str] = None
    site_web: Optional[str] = None
    authority_score: Optional[int] = Field(default=None, ge=0, le=100)
    trafic_organique_mensuel: Optional[int] = Field(default=None, ge=0)
    mots_cles_ranked: Optional[int] = Field(default=None, ge=0)
    date_dernier_audit: Optional[str] = None
    signaux_digitaux: Optional[List[str]] = None
    source: Optional[SourceT] = None
    statut_pipeline: Optional[StatutPipelineT] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    proprietaire: Optional[ProprietaireT] = None


class SecteurCreate(BaseModel):
    naf_code: str
    libelle: str
    position: Literal["coeur", "adjacent"]
    description: Optional[str] = None
    template_email_id: Optional[str] = None


class SecteurUpdate(BaseModel):
    naf_code: Optional[str] = None
    libelle: Optional[str] = None
    position: Optional[Literal["coeur", "adjacent"]] = None
    description: Optional[str] = None
    template_email_id: Optional[str] = None


class ContactCreate(BaseModel):
    entreprise_id: str
    nom: str = Field(min_length=1)
    prenom: Optional[str] = None
    titre: Optional[str] = None
    email: Optional[str] = None
    linkedin_url: Optional[str] = None
    telephone: Optional[str] = None
    decideur_niveau: Optional[DecideurNiveauT] = "secondaire"
    role_flag: Optional[RoleFlagT] = "autre"
    notes: Optional[str] = None


class ContactUpdate(BaseModel):
    nom: Optional[str] = Field(default=None, min_length=1)
    prenom: Optional[str] = None
    titre: Optional[str] = None
    email: Optional[str] = None
    linkedin_url: Optional[str] = None
    telephone: Optional[str] = None
    decideur_niveau: Optional[DecideurNiveauT] = None
    role_flag: Optional[RoleFlagT] = None
    notes: Optional[str] = None


class OpportuniteCreate(BaseModel):
    entreprise_id: str
    contact_principal_id: Optional[str] = None
    type_mission: TypeMissionT
    intitule: str = Field(min_length=1)
    montant_estime: float = Field(ge=0)
    probabilite: int = Field(ge=0, le=100)
    date_signature_prevue: Optional[str] = None
    stade: Optional[StadeT] = "qualification"
    ca_reel_signe: Optional[float] = Field(default=None, ge=0)
    proprietaire: Optional[ProprietaireT] = None
    motif_perdu: Optional[str] = None
    # Type de contrat (pour objectif MRR): one_shot ou recurrent
    type_contrat: Optional[TypeContratT] = "one_shot"
    # MRR en euros (rempli si type_contrat = recurrent)
    mrr: Optional[float] = Field(default=None, ge=0)
    # Date de debut du contrat (ISO date, YYYY-MM-DD)
    date_debut_contrat: Optional[str] = None
    # Date de fin du contrat (ISO date, null = ouvert)
    date_fin_contrat: Optional[str] = None


class OpportuniteUpdate(BaseModel):
    contact_principal_id: Optional[str] = None
    type_mission: Optional[TypeMissionT] = None
    intitule: Optional[str] = Field(default=None, min_length=1)
    montant_estime: Optional[float] = Field(default=None, ge=0)
    probabilite: Optional[int] = Field(default=None, ge=0, le=100)
    date_signature_prevue: Optional[str] = None
    stade: Optional[StadeT] = None
    ca_reel_signe: Optional[float] = Field(default=None, ge=0)
    proprietaire: Optional[ProprietaireT] = None
    motif_perdu: Optional[str] = None
    type_contrat: Optional[TypeContratT] = None
    mrr: Optional[float] = Field(default=None, ge=0)
    date_debut_contrat: Optional[str] = None
    date_fin_contrat: Optional[str] = None


class InteractionCreate(BaseModel):
    entreprise_id: str
    contact_id: Optional[str] = None
    type: InteractionTypeT
    date: str
    canal: Optional[str] = None
    template_utilise_id: Optional[str] = None
    sujet: Optional[str] = None
    contenu: Optional[str] = None
    statut: Optional[InteractionStatutT] = "envoye"
    auteur: Optional[ProprietaireT] = None
    notes: Optional[str] = None


class InteractionUpdate(BaseModel):
    contact_id: Optional[str] = None
    type: Optional[InteractionTypeT] = None
    date: Optional[str] = None
    canal: Optional[str] = None
    template_utilise_id: Optional[str] = None
    sujet: Optional[str] = None
    contenu: Optional[str] = None
    statut: Optional[InteractionStatutT] = None
    auteur: Optional[ProprietaireT] = None
    notes: Optional[str] = None


# ==================== New: Objectifs (Lucas only for V1) ====================
class ObjectifCreate(BaseModel):
    # Objectif mensuel cible (le point d'arrivee)
    objectif_mensuel_cible: float = Field(gt=0)
    # Date cible (mois ou l'objectif mensuel_cible doit etre atteint)
    date_cible: str  # ISO YYYY-MM-DD
    # Date de debut (pour calcul de la trajectoire)
    date_debut: str  # ISO YYYY-MM-DD
    # Objectif du mois courant (optionnel, sinon calcule lineaire)
    objectif_mensuel_courant: Optional[float] = Field(default=None, ge=0)
    libelle: Optional[str] = None
    actif: bool = True


class ObjectifUpdate(BaseModel):
    objectif_mensuel_cible: Optional[float] = Field(default=None, gt=0)
    date_cible: Optional[str] = None
    date_debut: Optional[str] = None
    objectif_mensuel_courant: Optional[float] = Field(default=None, ge=0)
    libelle: Optional[str] = None
    actif: Optional[bool] = None


# ==================== New: Todos (kanban weekly, Lucas + Ayoub) ====================
class TodoCreate(BaseModel):
    titre: str = Field(min_length=1)
    description: Optional[str] = None
    categorie: TodoCategorieT
    jour: TodoJourT
    assigne_a: TodoAssigneT
    statut: Optional[TodoStatutT] = "a_faire"
    # Liens optionnels vers le pipeline
    entreprise_id: Optional[str] = None
    opportunite_id: Optional[str] = None
    ordre: Optional[int] = 0


class TodoUpdate(BaseModel):
    titre: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    categorie: Optional[TodoCategorieT] = None
    jour: Optional[TodoJourT] = None
    assigne_a: Optional[TodoAssigneT] = None
    statut: Optional[TodoStatutT] = None
    entreprise_id: Optional[str] = None
    opportunite_id: Optional[str] = None
    ordre: Optional[int] = None


class TodoBulkImport(BaseModel):
    """Import de todos en masse (texte colle, parse naivement)."""
    # Texte brut (chaque ligne = 1 todo si elle commence par -, *, ou 1.)
    texte: str
    # Valeurs par defaut appliquees a chaque todo
    categorie: TodoCategorieT = "autre"
    jour: TodoJourT = "lundi"
    assigne_a: TodoAssigneT


# ==================== Error Handler ====================
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": str(exc.detail), "detail": str(exc.detail), "code": f"ERR_{exc.status_code}"}
    )


# ==================== Auth Routes ====================
@api_router.post("/auth/login")
async def login(req: LoginRequest):
    user = await db.users.find_one({"email": req.email.lower().strip()}, {"_id": 0})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    if not user.get("actif", True):
        raise HTTPException(status_code=403, detail="Compte desactive")
    token = create_token(user["id"], user["email"], user["nom"], user["role"])
    user_data = {k: v for k, v in user.items() if k != "password_hash"}
    return {"token": token, "user": user_data}


@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {"user": user}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@api_router.put("/auth/change-password")
async def change_password(data: ChangePasswordRequest, user=Depends(get_current_user)):
    full_user = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    if not full_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouve")
    if not verify_password(data.current_password, full_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=422, detail="Le nouveau mot de passe doit contenir au moins 8 caracteres")
    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": new_hash, "must_change_password": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Mot de passe modifie avec succes"}


# ==================== Entreprises Routes ====================
@api_router.post("/entreprises")
async def create_entreprise(data: EntrepriseCreate, user=Depends(get_current_user)):
    if data.siret and (len(data.siret) != 14 or not data.siret.isdigit()):
        raise HTTPException(status_code=422, detail="Le SIRET doit contenir exactement 14 chiffres")
    if data.naf_code and not re.match(r'^\d{2}\.\d{2}[A-Z]$', data.naf_code):
        raise HTTPException(status_code=422, detail="Le code NAF doit etre au format XX.XXA (ex: 28.41Z)")
    if data.ca is not None and data.ca < 0:
        raise HTTPException(status_code=422, detail="Le chiffre d'affaires doit etre un nombre positif")
    if data.effectif is not None and data.effectif < 0:
        raise HTTPException(status_code=422, detail="L'effectif doit etre un nombre positif")
    if data.site_web and not re.match(r'^https?://', data.site_web):
        raise HTTPException(status_code=422, detail="L'URL du site web doit commencer par http:// ou https://")
    if data.authority_score is not None and (data.authority_score < 0 or data.authority_score > 100):
        raise HTTPException(status_code=422, detail="L'authority score doit etre entre 0 et 100")
    if data.siret:
        existing = await db.entreprises.find_one({"siret": data.siret}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=409, detail="Une entreprise avec ce SIRET existe deja")

    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["proprietaire"] = doc.get("proprietaire") or user["nom"].split()[0].lower()
    doc["score_icp"] = calculate_score_icp(doc)
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.entreprises.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/entreprises")
async def list_entreprises(
    search: str = "",
    secteur_ids: str = "",
    regions: str = "",
    statuts: str = "",
    proprietaire: str = "",
    score_icp_min: int = 0,
    signaux: str = "",
    tags: str = "",
    include_archived: bool = False,
    archived_only: bool = False,
    page: int = 1,
    limit: int = 20,
    user=Depends(get_current_user)
):
    query = {}
    # Archive filter: by default, hide archived
    if archived_only:
        query["archived_at"] = {"$exists": True}
    elif not include_archived:
        query["archived_at"] = {"$exists": False}
    if search:
        rgx = {"$regex": search, "$options": "i"}
        query["$or"] = [{"nom": rgx}, {"site_web": rgx}, {"ville": rgx}, {"siret": rgx}]
    if secteur_ids:
        query["secteur_id"] = {"$in": [s for s in secteur_ids.split(",") if s]}
    if regions:
        query["region"] = {"$in": [r for r in regions.split(",") if r]}
    if statuts:
        query["statut_pipeline"] = {"$in": [s for s in statuts.split(",") if s]}
    if proprietaire:
        query["proprietaire"] = proprietaire
    if score_icp_min > 0:
        query["score_icp"] = {"$gte": score_icp_min}
    if signaux:
        query["signaux_digitaux"] = {"$in": [s for s in signaux.split(",") if s]}
    if tags:
        query["tags"] = {"$in": [t for t in tags.split(",") if t]}

    total = await db.entreprises.count_documents(query)
    cursor = db.entreprises.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit)
    items = await cursor.to_list(limit)

    # Lookup secteur names
    sect_ids = list(set(e.get("secteur_id") for e in items if e.get("secteur_id")))
    if sect_ids:
        sects = await db.secteurs.find({"id": {"$in": sect_ids}}, {"_id": 0}).to_list(100)
        smap = {s["id"]: s for s in sects}
        for item in items:
            sid = item.get("secteur_id")
            if sid and sid in smap:
                item["secteur_libelle"] = smap[sid].get("libelle", "")
                item["secteur_naf"] = smap[sid].get("naf_code", "")

    # Lookup last interaction dates
    if items:
        ent_ids_for_int = [e["id"] for e in items]
        pipeline = [
            {"$match": {"entreprise_id": {"$in": ent_ids_for_int}}},
            {"$sort": {"date": -1}},
            {"$group": {"_id": "$entreprise_id", "last_date": {"$first": "$date"}}}
        ]
        last_ints = await db.interactions.aggregate(pipeline).to_list(100)
        int_map = {li["_id"]: li["last_date"] for li in last_ints}
        for item in items:
            item["date_derniere_interaction"] = int_map.get(item["id"])

    return {"data": items, "total": total, "page": page, "limit": limit}


@api_router.get("/entreprises/{entreprise_id}")
async def get_entreprise(entreprise_id: str, user=Depends(get_current_user)):
    doc = await db.entreprises.find_one({"id": entreprise_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Entreprise non trouvee")
    if doc.get("secteur_id"):
        secteur = await db.secteurs.find_one({"id": doc["secteur_id"]}, {"_id": 0})
        doc["secteur"] = secteur
    return doc


@api_router.put("/entreprises/{entreprise_id}")
async def update_entreprise(entreprise_id: str, data: EntrepriseUpdate, user=Depends(get_current_user)):
    existing = await db.entreprises.find_one({"id": entreprise_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Entreprise non trouvee")

    update_data = data.model_dump(exclude_unset=True)

    if "siret" in update_data and update_data["siret"]:
        s = update_data["siret"]
        if len(s) != 14 or not s.isdigit():
            raise HTTPException(status_code=422, detail="Le SIRET doit contenir exactement 14 chiffres")
        dup = await db.entreprises.find_one({"siret": s, "id": {"$ne": entreprise_id}}, {"_id": 0})
        if dup:
            raise HTTPException(status_code=409, detail="Une entreprise avec ce SIRET existe deja")

    if "naf_code" in update_data and update_data["naf_code"]:
        if not re.match(r'^\d{2}\.\d{2}[A-Z]$', update_data["naf_code"]):
            raise HTTPException(status_code=422, detail="Le code NAF doit etre au format XX.XXA (ex: 28.41Z)")

    if "site_web" in update_data and update_data["site_web"] and not re.match(r'^https?://', update_data["site_web"]):
        raise HTTPException(status_code=422, detail="L'URL du site web doit commencer par http:// ou https://")

    if "ca" in update_data and update_data["ca"] is not None and update_data["ca"] < 0:
        raise HTTPException(status_code=422, detail="Le chiffre d'affaires doit etre positif")
    if "effectif" in update_data and update_data["effectif"] is not None and update_data["effectif"] < 0:
        raise HTTPException(status_code=422, detail="L'effectif doit etre positif")

    merged = {**existing, **update_data}
    merged["score_icp"] = calculate_score_icp(merged)
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.entreprises.update_one({"id": entreprise_id}, {"$set": merged})
    merged.pop("_id", None)
    return merged


@api_router.delete("/entreprises/{entreprise_id}")
async def delete_entreprise(entreprise_id: str, user=Depends(get_current_user)):
    result = await db.entreprises.delete_one({"id": entreprise_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entreprise non trouvee")
    return {"message": "Entreprise supprimee"}


# ==================== Secteurs Routes ====================
@api_router.post("/secteurs")
async def create_secteur(data: SecteurCreate, user=Depends(get_current_user)):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.secteurs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/secteurs")
async def list_secteurs(user=Depends(get_current_user)):
    items = await db.secteurs.find({}, {"_id": 0}).to_list(100)
    return {"data": items}


@api_router.put("/secteurs/{secteur_id}")
async def update_secteur(secteur_id: str, data: SecteurUpdate, user=Depends(get_current_user)):
    existing = await db.secteurs.find_one({"id": secteur_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Secteur non trouve")
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.secteurs.update_one({"id": secteur_id}, {"$set": update_data})
    updated = await db.secteurs.find_one({"id": secteur_id}, {"_id": 0})
    return updated


@api_router.delete("/secteurs/{secteur_id}")
async def delete_secteur(secteur_id: str, user=Depends(get_current_user)):
    result = await db.secteurs.delete_one({"id": secteur_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Secteur non trouve")
    return {"message": "Secteur supprime"}


# ==================== Templates Routes (basic read) ====================
@api_router.get("/templates")
async def list_templates(user=Depends(get_current_user)):
    items = await db.templates.find({}, {"_id": 0}).to_list(100)
    return {"data": items}


# ==================== Contacts Routes ====================
@api_router.post("/contacts")
async def create_contact(data: ContactCreate, user=Depends(get_current_user)):
    ent = await db.entreprises.find_one({"id": data.entreprise_id}, {"_id": 0})
    if not ent:
        raise HTTPException(status_code=404, detail="Entreprise non trouvee")
    if data.email and not re.match(r'^[^@]+@[^@]+\.[^@]+$', data.email):
        raise HTTPException(status_code=422, detail="Format email invalide")
    if data.linkedin_url and not re.match(r'^https?://', data.linkedin_url):
        raise HTTPException(status_code=422, detail="L'URL LinkedIn doit commencer par http:// ou https://")
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.contacts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/contacts")
async def list_contacts(
    entreprise_id: str = "", search: str = "",
    decideur_niveaux: str = "", role_flags: str = "",
    page: int = 1, limit: int = 20,
    user=Depends(get_current_user)
):
    query = {}
    if entreprise_id:
        query["entreprise_id"] = entreprise_id
    if search:
        rgx = {"$regex": search, "$options": "i"}
        query["$or"] = [{"nom": rgx}, {"prenom": rgx}, {"email": rgx}]
    if decideur_niveaux:
        query["decideur_niveau"] = {"$in": [d for d in decideur_niveaux.split(",") if d]}
    if role_flags:
        query["role_flag"] = {"$in": [r for r in role_flags.split(",") if r]}
    total = await db.contacts.count_documents(query)
    cursor = db.contacts.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit)
    items = await cursor.to_list(limit)
    ent_ids = list(set(c.get("entreprise_id") for c in items if c.get("entreprise_id")))
    if ent_ids:
        ents = await db.entreprises.find({"id": {"$in": ent_ids}}, {"_id": 0, "id": 1, "nom": 1}).to_list(200)
        emap = {e["id"]: e["nom"] for e in ents}
        for item in items:
            item["entreprise_nom"] = emap.get(item.get("entreprise_id"), "")
    return {"data": items, "total": total, "page": page, "limit": limit}


@api_router.get("/contacts/{contact_id}")
async def get_contact(contact_id: str, user=Depends(get_current_user)):
    doc = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Contact non trouve")
    return doc


@api_router.put("/contacts/{contact_id}")
async def update_contact(contact_id: str, data: ContactUpdate, user=Depends(get_current_user)):
    existing = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contact non trouve")
    update_data = data.model_dump(exclude_unset=True)
    if "email" in update_data and update_data["email"] and not re.match(r'^[^@]+@[^@]+\.[^@]+$', update_data["email"]):
        raise HTTPException(status_code=422, detail="Format email invalide")
    if "linkedin_url" in update_data and update_data["linkedin_url"] and not re.match(r'^https?://', update_data["linkedin_url"]):
        raise HTTPException(status_code=422, detail="L'URL LinkedIn doit commencer par http:// ou https://")
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.contacts.update_one({"id": contact_id}, {"$set": update_data})
    updated = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    return updated


@api_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, user=Depends(get_current_user)):
    result = await db.contacts.delete_one({"id": contact_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact non trouve")
    return {"message": "Contact supprime"}


# ==================== Opportunites Routes ====================
def _enforce_opportunite_stade_constraints(doc: dict) -> dict:
    """Enforce conditional fields based on stade. Modifies doc in place."""
    stade = doc.get("stade")
    # ca_reel_signe only when stade = signe
    if stade != "signe":
        doc["ca_reel_signe"] = None
    # motif_perdu only when stade = perdu
    if stade != "perdu":
        doc["motif_perdu"] = None
    # If type_contrat is recurrent, mrr must be set
    if doc.get("type_contrat") == "recurrent" and not doc.get("mrr"):
        raise HTTPException(
            status_code=422,
            detail="Le MRR est requis pour un contrat recurrent"
        )
    # If type_contrat is one_shot, clear mrr fields
    if doc.get("type_contrat") == "one_shot":
        doc["mrr"] = None
        doc["date_debut_contrat"] = None
        doc["date_fin_contrat"] = None
    return doc


@api_router.post("/opportunites")
async def create_opportunite(data: OpportuniteCreate, user=Depends(get_current_user)):
    ent = await db.entreprises.find_one({"id": data.entreprise_id}, {"_id": 0})
    if not ent:
        raise HTTPException(status_code=404, detail="Entreprise non trouvee")
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["proprietaire"] = doc.get("proprietaire") or user["nom"].split()[0].lower()
    doc["montant_pondere"] = round(doc["montant_estime"] * doc["probabilite"] / 100, 2)
    doc = _enforce_opportunite_stade_constraints(doc)
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.opportunites.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/opportunites")
async def list_opportunites(
    entreprise_id: str = "", stade: str = "",
    type_mission: str = "", proprietaire: str = "",
    page: int = 1, limit: int = 20,
    user=Depends(get_current_user)
):
    query = {}
    if entreprise_id:
        query["entreprise_id"] = entreprise_id
    if stade:
        query["stade"] = stade
    if type_mission:
        query["type_mission"] = type_mission
    if proprietaire:
        query["proprietaire"] = proprietaire
    total = await db.opportunites.count_documents(query)
    cursor = db.opportunites.find(query, {"_id": 0}).sort("montant_pondere", -1).skip((page - 1) * limit).limit(limit)
    items = await cursor.to_list(limit)
    ent_ids = list(set(o.get("entreprise_id") for o in items if o.get("entreprise_id")))
    if ent_ids:
        ents = await db.entreprises.find({"id": {"$in": ent_ids}}, {"_id": 0, "id": 1, "nom": 1}).to_list(200)
        emap = {e["id"]: e["nom"] for e in ents}
        for item in items:
            item["entreprise_nom"] = emap.get(item.get("entreprise_id"), "")
    return {"data": items, "total": total, "page": page, "limit": limit}


@api_router.get("/opportunites/{opportunite_id}")
async def get_opportunite(opportunite_id: str, user=Depends(get_current_user)):
    doc = await db.opportunites.find_one({"id": opportunite_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Opportunite non trouvee")
    return doc


@api_router.put("/opportunites/{opportunite_id}")
async def update_opportunite(opportunite_id: str, data: OpportuniteUpdate, user=Depends(get_current_user)):
    existing = await db.opportunites.find_one({"id": opportunite_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Opportunite non trouvee")
    update_data = data.model_dump(exclude_unset=True)
    merged = {**existing, **update_data}
    merged["montant_pondere"] = round(merged["montant_estime"] * merged["probabilite"] / 100, 2)
    merged = _enforce_opportunite_stade_constraints(merged)
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.opportunites.update_one({"id": opportunite_id}, {"$set": merged})
    merged.pop("_id", None)
    return merged


@api_router.delete("/opportunites/{opportunite_id}")
async def delete_opportunite(opportunite_id: str, user=Depends(get_current_user)):
    result = await db.opportunites.delete_one({"id": opportunite_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Opportunite non trouvee")
    return {"message": "Opportunite supprimee"}


# ==================== Interactions Routes ====================
@api_router.post("/interactions")
async def create_interaction(data: InteractionCreate, user=Depends(get_current_user)):
    ent = await db.entreprises.find_one({"id": data.entreprise_id}, {"_id": 0})
    if not ent:
        raise HTTPException(status_code=404, detail="Entreprise non trouvee")
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["auteur"] = doc.get("auteur") or user["nom"].split()[0].lower()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.interactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/interactions")
async def list_interactions(
    entreprise_id: str = "", type: str = "",
    statut: str = "", auteur: str = "",
    page: int = 1, limit: int = 50,
    user=Depends(get_current_user)
):
    query = {}
    if entreprise_id:
        query["entreprise_id"] = entreprise_id
    if type:
        query["type"] = type
    if statut:
        query["statut"] = statut
    if auteur:
        query["auteur"] = auteur
    total = await db.interactions.count_documents(query)
    cursor = db.interactions.find(query, {"_id": 0}).sort("date", -1).skip((page - 1) * limit).limit(limit)
    items = await cursor.to_list(limit)
    return {"data": items, "total": total, "page": page, "limit": limit}


@api_router.get("/interactions/{interaction_id}")
async def get_interaction(interaction_id: str, user=Depends(get_current_user)):
    doc = await db.interactions.find_one({"id": interaction_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Interaction non trouvee")
    return doc


@api_router.put("/interactions/{interaction_id}")
async def update_interaction(interaction_id: str, data: InteractionUpdate, user=Depends(get_current_user)):
    existing = await db.interactions.find_one({"id": interaction_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Interaction non trouvee")
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.interactions.update_one({"id": interaction_id}, {"$set": update_data})
    updated = await db.interactions.find_one({"id": interaction_id}, {"_id": 0})
    return updated


@api_router.delete("/interactions/{interaction_id}")
async def delete_interaction(interaction_id: str, user=Depends(get_current_user)):
    result = await db.interactions.delete_one({"id": interaction_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Interaction non trouvee")
    return {"message": "Interaction supprimee"}


@api_router.get("/entreprises/{entreprise_id}/last-interaction")
async def get_last_interaction(entreprise_id: str, user=Depends(get_current_user)):
    last = await db.interactions.find_one(
        {"entreprise_id": entreprise_id}, {"_id": 0}, sort=[("date", -1)]
    )
    return {"last_interaction": last}


# ==================== Archives (soft delete) ====================
@api_router.post("/entreprises/{entreprise_id}/archive")
async def archive_entreprise(entreprise_id: str, user=Depends(get_current_user)):
    existing = await db.entreprises.find_one({"id": entreprise_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Entreprise non trouvee")
    await db.entreprises.update_one(
        {"id": entreprise_id},
        {"$set": {"archived_at": datetime.now(timezone.utc).isoformat(),
                  "archived_by": user["nom"].split()[0].lower()}}
    )
    return {"message": "Entreprise archivee"}


@api_router.post("/entreprises/{entreprise_id}/unarchive")
async def unarchive_entreprise(entreprise_id: str, user=Depends(get_current_user)):
    existing = await db.entreprises.find_one({"id": entreprise_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Entreprise non trouvee")
    await db.entreprises.update_one(
        {"id": entreprise_id},
        {"$unset": {"archived_at": "", "archived_by": ""}}
    )
    return {"message": "Entreprise restauree"}


# ==================== Excel / CSV Import ====================

# Auto-suggestion rules: normalized header → target field
HEADER_MAPPING_RULES = {
    # Entreprises
    "nom": "nom",
    "société": "nom",
    "societe": "nom",
    "raison sociale": "nom",
    "company": "nom",
    "entreprise": "nom",
    "siret": "siret",
    "naf": "naf_code",
    "code naf": "naf_code",
    "apet": "naf_code",
    "ape": "naf_code",
    "ca": "ca",
    "chiffre d'affaires": "ca",
    "chiffre affaires": "ca",
    "ca ke": "ca",
    "revenue": "ca",
    "turnover": "ca",
    "effectif": "effectif",
    "salaries": "effectif",
    "salariés": "effectif",
    "employees": "effectif",
    "ville": "ville",
    "city": "ville",
    "région": "region",
    "region": "region",
    "adresse": "adresse",
    "address": "adresse",
    "site": "site_web",
    "site web": "site_web",
    "site_web": "site_web",
    "url": "site_web",
    "website": "site_web",
    "web": "site_web",
    "statut": "statut_pipeline",
    "status": "statut_pipeline",
    "notes": "notes",
    "note": "notes",
    "commentaire": "notes",
    "commentaires": "notes",
    "comment": "notes",
    # Contacts
    "email": "email",
    "mail": "email",
    "e-mail": "email",
    "email cible": "email",
    "contact": "contact_raw",  # "Antoine Cumin (DG)" — parsed later
    "prénom": "prenom",
    "prenom": "prenom",
    "first name": "prenom",
    "firstname": "prenom",
    "last name": "nom",
    "lastname": "nom",
    "linkedin": "linkedin_url",
    "linkedin url": "linkedin_url",
    "téléphone": "telephone",
    "telephone": "telephone",
    "phone": "telephone",
    "tel": "telephone",
    "titre": "titre",
    "fonction": "titre",
    "role": "titre",
    "poste": "titre",
    "job title": "titre",
}

TARGET_FIELDS = {
    "entreprises": [
        {"value": "__skip__", "label": "— Ignorer cette colonne —"},
        {"value": "nom", "label": "Nom (requis)"},
        {"value": "siret", "label": "SIRET"},
        {"value": "naf_code", "label": "Code NAF"},
        {"value": "ca", "label": "Chiffre d'affaires (€)"},
        {"value": "effectif", "label": "Effectif"},
        {"value": "ville", "label": "Ville"},
        {"value": "region", "label": "Région"},
        {"value": "adresse", "label": "Adresse"},
        {"value": "site_web", "label": "Site web"},
        {"value": "statut_pipeline", "label": "Statut pipeline"},
        {"value": "notes", "label": "Notes"},
        {"value": "tags", "label": "Tags (séparés par virgule)"},
    ],
    "contacts": [
        {"value": "__skip__", "label": "— Ignorer cette colonne —"},
        {"value": "entreprise_nom", "label": "Nom de l'entreprise (requis)"},
        {"value": "nom", "label": "Nom"},
        {"value": "prenom", "label": "Prénom"},
        {"value": "contact_raw", "label": "Nom complet (format: \"Prénom Nom (Titre)\")"},
        {"value": "email", "label": "Email"},
        {"value": "telephone", "label": "Téléphone"},
        {"value": "linkedin_url", "label": "URL LinkedIn"},
        {"value": "titre", "label": "Titre / Fonction"},
        {"value": "notes", "label": "Notes"},
    ],
}


def _normalize_header(h) -> str:
    """Normalize header for matching: lowercase, strip, collapse whitespace."""
    if h is None:
        return ""
    return str(h).lower().strip().replace("→", "").replace("é", "e").replace("è", "e").replace("ê", "e").replace("à", "a").replace("ç", "c")


def _suggest_field(header: str, target: str) -> str:
    """Return best-match target field for a given header, or __skip__.
    Uses word-boundary matching to avoid 'ca' matching 'canal' etc."""
    norm = _normalize_header(header)
    if not norm:
        return "__skip__"
    valid_fields = {f["value"] for f in TARGET_FIELDS.get(target, [])}

    # Special priority rules for contacts target — checked BEFORE generic rules
    if target == "contacts":
        # "Entreprise" / "société" must map to entreprise_nom, not nom
        if norm in ("entreprise", "societe", "société", "company", "raison sociale"):
            return "entreprise_nom"
        # "Contact" alone → contact_raw; multi-word like "canal 1er contact" → skip
        if norm == "contact":
            return "contact_raw"
        header_tokens = set(re.findall(r'\w+', norm))
        if "contact" in header_tokens and len(header_tokens) > 1:
            # "canal contact", "1er contact", "date contact" etc.
            return "__skip__"
        # Multi-word email fields (objet email, corps email, sujet email) → skip
        if "email" in header_tokens and any(
            noise in header_tokens for noise in ("objet", "corps", "sujet", "body", "subject")
        ):
            return "__skip__"

    # Exact match
    if norm in HEADER_MAPPING_RULES:
        candidate = HEADER_MAPPING_RULES[norm]
        if candidate in valid_fields:
            return candidate

    # Word-boundary partial match: iterate rules by descending length
    header_tokens = set(re.findall(r'\w+', norm))
    for rule, field in sorted(HEADER_MAPPING_RULES.items(), key=lambda x: -len(x[0])):
        if field not in valid_fields:
            continue
        rule_tokens = set(re.findall(r'\w+', rule))
        if rule_tokens and rule_tokens.issubset(header_tokens):
            return field
    return "__skip__"


def _parse_contact_raw(raw: str):
    """Parse 'Antoine Cumin (DG)' → ('Antoine', 'Cumin', 'DG').
    Returns (prenom, nom, titre) with None for missing.
    Handles:
      - 'Antoine Cumin (DG)' → ('Antoine', 'Cumin', 'DG')
      - 'AMOTECH (Romain Lesueur)' → (None, 'AMOTECH', 'Romain Lesueur') — acronym + responsible
      - 'David Barth, Dr. (CEO)' → ('David', 'Barth', 'CEO') — strip 'Dr.' suffix
    """
    if not raw or not isinstance(raw, str):
        return (None, None, None)
    raw = raw.strip()
    # Extract parenthetical → titre
    titre = None
    m = re.search(r'\(([^)]+)\)', raw)
    if m:
        titre = m.group(1).strip()
        raw = raw[:m.start()].strip()
    # Strip trailing honorifics before splitting ("David Barth, Dr." → "David Barth")
    raw = re.sub(r',\s*(Dr|Mr|Mme|M|Mrs|Ms)\.?\s*$', '', raw, flags=re.IGNORECASE).strip()
    # Space-separated: first token = prenom, rest = nom
    parts = raw.split()
    if len(parts) >= 2:
        return (parts[0], ' '.join(parts[1:]), titre)
    return (None, raw if raw else None, titre)


def _clean_value(v, field: str):
    """Cast a raw Excel value to the right type for the target field."""
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    if field == "ca":
        # Accept "25000000", "25M", "25 000 000 €"
        s2 = s.replace("€", "").replace(" ", "").replace(",", ".").lower()
        multiplier = 1
        if s2.endswith("m"):
            multiplier = 1_000_000
            s2 = s2[:-1]
        elif s2.endswith("k"):
            multiplier = 1_000
            s2 = s2[:-1]
        try:
            return float(s2) * multiplier
        except ValueError:
            return None
    if field == "effectif":
        # Strip non-digits
        digits = re.sub(r'\D', '', s)
        return int(digits) if digits else None
    if field == "siret":
        digits = re.sub(r'\D', '', s)
        return digits if len(digits) == 14 else None
    if field == "email":
        if re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', s):
            return s.lower()
        return None
    if field == "site_web":
        if s.startswith("http://") or s.startswith("https://"):
            return s
        # Prepend https:// if it looks like a domain
        if "." in s and not s.startswith("http"):
            return f"https://{s}"
        return None
    if field == "linkedin_url":
        if s.startswith("http://") or s.startswith("https://"):
            return s
        if "linkedin.com" in s:
            return f"https://{s}"
        return None
    if field == "tags":
        return [t.strip() for t in s.split(",") if t.strip()]
    return s


@api_router.post("/import/preview")
async def import_preview(
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):
    """Upload a file, return list of sheets + for each: headers + first rows."""
    filename = file.filename or "upload"
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB cap
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 10 Mo)")

    # Persist temporarily for the execute step
    token = str(uuid.uuid4())
    tmp_path = UPLOAD_DIR / f"{token}_{filename}"
    with open(tmp_path, "wb") as f:
        f.write(content)

    result = {"token": token, "filename": filename, "sheets": []}

    try:
        if filename.lower().endswith(".csv"):
            reader = csv.reader(io.StringIO(content.decode("utf-8", errors="replace")))
            rows = list(reader)
            if not rows:
                raise HTTPException(status_code=422, detail="Fichier CSV vide")
            headers = [str(h).strip() for h in rows[0]]
            preview = [[str(c) if c is not None else "" for c in row] for row in rows[1:6]]
            result["sheets"].append({
                "name": "CSV",
                "headers": headers,
                "preview": preview,
                "total_rows": len(rows) - 1,
            })
        else:
            # Excel
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
            for sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
                rows_iter = ws.iter_rows(values_only=True)
                try:
                    headers_raw = next(rows_iter)
                except StopIteration:
                    continue
                headers = [str(h).strip() if h is not None else f"Colonne {i+1}" for i, h in enumerate(headers_raw)]
                preview = []
                total = 0
                for row in rows_iter:
                    total += 1
                    if len(preview) < 5:
                        preview.append([str(c) if c is not None else "" for c in row])
                result["sheets"].append({
                    "name": sheet_name,
                    "headers": headers,
                    "preview": preview,
                    "total_rows": total,
                })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Import preview failed: {e}", exc_info=True)
        raise HTTPException(status_code=422, detail=f"Impossible de lire le fichier : {e}")

    return result


class ImportSuggestRequest(BaseModel):
    headers: List[str]
    target: Literal["entreprises", "contacts"]


@api_router.post("/import/suggest")
async def import_suggest(req: ImportSuggestRequest, user=Depends(get_current_user)):
    """Return an auto-suggested mapping for a list of headers."""
    suggestions = {h: _suggest_field(h, req.target) for h in req.headers}
    return {"suggestions": suggestions, "target_fields": TARGET_FIELDS[req.target]}


class ImportExecuteRequest(BaseModel):
    token: str
    sheet_name: Optional[str] = None  # None for CSV
    target: Literal["entreprises", "contacts"]
    mapping: dict  # {header: target_field_or_"__skip__"}
    duplicate_strategy: Literal["skip", "merge", "overwrite"] = "skip"
    default_proprietaire: Optional[ProprietaireT] = None


@api_router.post("/import/execute")
async def import_execute(req: ImportExecuteRequest, user=Depends(get_current_user)):
    """Execute the import: read the file, apply mapping, persist records.
    Returns counts (created, updated, skipped, errors) + list of errors."""
    # Locate the temp file
    files = list(UPLOAD_DIR.glob(f"{req.token}_*"))
    if not files:
        raise HTTPException(status_code=404, detail="Fichier introuvable (expiré ?). Re-uploadez.")
    tmp_path = files[0]

    # Defaults
    owner = req.default_proprietaire or user["nom"].split()[0].lower()
    if owner not in ("lucas", "ayoub", "david"):
        owner = "lucas"

    # Invert mapping for quick lookup: {target_field: header_index}
    # We need headers in order, so we'll use the position of each header
    errors = []
    created = 0
    updated = 0
    skipped = 0

    def _parse_rows():
        """Yield (row_num, headers, values) tuples."""
        filename = tmp_path.name
        if filename.lower().endswith(".csv"):
            with open(tmp_path, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.reader(f)
                rows = list(reader)
                if not rows:
                    return
                headers = [str(h).strip() for h in rows[0]]
                for i, row in enumerate(rows[1:], start=2):
                    yield (i, headers, list(row))
        else:
            wb = openpyxl.load_workbook(tmp_path, data_only=True, read_only=True)
            ws = wb[req.sheet_name] if req.sheet_name else wb[wb.sheetnames[0]]
            rows_iter = ws.iter_rows(values_only=True)
            try:
                headers_raw = next(rows_iter)
            except StopIteration:
                return
            headers = [str(h).strip() if h is not None else f"Colonne {i+1}" for i, h in enumerate(headers_raw)]
            for i, row in enumerate(rows_iter, start=2):
                yield (i, headers, list(row))

    # Build target-field → header-index map
    def _build_field_map(headers):
        fmap = {}
        for idx, header in enumerate(headers):
            target_field = req.mapping.get(header, "__skip__")
            if target_field and target_field != "__skip__":
                fmap[target_field] = idx
        return fmap

    if req.target == "entreprises":
        # Required: nom
        for row_num, headers, values in _parse_rows():
            try:
                fmap = _build_field_map(headers)
                if "nom" not in fmap:
                    raise ValueError("Aucune colonne mappée sur 'Nom' (requis)")
                raw_nom = values[fmap["nom"]] if fmap["nom"] < len(values) else None
                nom = _clean_value(raw_nom, "nom")
                if not nom:
                    skipped += 1
                    continue  # silent skip for empty rows
                doc = {
                    "nom": nom,
                    "source": "import_excel",
                    "proprietaire": owner,
                    "signaux_digitaux": [],
                    "tags": [],
                    "statut_pipeline": "froid",
                }
                for field, idx in fmap.items():
                    if field == "nom" or idx >= len(values):
                        continue
                    val = _clean_value(values[idx], field)
                    if val is None:
                        continue
                    if field == "tags" and isinstance(val, list):
                        doc["tags"] = val
                    elif field == "statut_pipeline":
                        # Accept only known enum, else default to "froid"
                        valid = {"froid", "qualifie", "contacte", "en_conversation",
                                 "diagnostic_envoye", "propale", "signe", "perdu"}
                        doc["statut_pipeline"] = val if val in valid else "froid"
                    else:
                        doc[field] = val

                # Validate SIRET format if present
                if doc.get("siret") and not (len(doc["siret"]) == 14 and doc["siret"].isdigit()):
                    del doc["siret"]
                # Validate NAF
                if doc.get("naf_code") and not re.match(r'^\d{2}\.\d{2}[A-Z]$', doc["naf_code"]):
                    del doc["naf_code"]

                # Duplicate check (by SIRET first, then by nom)
                existing = None
                if doc.get("siret"):
                    existing = await db.entreprises.find_one({"siret": doc["siret"]}, {"_id": 0})
                if not existing:
                    existing = await db.entreprises.find_one({"nom": doc["nom"]}, {"_id": 0})

                if existing:
                    if req.duplicate_strategy == "skip":
                        skipped += 1
                        continue
                    elif req.duplicate_strategy == "merge":
                        # Merge only empty fields
                        merged = {**existing}
                        for k, v in doc.items():
                            if v is not None and v != "" and v != [] and not existing.get(k):
                                merged[k] = v
                        merged["score_icp"] = calculate_score_icp(merged)
                        merged["updated_at"] = datetime.now(timezone.utc).isoformat()
                        await db.entreprises.update_one({"id": existing["id"]}, {"$set": merged})
                        updated += 1
                    else:  # overwrite
                        doc["id"] = existing["id"]
                        doc["created_at"] = existing.get("created_at", datetime.now(timezone.utc).isoformat())
                        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
                        doc["score_icp"] = calculate_score_icp(doc)
                        await db.entreprises.update_one({"id": existing["id"]}, {"$set": doc})
                        updated += 1
                else:
                    doc["id"] = str(uuid.uuid4())
                    doc["score_icp"] = calculate_score_icp(doc)
                    doc["created_at"] = datetime.now(timezone.utc).isoformat()
                    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
                    await db.entreprises.insert_one(doc)
                    created += 1
            except Exception as e:
                errors.append({"row": row_num, "error": str(e)[:200]})

    elif req.target == "contacts":
        # Required: entreprise_nom + (nom or contact_raw)
        # Pre-fetch all entreprises to match by name
        all_ents = await db.entreprises.find({}, {"_id": 0, "id": 1, "nom": 1}).to_list(10000)
        ent_by_nom = {e["nom"].lower().strip(): e["id"] for e in all_ents}

        for row_num, headers, values in _parse_rows():
            try:
                fmap = _build_field_map(headers)
                if "entreprise_nom" not in fmap:
                    raise ValueError("Aucune colonne mappée sur 'Nom de l'entreprise' (requis)")
                if "nom" not in fmap and "contact_raw" not in fmap:
                    raise ValueError("Mapper au moins 'Nom' ou 'Nom complet' sur une colonne")

                raw_ent = values[fmap["entreprise_nom"]] if fmap["entreprise_nom"] < len(values) else None
                ent_name = _clean_value(raw_ent, "nom")
                if not ent_name:
                    skipped += 1
                    continue

                # Find or create entreprise
                ent_key = ent_name.lower().strip()
                ent_id = ent_by_nom.get(ent_key)
                if not ent_id:
                    # Create minimal entreprise
                    new_ent = {
                        "id": str(uuid.uuid4()),
                        "nom": ent_name,
                        "source": "import_excel",
                        "proprietaire": owner,
                        "signaux_digitaux": [],
                        "tags": [],
                        "statut_pipeline": "froid",
                        "score_icp": calculate_score_icp({"nom": ent_name}),
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                    await db.entreprises.insert_one(new_ent)
                    ent_id = new_ent["id"]
                    ent_by_nom[ent_key] = ent_id

                # Build contact doc
                doc = {"entreprise_id": ent_id}
                for field, idx in fmap.items():
                    if field == "entreprise_nom" or idx >= len(values):
                        continue
                    if field == "contact_raw":
                        prenom, nom, titre = _parse_contact_raw(str(values[idx]) if values[idx] else "")
                        if prenom and "prenom" not in fmap:
                            doc["prenom"] = prenom
                        if nom and "nom" not in fmap:
                            doc["nom"] = nom
                        if titre and "titre" not in fmap:
                            doc["titre"] = titre
                    else:
                        val = _clean_value(values[idx], field)
                        if val is not None:
                            doc[field] = val

                if not doc.get("nom"):
                    raise ValueError("Nom du contact introuvable après parsing")

                # Duplicate check (by email within same entreprise, or nom+prenom)
                existing = None
                if doc.get("email"):
                    existing = await db.contacts.find_one({
                        "entreprise_id": ent_id, "email": doc["email"]
                    }, {"_id": 0})
                if not existing and doc.get("nom"):
                    q = {"entreprise_id": ent_id, "nom": doc["nom"]}
                    if doc.get("prenom"):
                        q["prenom"] = doc["prenom"]
                    existing = await db.contacts.find_one(q, {"_id": 0})

                if existing:
                    if req.duplicate_strategy == "skip":
                        skipped += 1
                        continue
                    elif req.duplicate_strategy == "merge":
                        merged = {**existing}
                        for k, v in doc.items():
                            if v is not None and v != "" and not existing.get(k):
                                merged[k] = v
                        merged["updated_at"] = datetime.now(timezone.utc).isoformat()
                        await db.contacts.update_one({"id": existing["id"]}, {"$set": merged})
                        updated += 1
                    else:
                        doc["id"] = existing["id"]
                        doc["created_at"] = existing.get("created_at", datetime.now(timezone.utc).isoformat())
                        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
                        await db.contacts.update_one({"id": existing["id"]}, {"$set": doc})
                        updated += 1
                else:
                    doc["id"] = str(uuid.uuid4())
                    doc["created_at"] = datetime.now(timezone.utc).isoformat()
                    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
                    doc.setdefault("decideur_niveau", "secondaire")
                    doc.setdefault("role_flag", "autre")
                    await db.contacts.insert_one(doc)
                    created += 1
            except Exception as e:
                errors.append({"row": row_num, "error": str(e)[:200]})

    # Cleanup temp file
    try:
        tmp_path.unlink()
    except Exception:
        pass

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "error_count": len(errors),
        "errors": errors[:50],  # cap to 50 for UI
    }


# ==================== Objectifs (Lucas-focused for V1) ====================
@api_router.post("/objectifs")
async def create_objectif(data: ObjectifCreate, user=Depends(get_current_user)):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    # Deactivate other active objectifs (only 1 active at a time)
    if doc.get("actif"):
        await db.objectifs.update_many({"actif": True}, {"$set": {"actif": False}})
    await db.objectifs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/objectifs")
async def list_objectifs(actif_only: bool = False, user=Depends(get_current_user)):
    query = {}
    if actif_only:
        query["actif"] = True
    items = await db.objectifs.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"data": items}


@api_router.get("/objectifs/actif")
async def get_objectif_actif(user=Depends(get_current_user)):
    """Retourne l'objectif actif (il n'y en a qu'un a la fois)."""
    item = await db.objectifs.find_one({"actif": True}, {"_id": 0})
    return {"data": item}


@api_router.put("/objectifs/{objectif_id}")
async def update_objectif(objectif_id: str, data: ObjectifUpdate, user=Depends(get_current_user)):
    existing = await db.objectifs.find_one({"id": objectif_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Objectif non trouve")
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    # If setting actif=True, deactivate others
    if update_data.get("actif") is True:
        await db.objectifs.update_many(
            {"actif": True, "id": {"$ne": objectif_id}},
            {"$set": {"actif": False}}
        )
    await db.objectifs.update_one({"id": objectif_id}, {"$set": update_data})
    updated = await db.objectifs.find_one({"id": objectif_id}, {"_id": 0})
    return updated


@api_router.delete("/objectifs/{objectif_id}")
async def delete_objectif(objectif_id: str, user=Depends(get_current_user)):
    result = await db.objectifs.delete_one({"id": objectif_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Objectif non trouve")
    return {"message": "Objectif supprime"}


# ==================== Todos (kanban weekly) ====================
@api_router.post("/todos")
async def create_todo(data: TodoCreate, user=Depends(get_current_user)):
    doc = data.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.todos.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/todos")
async def list_todos(
    assigne_a: str = "",
    jour: str = "",
    categorie: str = "",
    statut: str = "",
    user=Depends(get_current_user)
):
    query = {}
    if assigne_a:
        query["assigne_a"] = assigne_a
    if jour:
        query["jour"] = jour
    if categorie:
        query["categorie"] = categorie
    if statut:
        query["statut"] = statut
    items = await db.todos.find(query, {"_id": 0}).sort([("jour", 1), ("ordre", 1), ("created_at", 1)]).to_list(500)
    # Lookup entreprise nom for linked todos
    ent_ids = list(set(t.get("entreprise_id") for t in items if t.get("entreprise_id")))
    if ent_ids:
        ents = await db.entreprises.find({"id": {"$in": ent_ids}}, {"_id": 0, "id": 1, "nom": 1}).to_list(200)
        emap = {e["id"]: e["nom"] for e in ents}
        for item in items:
            if item.get("entreprise_id"):
                item["entreprise_nom"] = emap.get(item["entreprise_id"], "")
    return {"data": items}


@api_router.put("/todos/{todo_id}")
async def update_todo(todo_id: str, data: TodoUpdate, user=Depends(get_current_user)):
    existing = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Todo non trouve")
    update_data = data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.todos.update_one({"id": todo_id}, {"$set": update_data})
    updated = await db.todos.find_one({"id": todo_id}, {"_id": 0})
    return updated


@api_router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: str, user=Depends(get_current_user)):
    result = await db.todos.delete_one({"id": todo_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Todo non trouve")
    return {"message": "Todo supprime"}


@api_router.post("/todos/bulk-import")
async def bulk_import_todos(data: TodoBulkImport, user=Depends(get_current_user)):
    """Parse un texte colle (ex: reponse Claude avec tirets/numerotations)
    et cree les todos avec valeurs par defaut fournies."""
    lines = data.texte.splitlines()
    todos_created = []
    # Regex: accepte "- ...", "* ...", "1. ...", "1) ...", "- [ ] ..."
    pattern = re.compile(r'^\s*(?:-|\*|\d+[\.\)])\s*(?:\[[ x]\]\s*)?(.+)$')
    ordre = 0
    for line in lines:
        match = pattern.match(line)
        if not match:
            continue
        titre = match.group(1).strip()
        if not titre:
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "titre": titre[:200],  # Hard cap
            "description": None,
            "categorie": data.categorie,
            "jour": data.jour,
            "assigne_a": data.assigne_a,
            "statut": "a_faire",
            "entreprise_id": None,
            "opportunite_id": None,
            "ordre": ordre,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.todos.insert_one(doc)
        doc.pop("_id", None)
        todos_created.append(doc)
        ordre += 1
    return {"created_count": len(todos_created), "data": todos_created}


# ==================== Tags (distinct list for filters) ====================
@api_router.get("/tags")
async def list_tags(user=Depends(get_current_user)):
    """Returns distinct tags used across entreprises."""
    tags = await db.entreprises.distinct("tags")
    return {"data": [t for t in tags if t]}


# ==================== Admin export (backup JSON) ====================
@api_router.get("/admin/export")
async def admin_export(user=Depends(get_current_user)):
    """Dump all collections as JSON for backup/migration."""
    collections = ["users", "entreprises", "secteurs", "templates", "contacts",
                   "opportunites", "interactions", "objectifs", "todos"]
    dump = {}
    for coll in collections:
        items = await db[coll].find({}, {"_id": 0}).to_list(10000)
        # Strip password hashes for safety
        if coll == "users":
            items = [{k: v for k, v in u.items() if k != "password_hash"} for u in items]
        dump[coll] = items
    dump["exported_at"] = datetime.now(timezone.utc).isoformat()
    dump["exported_by"] = user.get("email")
    return dump


# ==================== Dashboard metrics ====================
def _month_key(iso_str: str) -> str:
    """Extract YYYY-MM from ISO date string."""
    try:
        return iso_str[:7]
    except Exception:
        return ""


def _current_month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _current_year() -> int:
    return datetime.now(timezone.utc).year


@api_router.get("/dashboard/metrics")
async def dashboard_metrics(
    proprietaire: str = "",  # filtre "mes donnees" vs "equipe" (empty = equipe)
    user=Depends(get_current_user)
):
    """KPIs + chart data for the dashboard."""
    # Filter for proprietaire-scoped queries
    ent_filter = {"archived_at": {"$exists": False}}
    opp_filter = {}
    if proprietaire:
        ent_filter["proprietaire"] = proprietaire
        opp_filter["proprietaire"] = proprietaire

    current_month = _current_month_key()
    current_year = _current_year()

    # CA signe YTD: sum of ca_reel_signe for opps stade=signe this year
    opps_signes = await db.opportunites.find(
        {**opp_filter, "stade": "signe"},
        {"_id": 0}
    ).to_list(1000)

    ca_ytd = 0.0
    ca_mois_courant = 0.0
    ca_par_mois = {}  # YYYY-MM -> total
    # For MRR: sum mrr of active recurrent contracts (date_debut <= today, date_fin null or >= today)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    mrr_total = 0.0
    mrr_contracts = []

    for opp in opps_signes:
        updated_at = opp.get("updated_at", "")
        month = _month_key(updated_at)
        montant = opp.get("ca_reel_signe") or opp.get("montant_estime", 0) or 0

        if updated_at.startswith(str(current_year)):
            ca_ytd += montant

        if month == current_month:
            ca_mois_courant += montant

        if month:
            ca_par_mois[month] = ca_par_mois.get(month, 0) + montant

        # MRR calculation for recurrent
        if opp.get("type_contrat") == "recurrent" and opp.get("mrr"):
            date_debut = opp.get("date_debut_contrat") or ""
            date_fin = opp.get("date_fin_contrat")
            active = (not date_debut or date_debut <= today) and (not date_fin or date_fin >= today)
            if active:
                mrr_total += opp["mrr"]
                mrr_contracts.append({
                    "id": opp["id"],
                    "intitule": opp.get("intitule"),
                    "entreprise_id": opp.get("entreprise_id"),
                    "mrr": opp["mrr"],
                    "date_debut_contrat": date_debut,
                    "date_fin_contrat": date_fin,
                })

    # CA mois courant inclut le MRR actif
    ca_mois_courant_total = ca_mois_courant + mrr_total

    # Pipeline pondere: sum montant_pondere of non-closed opps
    opps_pipeline = await db.opportunites.find(
        {**opp_filter, "stade": {"$nin": ["signe", "perdu"]}},
        {"_id": 0}
    ).to_list(1000)
    ca_pondere_pipeline = sum(o.get("montant_pondere", 0) or 0 for o in opps_pipeline)

    # Prospects actifs: entreprises non archivees, statut != froid/signe/perdu
    prospects_actifs = await db.entreprises.count_documents({
        **ent_filter,
        "statut_pipeline": {"$nin": ["froid", "signe", "perdu"]}
    })

    # Taux de conversion 30j: signes ces 30 derniers jours / contactes ces 30 derniers jours
    d30 = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    signes_30j = await db.opportunites.count_documents({
        **opp_filter, "stade": "signe", "updated_at": {"$gte": d30}
    })
    contactes_30j = await db.entreprises.count_documents({
        **ent_filter,
        "statut_pipeline": {"$in": ["contacte", "en_conversation", "diagnostic_envoye", "propale"]},
        "updated_at": {"$gte": d30}
    })
    taux_conversion = round(signes_30j / contactes_30j * 100, 1) if contactes_30j > 0 else 0

    # 12 months rolling chart
    months_rolling = []
    now = datetime.now(timezone.utc)
    for i in range(11, -1, -1):
        dt = now.replace(day=1) - timedelta(days=i * 30)
        key = dt.strftime("%Y-%m")
        # adjust to actual month boundaries (approximation via day=1 + i*30 has drift)
        months_rolling.append(key)
    # Dedupe while preserving order (rare drift edge case)
    seen = set()
    months_clean = []
    for m in months_rolling:
        if m not in seen:
            months_clean.append(m)
            seen.add(m)
    # Build chart data
    chart_ca_par_mois = [{"mois": m, "ca": round(ca_par_mois.get(m, 0), 2)} for m in months_clean]

    # Funnel pipeline by stade (non-closed)
    stages = ["qualification", "diagnostic", "propale", "negociation"]
    funnel = []
    for s in stages:
        opps_at_stage = [o for o in opps_pipeline if o.get("stade") == s]
        funnel.append({
            "stade": s,
            "count": len(opps_at_stage),
            "montant_pondere": round(sum(o.get("montant_pondere", 0) or 0 for o in opps_at_stage), 2)
        })

    # Top 5 opportunites ponderees
    top_opps = sorted(opps_pipeline, key=lambda o: o.get("montant_pondere", 0) or 0, reverse=True)[:5]
    ent_ids_top = list(set(o.get("entreprise_id") for o in top_opps if o.get("entreprise_id")))
    ent_map = {}
    if ent_ids_top:
        ents_found = await db.entreprises.find({"id": {"$in": ent_ids_top}}, {"_id": 0, "id": 1, "nom": 1}).to_list(200)
        ent_map = {e["id"]: e["nom"] for e in ents_found}
    for o in top_opps:
        o["entreprise_nom"] = ent_map.get(o.get("entreprise_id"), "")

    # A relancer: entreprises actives sans interaction recente (> 14j)
    d14 = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    active_statuts = ["qualifie", "contacte", "en_conversation", "diagnostic_envoye", "propale"]
    active_ents = await db.entreprises.find(
        {**ent_filter, "statut_pipeline": {"$in": active_statuts}},
        {"_id": 0}
    ).to_list(500)

    # For each, get last interaction date
    ent_ids_active = [e["id"] for e in active_ents]
    last_int_map = {}
    if ent_ids_active:
        pipeline = [
            {"$match": {"entreprise_id": {"$in": ent_ids_active}}},
            {"$sort": {"date": -1}},
            {"$group": {"_id": "$entreprise_id", "last_date": {"$first": "$date"}}}
        ]
        last_ints = await db.interactions.aggregate(pipeline).to_list(500)
        last_int_map = {li["_id"]: li["last_date"] for li in last_ints}

    a_relancer = []
    for e in active_ents:
        last_date = last_int_map.get(e["id"])
        reference_date = last_date or e.get("created_at", "")
        if reference_date and reference_date < d14:
            a_relancer.append({
                "id": e["id"],
                "nom": e["nom"],
                "statut_pipeline": e["statut_pipeline"],
                "proprietaire": e.get("proprietaire"),
                "date_derniere_interaction": last_date,
                "jours_depuis": (datetime.now(timezone.utc) - datetime.fromisoformat(reference_date.replace("Z", "+00:00"))).days if reference_date else None,
            })
    a_relancer.sort(key=lambda x: x.get("date_derniere_interaction") or "")

    return {
        "kpi": {
            "ca_ytd": round(ca_ytd, 2),
            "ca_mois_courant": round(ca_mois_courant_total, 2),
            "ca_mois_courant_one_shot": round(ca_mois_courant, 2),
            "mrr_total": round(mrr_total, 2),
            "ca_pondere_pipeline": round(ca_pondere_pipeline, 2),
            "prospects_actifs": prospects_actifs,
            "taux_conversion_30j": taux_conversion,
            "signes_30j": signes_30j,
            "contactes_30j": contactes_30j,
        },
        "chart_ca_par_mois": chart_ca_par_mois,
        "funnel": funnel,
        "top_opportunites": top_opps,
        "a_relancer": a_relancer[:20],  # cap at 20
        "mrr_contracts": mrr_contracts,
    }


# ==================== Seed Data ====================
async def seed_data():
    try:
        user_count = await db.users.count_documents({})
        if user_count == 0:
            users = [
                {
                    "id": str(uuid.uuid4()), "nom": "Lucas Ansel",
                    "email": "lucas@industrial-decision.fr", "role": "fondateur",
                    "password_hash": hash_password("industrialdecision"),
                    "must_change_password": True,
                    "actif": True, "created_at": datetime.now(timezone.utc).isoformat()
                },
                {
                    "id": str(uuid.uuid4()), "nom": "Ayoub Bouzalmad",
                    "email": "ayoub@industrial-decision.fr", "role": "cto",
                    "password_hash": hash_password("industrialdecision"),
                    "must_change_password": True,
                    "actif": True, "created_at": datetime.now(timezone.utc).isoformat()
                },
                {
                    "id": str(uuid.uuid4()), "nom": "David Ansel",
                    "email": "david@industrial-decision.fr", "role": "ops",
                    "password_hash": hash_password("industrialdecision"),
                    "must_change_password": True,
                    "actif": True, "created_at": datetime.now(timezone.utc).isoformat()
                },
            ]
            await db.users.insert_many(users)
            logger.info("Seeded 3 users")

        # Idempotent migration: ensure must_change_password flag is present
        # on legacy users seeded before this field existed
        await db.users.update_many(
            {"must_change_password": {"$exists": False}},
            {"$set": {"must_change_password": True}}
        )

        secteur_count = await db.secteurs.count_documents({})
        if secteur_count == 0:
            secteurs = [
                {"id": str(uuid.uuid4()), "naf_code": "28.41Z", "libelle": "Fabrication de machines-outils pour le travail des metaux", "position": "coeur", "description": None, "template_email_id": None, "created_at": datetime.now(timezone.utc).isoformat()},
                {"id": str(uuid.uuid4()), "naf_code": "46.62Z", "libelle": "Commerce de gros de machines-outils", "position": "coeur", "description": None, "template_email_id": None, "created_at": datetime.now(timezone.utc).isoformat()},
                {"id": str(uuid.uuid4()), "naf_code": "28.49Z", "libelle": "Fabrication d'autres machines-outils", "position": "coeur", "description": None, "template_email_id": None, "created_at": datetime.now(timezone.utc).isoformat()},
                {"id": str(uuid.uuid4()), "naf_code": "43.11Z", "libelle": "Travaux de demolition", "position": "coeur", "description": None, "template_email_id": None, "created_at": datetime.now(timezone.utc).isoformat()},
                {"id": str(uuid.uuid4()), "naf_code": "70.22Z", "libelle": "Conseil pour les affaires et autres conseils de gestion", "position": "adjacent", "description": None, "template_email_id": None, "created_at": datetime.now(timezone.utc).isoformat()},
                {"id": str(uuid.uuid4()), "naf_code": "24.10Z", "libelle": "Siderurgie", "position": "adjacent", "description": None, "template_email_id": None, "created_at": datetime.now(timezone.utc).isoformat()},
                {"id": str(uuid.uuid4()), "naf_code": "71.12B", "libelle": "Ingenierie, etudes techniques", "position": "adjacent", "description": None, "template_email_id": None, "created_at": datetime.now(timezone.utc).isoformat()},
                {"id": str(uuid.uuid4()), "naf_code": "46.69B", "libelle": "Commerce de gros de fournitures et equipements industriels divers", "position": "adjacent", "description": None, "template_email_id": None, "created_at": datetime.now(timezone.utc).isoformat()},
            ]
            await db.secteurs.insert_many(secteurs)
            logger.info("Seeded 8 secteurs")

        template_count = await db.templates.count_documents({})
        if template_count == 0:
            s_4662 = await db.secteurs.find_one({"naf_code": "46.62Z"}, {"_id": 0})
            s_2841 = await db.secteurs.find_one({"naf_code": "28.41Z"}, {"_id": 0})
            s_2849 = await db.secteurs.find_one({"naf_code": "28.49Z"}, {"_id": 0})

            templates = [
                {
                    "id": str(uuid.uuid4()),
                    "nom": "Cold initial - Commerce machines-outils",
                    "secteur_id": s_4662["id"] if s_4662 else None,
                    "type": "cold_initial",
                    "objet": "{nom_entreprise} - parc machines",
                    "corps": "Bonjour {dirigeant},\n\n{nom_entreprise} distribue un parc de plusieurs milliers de machines, mais son site n'apparait pas dans les premiers resultats Google sur les requetes de votre coeur de metier.\n\nResultat concret : les acheteurs industriels qui cherchent une machine aujourd'hui tombent sur vos concurrents avant de vous trouver.\n\nNous avons accompagne un distributeur equivalent sur ce sujet - premieres demandes entrantes qualifiees en moins de 6 semaines.\n\nEst-ce un sujet pour vous en ce moment ?\n\nLucas",
                    "variables": ["nom_entreprise", "dirigeant", "ville"],
                    "version": 1, "actif": True, "cree_par": "lucas",
                    "created_at": datetime.now(timezone.utc).isoformat()
                },
                {
                    "id": str(uuid.uuid4()),
                    "nom": "Cold initial - Fabrication machines-outils metaux",
                    "secteur_id": s_2841["id"] if s_2841 else None,
                    "type": "cold_initial",
                    "objet": "{nom_entreprise} - visibilite digitale",
                    "corps": "Bonjour {dirigeant},\n\n{nom_entreprise} fabrique des machines-outils de precision, mais votre site reste invisible sur les requetes cles de votre secteur.\n\nVos prospects industriels ne vous trouvent pas quand ils cherchent un fabricant - ils trouvent vos concurrents.\n\nNous avons accompagne un fabricant similaire : premieres demandes qualifiees en moins de 5 semaines.\n\nEst-ce un sujet pour vous en ce moment ?\n\nLucas",
                    "variables": ["nom_entreprise", "dirigeant", "ville"],
                    "version": 1, "actif": True, "cree_par": "lucas",
                    "created_at": datetime.now(timezone.utc).isoformat()
                },
                {
                    "id": str(uuid.uuid4()),
                    "nom": "Cold initial - Autres machines-outils",
                    "secteur_id": s_2849["id"] if s_2849 else None,
                    "type": "cold_initial",
                    "objet": "{nom_entreprise} - acquisition digitale",
                    "corps": "Bonjour {dirigeant},\n\n{nom_entreprise} concoit des machines-outils specialisees, mais votre presence en ligne ne reflete pas votre expertise technique.\n\nLes acheteurs industriels qui recherchent vos solutions passent a cote de votre offre.\n\nNous avons aide un fabricant comparable - resultat : +40% de demandes entrantes en 8 semaines.\n\nCe sujet vous parle ?\n\nLucas",
                    "variables": ["nom_entreprise", "dirigeant", "ville"],
                    "version": 1, "actif": True, "cree_par": "lucas",
                    "created_at": datetime.now(timezone.utc).isoformat()
                },
            ]
            await db.templates.insert_many(templates)
            logger.info("Seeded 3 templates")

        # Create indexes
        await db.users.create_index("email", unique=True)
        await db.users.create_index("id", unique=True)
        await db.entreprises.create_index("id", unique=True)
        await db.entreprises.create_index("siret", sparse=True)
        await db.entreprises.create_index("nom")
        await db.entreprises.create_index("archived_at", sparse=True)
        await db.entreprises.create_index("tags")
        await db.secteurs.create_index("id", unique=True)
        await db.secteurs.create_index("naf_code", unique=True)
        await db.templates.create_index("id", unique=True)
        await db.contacts.create_index("id", unique=True)
        await db.contacts.create_index("entreprise_id")
        await db.opportunites.create_index("id", unique=True)
        await db.opportunites.create_index("entreprise_id")
        await db.opportunites.create_index("montant_pondere")
        await db.opportunites.create_index("stade")
        await db.interactions.create_index("id", unique=True)
        await db.interactions.create_index("entreprise_id")
        await db.interactions.create_index("date")
        await db.objectifs.create_index("id", unique=True)
        await db.objectifs.create_index("actif")
        await db.todos.create_index("id", unique=True)
        await db.todos.create_index([("assigne_a", 1), ("jour", 1), ("ordre", 1)])
        logger.info("Database indexes created")

    except Exception as e:
        logger.error(f"Seed error: {e}", exc_info=True)


# ==================== App Config ====================
@app.on_event("startup")
async def startup():
    await seed_data()
    logger.info("Industrial Decision Cockpit started")


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api_router)

# CORS whitelist from env (comma-separated)
cors_raw = os.environ.get("CORS_ORIGINS", "")
cors_origins = [o.strip() for o in cors_raw.split(",") if o.strip()]
if not cors_origins:
    # Safe default for local dev only
    cors_origins = ["http://localhost:3000"]
    logger.warning("CORS_ORIGINS not set - falling back to http://localhost:3000. Set explicitly in production.")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
