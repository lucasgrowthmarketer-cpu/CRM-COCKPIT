#!/usr/bin/env python3
"""
Correctif du proxy d'authentification du module analytics.

Le proxy utilisait une signature (*args, **kwargs) ; FastAPI inspecte la
signature des dependencies et prenait donc 'args' et 'kwargs' pour des
query params obligatoires, d'ou l'erreur "Field required".

server.py declare : async def get_current_user(request: Request) -> dict
Le proxy adopte la meme signature.

A lancer depuis la racine du repo :
    python3 fix_auth_proxy.py
"""

from pathlib import Path
import sys

TARGET = Path("cockpit/backend/analytics_module.py")

OLD = '''async def get_current_user(*args, **kwargs):
    if _real_get_current_user is None:
        raise HTTPException(status_code=503, detail="Module analytics non initialise")
    return await _real_get_current_user(*args, **kwargs)'''

NEW = '''async def get_current_user(request: Request) -> dict:
    """
    Proxy vers la dependency d'auth de server.py.

    La signature doit correspondre exactement a celle de server.py :
    FastAPI inspecte la signature des dependencies pour construire le
    schema de la requete. Une signature generique (*args, **kwargs) serait
    interpretee comme des query params obligatoires.
    """
    if _real_get_current_user is None:
        raise HTTPException(status_code=503, detail="Module analytics non initialise")
    return await _real_get_current_user(request)'''

OLD_IMPORT = "from fastapi import APIRouter, HTTPException, Depends, Query"
NEW_IMPORT = "from fastapi import APIRouter, HTTPException, Depends, Query, Request"


def main():
    if not TARGET.exists():
        print(f"ERREUR : {TARGET} introuvable.")
        print("Lance le script depuis la racine de CRM-COCKPIT.")
        sys.exit(1)

    content = TARGET.read_text()

    if "async def get_current_user(request: Request)" in content:
        print("Deja corrige, rien a faire.")
        return

    if OLD not in content:
        print("ERREUR : le bloc a remplacer est introuvable.")
        print("Remplace manuellement la fonction get_current_user par :")
        print()
        print(NEW)
        sys.exit(1)

    content = content.replace(OLD, NEW, 1)

    if "Request" not in content.split("\n")[0:60][0] and OLD_IMPORT in content:
        content = content.replace(OLD_IMPORT, NEW_IMPORT, 1)

    TARGET.write_text(content)
    print("Corrige : cockpit/backend/analytics_module.py")
    print()
    print("Verifie avec : git diff cockpit/backend/analytics_module.py")
    print()
    print("Puis :")
    print("  git add -A")
    print('  git commit -m "fix: signature du proxy auth analytics"')
    print("  git push")


if __name__ == "__main__":
    main()
