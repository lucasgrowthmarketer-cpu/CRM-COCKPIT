"""
Module Plaquette - Industrial Decision Cockpit
==================================================

A integrer dans server.py :

    from plaquette_routes import router as plaquette_router
    api_router.include_router(plaquette_router)

Le PDF doit etre place dans backend/assets/plaquette.pdf
"""
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse

from fastapi import Request as _Request

_real_get_current_user = None


def init(auth_dependency):
    """Appele par server.py APRES que get_current_user soit defini."""
    global _real_get_current_user
    _real_get_current_user = auth_dependency


async def get_current_user(request: _Request):
    """Wrapper qui defere l'auth au vrai get_current_user de server.py."""
    if _real_get_current_user is None:
        raise HTTPException(500, "plaquette_routes not initialized")
    return await _real_get_current_user(request)

# ============================================================
# Configuration
# ============================================================
PLAQUETTE_PATH = Path(__file__).parent / "assets" / "plaquette.pdf"
PLAQUETTE_VERSION = "v2"
PLAQUETTE_DATE = "2026-04-30"
PLAQUETTE_FILENAME = "Industrial_Decision_Plaquette.pdf"

# Router avec prefix relatif - sera attache a api_router (deja en /api)
router = APIRouter(prefix="/plaquette", tags=["plaquette"])


@router.get("/info")
async def plaquette_info(user=Depends(get_current_user)):
    if not PLAQUETTE_PATH.exists():
        raise HTTPException(404, "Plaquette non disponible sur le serveur")

    stat = PLAQUETTE_PATH.stat()
    size_kb = round(stat.st_size / 1024, 1)
    modified = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d")

    return {
        "version": PLAQUETTE_VERSION,
        "date": PLAQUETTE_DATE,
        "modified_at": modified,
        "size_kb": size_kb,
        "filename": PLAQUETTE_FILENAME,
        "available": True,
    }


@router.get("/download")
async def plaquette_download(user=Depends(get_current_user)):
    if not PLAQUETTE_PATH.exists():
        raise HTTPException(404, "Plaquette non disponible sur le serveur")

    return FileResponse(
        path=str(PLAQUETTE_PATH),
        media_type="application/pdf",
        filename=PLAQUETTE_FILENAME,
        headers={
            "Content-Disposition": f'attachment; filename="{PLAQUETTE_FILENAME}"',
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.get("/preview")
async def plaquette_preview(user=Depends(get_current_user)):
    if not PLAQUETTE_PATH.exists():
        raise HTTPException(404, "Plaquette non disponible sur le serveur")

    return FileResponse(
        path=str(PLAQUETTE_PATH),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{PLAQUETTE_FILENAME}"',
            "Cache-Control": "public, max-age=3600",
        },
    )
