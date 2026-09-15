"""
Module Analytics - Industrial Decision Cockpit
==============================================

Connecte Google Search Console + Google Analytics 4 au cockpit.
Supporte plusieurs sites (Industrial Decision, clients...).

A integrer dans server.py via :

    from analytics_module import (
        router as analytics_router,
        register_indexes as analytics_register_indexes,
        init as analytics_init,
    )
    api_router.include_router(analytics_router)

    # Dans le startup event :
    await analytics_register_indexes(db)
    analytics_init(db, get_current_user)

Routes finales : /api/analytics/...

Variables d'environnement
-------------------------
GOOGLE_SA_JSON_B64   Service account JSON encode en base64 (obligatoire)

ANALYTICS_SITES      JSON listant les sites. Exemple :
  [
    {"id":"industrial","label":"Industrial Decision",
     "gsc":"sc-domain:industrialdecision.com","ga4":"123456789"},
    {"id":"alma","label":"ALMA Machines-Outils",
     "gsc":"sc-domain:alma-machines-outils.fr","ga4":"987654321"}
  ]

Retrocompatibilite : si ANALYTICS_SITES est absent, le module lit
GSC_SITE_URL et GA4_PROPERTY_ID et cree un site unique "default".
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from datetime import datetime, timedelta, timezone, date
from typing import Optional, List, Dict, Any
import os
import json
import base64
import asyncio
import logging
import hashlib

logger = logging.getLogger(__name__)

# ============================================================
# State du module - rempli par init() depuis server.py
# ============================================================

db = None
_real_get_current_user = None


def init(database, auth_dependency):
    """Appele par server.py APRES que db et get_current_user soient definis."""
    global db, _real_get_current_user
    db = database
    _real_get_current_user = auth_dependency
    logger.info("analytics_module initialise")


async def get_current_user(request: Request) -> dict:
    """
    Proxy vers la dependency d'auth de server.py.

    La signature doit correspondre exactement a celle de server.py :
    FastAPI inspecte la signature des dependencies pour construire le
    schema de la requete. Une signature generique (*args, **kwargs) serait
    interpretee comme des query params obligatoires.
    """
    if _real_get_current_user is None:
        raise HTTPException(status_code=503, detail="Module analytics non initialise")
    return await _real_get_current_user(request)


router = APIRouter(prefix="/analytics", tags=["analytics"])


# ============================================================
# Sites configures
# ============================================================

SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
]

_credentials_cache = None
_sites_cache = None


def _load_sites() -> List[Dict[str, Any]]:
    """Charge ANALYTICS_SITES, ou retombe sur GSC_SITE_URL / GA4_PROPERTY_ID."""
    global _sites_cache
    if _sites_cache is not None:
        return _sites_cache

    raw = os.environ.get("ANALYTICS_SITES")
    if raw:
        try:
            sites = json.loads(raw)
            if not isinstance(sites, list):
                raise ValueError("ANALYTICS_SITES doit etre une liste JSON")
            for s in sites:
                if "id" not in s or "label" not in s:
                    raise ValueError("Chaque site a besoin de 'id' et 'label'")
            _sites_cache = sites
            return sites
        except Exception as e:
            logger.error(f"ANALYTICS_SITES invalide : {e}")
            raise HTTPException(status_code=503, detail=f"ANALYTICS_SITES invalide : {e}")

    gsc = os.environ.get("GSC_SITE_URL")
    ga4 = os.environ.get("GA4_PROPERTY_ID")
    if gsc or ga4:
        _sites_cache = [{"id": "default", "label": "Site principal", "gsc": gsc, "ga4": ga4}]
        return _sites_cache

    _sites_cache = []
    return _sites_cache


def _get_site(site_id: Optional[str]) -> Dict[str, Any]:
    """Resout un site_id. Sans argument, retourne le premier site."""
    sites = _load_sites()
    if not sites:
        raise HTTPException(
            status_code=503,
            detail="Aucun site configure. Renseigne ANALYTICS_SITES dans les variables.",
        )
    if site_id is None:
        return sites[0]
    for s in sites:
        if s["id"] == site_id:
            return s
    raise HTTPException(status_code=404, detail=f"Site inconnu : {site_id}")


def _load_credentials():
    global _credentials_cache
    if _credentials_cache is not None:
        return _credentials_cache

    raw = os.environ.get("GOOGLE_SA_JSON_B64")
    if not raw:
        raise HTTPException(
            status_code=503,
            detail="GOOGLE_SA_JSON_B64 absent. Ajoute le service account JSON en base64.",
        )
    try:
        from google.oauth2 import service_account

        info = json.loads(base64.b64decode(raw))
        _credentials_cache = service_account.Credentials.from_service_account_info(
            info, scopes=SCOPES
        )
        return _credentials_cache
    except Exception as e:
        logger.error(f"Credentials Google invalides : {e}")
        raise HTTPException(status_code=503, detail=f"Credentials Google invalides : {e}")


def _require_gsc(site: Dict[str, Any]) -> str:
    value = site.get("gsc")
    if not value:
        raise HTTPException(
            status_code=503,
            detail=f"Search Console non configure pour {site['label']}.",
        )
    return value


def _require_ga4(site: Dict[str, Any]) -> str:
    value = site.get("ga4")
    if not value:
        raise HTTPException(
            status_code=503,
            detail=f"Google Analytics non configure pour {site['label']}.",
        )
    return str(value).replace("properties/", "")


# ============================================================
# Periodes
# ============================================================

# Search Console publie avec 2-3 jours de latence
GSC_LAG_DAYS = 3

PERIOD_DAYS = {"24h": 1, "7d": 7, "28d": 28, "3m": 90, "6m": 180, "16m": 480}


def _resolve_period(period: str, lag: int = 0):
    days = PERIOD_DAYS.get(period)
    if days is None:
        raise HTTPException(
            status_code=400,
            detail=f"Periode inconnue : {period}. Valeurs : {', '.join(PERIOD_DAYS)}",
        )
    end = date.today() - timedelta(days=lag)
    start = end - timedelta(days=days - 1)
    return start.isoformat(), end.isoformat()


def _previous_period(start: str, end: str):
    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    length = (e - s).days + 1
    prev_end = s - timedelta(days=1)
    prev_start = prev_end - timedelta(days=length - 1)
    return prev_start.isoformat(), prev_end.isoformat()


def _delta(current: float, previous: float) -> Optional[float]:
    if not previous:
        return None
    return round(((current - previous) / previous) * 100, 1)


# ============================================================
# Cache Mongo
# ============================================================

CACHE_TTL_SECONDS = 3600


def _cache_key(source: str, payload: Dict[str, Any]) -> str:
    blob = json.dumps({"source": source, **payload}, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()[:32]


async def _cache_get(key: str) -> Optional[Any]:
    if db is None:
        return None
    try:
        doc = await db.analytics_cache.find_one({"_id": key})
        if not doc:
            return None
        created = doc["created_at"]
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - created).total_seconds() > CACHE_TTL_SECONDS:
            return None
        return doc["data"]
    except Exception as e:
        logger.warning(f"Lecture cache echouee : {e}")
        return None


async def _cache_set(key: str, data: Any, source: str, meta: Dict[str, Any]):
    if db is None:
        return
    try:
        await db.analytics_cache.update_one(
            {"_id": key},
            {"$set": {
                "data": data, "source": source, "meta": meta,
                "created_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"Ecriture cache echouee : {e}")


# ============================================================
# Search Console
# ============================================================
# Les clients Google sont synchrones : execution dans un thread
# pour ne pas bloquer l'event loop FastAPI.


def _gsc_query_sync(site_url: str, body: Dict[str, Any]) -> Dict[str, Any]:
    from googleapiclient.discovery import build

    creds = _load_credentials()
    service = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
    return service.searchanalytics().query(siteUrl=site_url, body=body).execute()


async def _gsc_query(
    site_url: str, start: str, end: str,
    dimensions: Optional[List[str]] = None,
    row_limit: int = 25,
    dimension_filters: Optional[List[Dict]] = None,
) -> List[Dict]:
    body = {"startDate": start, "endDate": end, "rowLimit": row_limit, "type": "web"}
    if dimensions:
        body["dimensions"] = dimensions
    if dimension_filters:
        body["dimensionFilterGroups"] = [{"filters": dimension_filters}]

    key = _cache_key("gsc", {"site": site_url, **body})
    cached = await _cache_get(key)
    if cached is not None:
        return cached

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, _gsc_query_sync, site_url, body)
    except Exception as e:
        logger.error(f"Appel GSC echoue : {e}")
        raise HTTPException(status_code=502, detail=f"Search Console : {e}")

    rows = result.get("rows", [])
    await _cache_set(key, rows, "gsc", {"site": site_url, "start": start, "end": end})
    return rows


def _gsc_totals(rows: List[Dict]) -> Dict[str, float]:
    """CTR recalcule sur les totaux, position ponderee par les impressions."""
    clicks = sum(r.get("clicks", 0) for r in rows)
    impressions = sum(r.get("impressions", 0) for r in rows)
    ctr = (clicks / impressions * 100) if impressions else 0.0
    position = (
        sum(r.get("position", 0) * r.get("impressions", 0) for r in rows) / impressions
        if impressions else 0.0
    )
    return {
        "clicks": int(clicks),
        "impressions": int(impressions),
        "ctr": round(ctr, 2),
        "position": round(position, 1),
    }


def _gsc_rows_to_items(rows: List[Dict], key_name: str) -> List[Dict]:
    return [
        {
            key_name: r["keys"][0],
            "clicks": int(r.get("clicks", 0)),
            "impressions": int(r.get("impressions", 0)),
            "ctr": round(r.get("ctr", 0) * 100, 2),
            "position": round(r.get("position", 0), 1),
        }
        for r in rows
    ]


# ============================================================
# GA4
# ============================================================


def _ga4_report_sync(property_id: str, body: Dict[str, Any]) -> List[Dict]:
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        DateRange, Dimension, Metric, RunReportRequest, OrderBy,
    )

    creds = _load_credentials()
    client = BetaAnalyticsDataClient(credentials=creds)

    request = RunReportRequest(
        property=f"properties/{property_id}",
        date_ranges=[DateRange(start_date=body["start"], end_date=body["end"])],
        dimensions=[Dimension(name=d) for d in body.get("dimensions", [])],
        metrics=[Metric(name=m) for m in body.get("metrics", [])],
        limit=body.get("limit", 25),
    )
    if body.get("order_by_metric"):
        request.order_bys = [
            OrderBy(
                metric=OrderBy.MetricOrderBy(metric_name=body["order_by_metric"]),
                desc=True,
            )
        ]

    response = client.run_report(request)

    out = []
    for row in response.rows:
        item = {}
        for i, dim in enumerate(response.dimension_headers):
            item[dim.name] = row.dimension_values[i].value
        for i, met in enumerate(response.metric_headers):
            raw = row.metric_values[i].value
            try:
                item[met.name] = float(raw) if "." in raw else int(raw)
            except (ValueError, TypeError):
                item[met.name] = raw
        out.append(item)
    return out


async def _ga4_report(
    property_id: str, start: str, end: str,
    dimensions: Optional[List[str]] = None,
    metrics: Optional[List[str]] = None,
    limit: int = 25,
    order_by_metric: Optional[str] = None,
) -> List[Dict]:
    body = {
        "start": start, "end": end,
        "dimensions": dimensions or [],
        "metrics": metrics or ["sessions"],
        "limit": limit,
        "order_by_metric": order_by_metric,
    }

    key = _cache_key("ga4", {"prop": property_id, **body})
    cached = await _cache_get(key)
    if cached is not None:
        return cached

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(None, _ga4_report_sync, property_id, body)
    except Exception as e:
        logger.error(f"Appel GA4 echoue : {e}")
        raise HTTPException(status_code=502, detail=f"Google Analytics : {e}")

    await _cache_set(key, result, "ga4", {"prop": property_id, "start": start, "end": end})
    return result


# ============================================================
# Routes - configuration
# ============================================================


@router.get("/sites")
async def list_sites(user=Depends(get_current_user)):
    """Sites disponibles. Alimente le selecteur du frontend."""
    sites = _load_sites()
    return {
        "items": [
            {
                "id": s["id"], "label": s["label"],
                "gsc_ready": bool(s.get("gsc")),
                "ga4_ready": bool(s.get("ga4")),
                "gsc": s.get("gsc"),
            }
            for s in sites
        ]
    }


@router.get("/config")
async def get_config(user=Depends(get_current_user)):
    """Etat de la configuration. Premier endroit a consulter en cas de souci."""
    sa_present = bool(os.environ.get("GOOGLE_SA_JSON_B64"))
    sa_email = None
    if sa_present:
        try:
            info = json.loads(base64.b64decode(os.environ["GOOGLE_SA_JSON_B64"]))
            sa_email = info.get("client_email")
        except Exception:
            sa_email = "illisible - verifie l'encodage base64"

    try:
        sites = _load_sites()
    except HTTPException:
        sites = []

    return {
        "service_account_configured": sa_present,
        "service_account_email": sa_email,
        "sites_count": len(sites),
        "sites": [
            {
                "id": s["id"], "label": s["label"],
                "gsc": s.get("gsc"), "ga4": s.get("ga4"),
                "gsc_ready": bool(sa_present and s.get("gsc")),
                "ga4_ready": bool(sa_present and s.get("ga4")),
            }
            for s in sites
        ],
        "ready": bool(sa_present and sites),
        "gsc_lag_days": GSC_LAG_DAYS,
        "periods": list(PERIOD_DAYS.keys()),
    }


# ============================================================
# Routes - Search Console
# ============================================================


@router.get("/gsc/overview")
async def gsc_overview(
    period: str = Query("28d"),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    """Totaux clics / impressions / CTR / position, avec variation."""
    site = _get_site(site_id)
    site_url = _require_gsc(site)
    start, end = _resolve_period(period, lag=GSC_LAG_DAYS)
    prev_start, prev_end = _previous_period(start, end)

    current_rows = await _gsc_query(site_url, start, end, dimensions=["date"], row_limit=500)
    previous_rows = await _gsc_query(site_url, prev_start, prev_end, dimensions=["date"], row_limit=500)

    current = _gsc_totals(current_rows)
    previous = _gsc_totals(previous_rows)

    return {
        "site_id": site["id"],
        "period": period,
        "range": {"start": start, "end": end},
        "previous_range": {"start": prev_start, "end": prev_end},
        "current": current,
        "previous": previous,
        "delta": {
            "clicks": _delta(current["clicks"], previous["clicks"]),
            "impressions": _delta(current["impressions"], previous["impressions"]),
            "ctr": _delta(current["ctr"], previous["ctr"]),
            # Position : baisse du chiffre = progression, on inverse le signe
            "position": _delta(previous["position"], current["position"]),
        },
    }


@router.get("/gsc/timeseries")
async def gsc_timeseries(
    period: str = Query("28d"),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    site = _get_site(site_id)
    site_url = _require_gsc(site)
    start, end = _resolve_period(period, lag=GSC_LAG_DAYS)
    rows = await _gsc_query(site_url, start, end, dimensions=["date"], row_limit=1000)

    series = [
        {
            "date": r["keys"][0],
            "clicks": int(r.get("clicks", 0)),
            "impressions": int(r.get("impressions", 0)),
            "ctr": round(r.get("ctr", 0) * 100, 2),
            "position": round(r.get("position", 0), 1),
        }
        for r in rows
    ]
    series.sort(key=lambda x: x["date"])
    return {"period": period, "range": {"start": start, "end": end}, "series": series}


@router.get("/gsc/queries")
async def gsc_queries(
    period: str = Query("28d"),
    limit: int = Query(50, le=500),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    """
    Requetes de recherche.

    opportunity_score repere les requetes tres vues mais peu cliquees,
    deja positionnees dans le top 20 : retravailler le title et la meta
    description y rapporte vite, la page etant deja visible.
    """
    site = _get_site(site_id)
    site_url = _require_gsc(site)
    start, end = _resolve_period(period, lag=GSC_LAG_DAYS)
    rows = await _gsc_query(site_url, start, end, dimensions=["query"], row_limit=limit)

    items = _gsc_rows_to_items(rows, "query")
    for it in items:
        it["opportunity_score"] = (
            round(it["impressions"] * (2 - it["ctr"]) / 100, 1)
            if it["impressions"] > 50 and it["ctr"] < 2 and it["position"] <= 20
            else 0
        )
    return {"period": period, "range": {"start": start, "end": end}, "items": items}


@router.get("/gsc/pages")
async def gsc_pages(
    period: str = Query("28d"),
    limit: int = Query(50, le=500),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    site = _get_site(site_id)
    site_url = _require_gsc(site)
    start, end = _resolve_period(period, lag=GSC_LAG_DAYS)
    rows = await _gsc_query(site_url, start, end, dimensions=["page"], row_limit=limit)
    return {
        "period": period,
        "range": {"start": start, "end": end},
        "items": _gsc_rows_to_items(rows, "page"),
    }


@router.get("/gsc/countries")
async def gsc_countries(
    period: str = Query("28d"),
    limit: int = Query(25, le=250),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    """Repartition par pays. L'API renvoie des codes ISO-3."""
    site = _get_site(site_id)
    site_url = _require_gsc(site)
    start, end = _resolve_period(period, lag=GSC_LAG_DAYS)
    rows = await _gsc_query(site_url, start, end, dimensions=["country"], row_limit=limit)
    items = _gsc_rows_to_items(rows, "country")
    for it in items:
        it["country"] = it["country"].upper()
    return {"period": period, "range": {"start": start, "end": end}, "items": items}


@router.get("/gsc/devices")
async def gsc_devices(
    period: str = Query("28d"),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    site = _get_site(site_id)
    site_url = _require_gsc(site)
    start, end = _resolve_period(period, lag=GSC_LAG_DAYS)
    rows = await _gsc_query(site_url, start, end, dimensions=["device"], row_limit=10)
    return {
        "period": period,
        "range": {"start": start, "end": end},
        "items": _gsc_rows_to_items(rows, "device"),
    }


@router.get("/gsc/page-queries")
async def gsc_page_queries(
    page_url: str = Query(..., description="URL exacte de la page"),
    period: str = Query("28d"),
    limit: int = Query(25, le=100),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    """Requetes amenant du trafic sur une page precise."""
    site = _get_site(site_id)
    site_url = _require_gsc(site)
    start, end = _resolve_period(period, lag=GSC_LAG_DAYS)
    rows = await _gsc_query(
        site_url, start, end, dimensions=["query"], row_limit=limit,
        dimension_filters=[
            {"dimension": "page", "operator": "equals", "expression": page_url}
        ],
    )
    return {"page": page_url, "period": period, "items": _gsc_rows_to_items(rows, "query")}


# ============================================================
# Routes - GA4
# ============================================================

GA4_OVERVIEW_METRICS = [
    "sessions", "totalUsers", "newUsers", "screenPageViews",
    "engagementRate", "averageSessionDuration", "bounceRate",
]


@router.get("/ga4/overview")
async def ga4_overview(
    period: str = Query("28d"),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    site = _get_site(site_id)
    property_id = _require_ga4(site)
    start, end = _resolve_period(period)
    prev_start, prev_end = _previous_period(start, end)

    current_rows = await _ga4_report(property_id, start, end, metrics=GA4_OVERVIEW_METRICS, limit=1)
    previous_rows = await _ga4_report(property_id, prev_start, prev_end, metrics=GA4_OVERVIEW_METRICS, limit=1)

    empty = {m: 0 for m in GA4_OVERVIEW_METRICS}
    current = current_rows[0] if current_rows else empty
    previous = previous_rows[0] if previous_rows else empty

    return {
        "site_id": site["id"],
        "period": period,
        "range": {"start": start, "end": end},
        "current": current,
        "previous": previous,
        "delta": {m: _delta(current.get(m, 0), previous.get(m, 0)) for m in GA4_OVERVIEW_METRICS},
    }


@router.get("/ga4/timeseries")
async def ga4_timeseries(
    period: str = Query("28d"),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    site = _get_site(site_id)
    property_id = _require_ga4(site)
    start, end = _resolve_period(period)
    rows = await _ga4_report(
        property_id, start, end,
        dimensions=["date"],
        metrics=["sessions", "totalUsers", "screenPageViews"],
        limit=1000,
    )

    series = []
    for r in rows:
        raw = str(r.get("date", ""))
        formatted = f"{raw[:4]}-{raw[4:6]}-{raw[6:]}" if len(raw) == 8 else raw
        series.append({
            "date": formatted,
            "sessions": r.get("sessions", 0),
            "users": r.get("totalUsers", 0),
            "pageviews": r.get("screenPageViews", 0),
        })
    series.sort(key=lambda x: x["date"])
    return {"period": period, "range": {"start": start, "end": end}, "series": series}


@router.get("/ga4/sources")
async def ga4_sources(
    period: str = Query("28d"),
    limit: int = Query(25, le=100),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    """D'ou viennent les visiteurs."""
    site = _get_site(site_id)
    property_id = _require_ga4(site)
    start, end = _resolve_period(period)
    rows = await _ga4_report(
        property_id, start, end,
        dimensions=["sessionSource", "sessionMedium"],
        metrics=["sessions", "totalUsers", "engagementRate"],
        limit=limit, order_by_metric="sessions",
    )
    items = [
        {
            "source": r.get("sessionSource", "(direct)"),
            "medium": r.get("sessionMedium", "(none)"),
            "sessions": r.get("sessions", 0),
            "users": r.get("totalUsers", 0),
            "engagement_rate": round(r.get("engagementRate", 0) * 100, 1),
        }
        for r in rows
    ]
    return {"period": period, "items": items}


@router.get("/ga4/pages")
async def ga4_pages(
    period: str = Query("28d"),
    limit: int = Query(25, le=100),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    """Pages les plus vues on-site, avec duree moyenne par vue."""
    site = _get_site(site_id)
    property_id = _require_ga4(site)
    start, end = _resolve_period(period)
    rows = await _ga4_report(
        property_id, start, end,
        dimensions=["pagePath"],
        metrics=["screenPageViews", "activeUsers", "userEngagementDuration"],
        limit=limit, order_by_metric="screenPageViews",
    )
    items = []
    for r in rows:
        views = r.get("screenPageViews", 0)
        duration = r.get("userEngagementDuration", 0)
        items.append({
            "page": r.get("pagePath", "/"),
            "views": views,
            "users": r.get("activeUsers", 0),
            "avg_duration_sec": round(duration / views, 1) if views else 0,
        })
    return {"period": period, "items": items}


@router.get("/ga4/countries")
async def ga4_countries(
    period: str = Query("28d"),
    limit: int = Query(25, le=100),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    site = _get_site(site_id)
    property_id = _require_ga4(site)
    start, end = _resolve_period(period)
    rows = await _ga4_report(
        property_id, start, end,
        dimensions=["country"],
        metrics=["sessions", "totalUsers"],
        limit=limit, order_by_metric="sessions",
    )
    items = [
        {
            "country": r.get("country", "(inconnu)"),
            "sessions": r.get("sessions", 0),
            "users": r.get("totalUsers", 0),
        }
        for r in rows
    ]
    return {"period": period, "items": items}


@router.get("/ga4/realtime")
async def ga4_realtime(site_id: Optional[str] = None, user=Depends(get_current_user)):
    """Utilisateurs actifs sur les 30 dernieres minutes."""
    site = _get_site(site_id)
    property_id = _require_ga4(site)

    def _run():
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.analytics.data_v1beta.types import (
            Dimension, Metric, RunRealtimeReportRequest,
        )

        creds = _load_credentials()
        client = BetaAnalyticsDataClient(credentials=creds)
        request = RunRealtimeReportRequest(
            property=f"properties/{property_id}",
            dimensions=[Dimension(name="unifiedScreenName")],
            metrics=[Metric(name="activeUsers")],
            limit=20,
        )
        response = client.run_realtime_report(request)
        return [
            {
                "page": row.dimension_values[0].value,
                "active_users": int(row.metric_values[0].value),
            }
            for row in response.rows
        ]

    loop = asyncio.get_event_loop()
    try:
        items = await loop.run_in_executor(None, _run)
    except Exception as e:
        logger.error(f"GA4 realtime echoue : {e}")
        raise HTTPException(status_code=502, detail=f"GA4 temps reel : {e}")

    return {"total_active": sum(i["active_users"] for i in items), "items": items}


# ============================================================
# Route combinee
# ============================================================


@router.get("/dashboard")
async def analytics_dashboard(
    period: str = Query("28d"),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    """
    Agrege tout ce dont la page Analytics a besoin.
    Chaque bloc est isole : si GA4 tombe, GSC reste affiche.
    """
    site = _get_site(site_id)
    result: Dict[str, Any] = {
        "site_id": site["id"],
        "site_label": site["label"],
        "period": period,
        "errors": {},
    }

    async def safe(name: str, coro):
        try:
            return await coro
        except HTTPException as e:
            result["errors"][name] = e.detail
            return None
        except Exception as e:
            result["errors"][name] = str(e)
            return None

    sid = site["id"]

    (
        result["gsc_overview"], result["gsc_timeseries"], result["gsc_queries"],
        result["gsc_pages"], result["gsc_countries"], result["gsc_devices"],
    ) = await asyncio.gather(
        safe("gsc_overview", gsc_overview(period, sid, user)),
        safe("gsc_timeseries", gsc_timeseries(period, sid, user)),
        safe("gsc_queries", gsc_queries(period, 25, sid, user)),
        safe("gsc_pages", gsc_pages(period, 25, sid, user)),
        safe("gsc_countries", gsc_countries(period, 15, sid, user)),
        safe("gsc_devices", gsc_devices(period, sid, user)),
    )

    (
        result["ga4_overview"], result["ga4_timeseries"],
        result["ga4_sources"], result["ga4_pages"],
    ) = await asyncio.gather(
        safe("ga4_overview", ga4_overview(period, sid, user)),
        safe("ga4_timeseries", ga4_timeseries(period, sid, user)),
        safe("ga4_sources", ga4_sources(period, 15, sid, user)),
        safe("ga4_pages", ga4_pages(period, 15, sid, user)),
    )

    return result


# ============================================================
# Snapshots quotidiens
# ============================================================
# GSC ne conserve que 16 mois. En archivant chaque jour, le cockpit
# accumule un historique que Google n'a plus.


@router.post("/snapshot")
async def create_snapshot(site_id: Optional[str] = None, user=Depends(get_current_user)):
    """Archive les metriques recentes. A brancher sur un cron quotidien."""
    targets = _load_sites() if site_id is None else [_get_site(site_id)]
    report = []

    for site in targets:
        if not site.get("gsc"):
            continue
        site_url = site["gsc"]
        start, end = _resolve_period("7d", lag=GSC_LAG_DAYS)
        try:
            rows = await _gsc_query(site_url, start, end, dimensions=["date"], row_limit=100)
        except HTTPException as e:
            report.append({"site_id": site["id"], "error": e.detail})
            continue

        for r in rows:
            await db.analytics_snapshots.update_one(
                {"site": site_url, "date": r["keys"][0]},
                {"$set": {
                    "site": site_url,
                    "site_id": site["id"],
                    "date": r["keys"][0],
                    "clicks": int(r.get("clicks", 0)),
                    "impressions": int(r.get("impressions", 0)),
                    "ctr": round(r.get("ctr", 0) * 100, 2),
                    "position": round(r.get("position", 0), 1),
                    "updated_at": datetime.now(timezone.utc),
                }},
                upsert=True,
            )
        report.append({"site_id": site["id"], "stored": len(rows)})

    return {"results": report}


@router.get("/snapshots")
async def list_snapshots(
    site_id: Optional[str] = None,
    days: int = Query(365, le=2000),
    user=Depends(get_current_user),
):
    """Historique archive localement, au-dela de la retention Google."""
    site = _get_site(site_id)
    site_url = _require_gsc(site)
    cutoff = (date.today() - timedelta(days=days)).isoformat()

    cursor = db.analytics_snapshots.find(
        {"site": site_url, "date": {"$gte": cutoff}}, {"_id": 0}
    ).sort("date", 1)
    items = await cursor.to_list(length=2000)
    return {"site_id": site["id"], "count": len(items), "items": items}


# ============================================================
# Insights SEO
# ============================================================


@router.get("/insights")
async def analytics_insights(
    period: str = Query("28d"),
    site_id: Optional[str] = None,
    user=Depends(get_current_user),
):
    """
    Lecture actionnable des donnees Search Console.

    Compare la periode demandee a la precedente pour degager les
    progressions, les chutes, les gains rapides accessibles et les
    pages qui sous-performent en taux de clic.
    """
    from analytics_insights import build_insights

    site = _get_site(site_id)
    site_url = _require_gsc(site)

    start, end = _resolve_period(period, lag=GSC_LAG_DAYS)
    prev_start, prev_end = _previous_period(start, end)

    # Les quatre jeux de donnees necessaires, en parallele
    q_curr_rows, q_prev_rows, p_curr_rows, p_prev_rows = await asyncio.gather(
        _gsc_query(site_url, start, end, dimensions=["query"], row_limit=500),
        _gsc_query(site_url, prev_start, prev_end, dimensions=["query"], row_limit=500),
        _gsc_query(site_url, start, end, dimensions=["page"], row_limit=250),
        _gsc_query(site_url, prev_start, prev_end, dimensions=["page"], row_limit=250),
    )

    overview = await gsc_overview(period, site_id, user)

    insights = build_insights(
        overview=overview,
        queries_current=_gsc_rows_to_items(q_curr_rows, "query"),
        queries_previous=_gsc_rows_to_items(q_prev_rows, "query"),
        pages_current=_gsc_rows_to_items(p_curr_rows, "page"),
        pages_previous=_gsc_rows_to_items(p_prev_rows, "page"),
    )

    return {
        "site_id": site["id"],
        "site_label": site["label"],
        "period": period,
        "range": {"start": start, "end": end},
        "previous_range": {"start": prev_start, "end": prev_end},
        "overview": overview,
        **insights,
    }


# ============================================================
# Index Mongo
# ============================================================


async def register_indexes(database):
    """Appele depuis le startup de server.py."""
    await database.analytics_cache.create_index("created_at", expireAfterSeconds=86400)
    await database.analytics_snapshots.create_index([("site", 1), ("date", 1)], unique=True)
    await database.analytics_snapshots.create_index([("date", -1)])
    logger.info("Index analytics enregistres")
