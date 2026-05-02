"""
Module Tasks - Industrial Decision Cockpit
=============================================

A integrer dans server.py via :

    from tasks_module import router as tasks_router, register_indexes as tasks_register_indexes
    api_router.include_router(tasks_router)

    # Dans le startup event :
    @app.on_event("startup")
    async def startup():
        await tasks_register_indexes(db)

Le router utilise un prefix relatif "/tasks" qui sera attache a api_router (deja en /api),
donnant des routes finales /api/tasks/...
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional, Literal
import uuid

# ============================================================
# State du module - rempli par init() depuis server.py
# Resout l'import circulaire (server importe tasks_module au chargement,
# donc db et get_current_user ne sont pas encore definis a ce moment-la)
# ============================================================
from fastapi import Request as _Request

db = None
_real_get_current_user = None


def init(database, auth_dependency):
    """Appele par server.py APRES que db et get_current_user soient definis."""
    global db, _real_get_current_user
    db = database
    _real_get_current_user = auth_dependency


async def get_current_user(request: _Request):
    """Wrapper qui defere l'auth au vrai get_current_user de server.py."""
    if _real_get_current_user is None:
        raise HTTPException(500, "tasks_module not initialized - call init() in server.py")
    return await _real_get_current_user(request)


# ============================================================
# Constantes
# ============================================================
TASK_CHANNELS = ["email", "phone", "linkedin", "meeting", "other"]
TASK_STATUSES = ["pending", "done", "snoozed", "cancelled"]
TASK_PRIORITIES = ["low", "medium", "high"]

DEFAULT_TEMPLATES = {
    "cold_initial": {"label": "Cold email initial", "channel": "email"},
    "relance_1_soft": {"label": "Relance 1 - Bump leger (J+3)", "channel": "email"},
    "relance_2_value": {"label": "Relance 2 - Apport de valeur (J+7)", "channel": "email"},
    "relance_3_pivot": {"label": "Relance 3 - Pivot d'angle (J+14)", "channel": "email"},
    "breakup": {"label": "Breakup - Derniere relance (J+21)", "channel": "email"},
    "linkedin_connect": {"label": "LinkedIn - Demande de connexion", "channel": "linkedin"},
    "phone_call": {"label": "Appel telephonique", "channel": "phone"},
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ============================================================
# Pydantic models
# ============================================================
class TaskCreate(BaseModel):
    prospect_id: str
    contact_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    channel: Literal["email", "phone", "linkedin", "meeting", "other"]
    due_date: datetime
    duration_minutes: Optional[int] = None
    priority: Literal["low", "medium", "high"] = "medium"
    template_suggested: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    channel: Optional[Literal["email", "phone", "linkedin", "meeting", "other"]] = None
    due_date: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    priority: Optional[Literal["low", "medium", "high"]] = None
    template_suggested: Optional[str] = None


class TaskComplete(BaseModel):
    outcome: Optional[str] = None
    notes_outcome: Optional[str] = None
    create_followup: bool = False
    followup_days: Optional[int] = 3
    followup_channel: Optional[str] = "email"
    followup_template: Optional[str] = None
    followup_title: Optional[str] = None


class TaskSnooze(BaseModel):
    new_due_date: datetime
    reason: Optional[str] = None


# ============================================================
# Router (prefix relatif - sera attache a api_router)
# ============================================================
router = APIRouter(prefix="/tasks", tags=["tasks"])


async def register_indexes(database):
    """Appelle ca au startup pour creer les index necessaires."""
    await database.tasks.create_index([("user_id", 1), ("due_date", 1)])
    await database.tasks.create_index([("user_id", 1), ("status", 1), ("due_date", 1)])
    await database.tasks.create_index([("prospect_id", 1)])
    await database.tasks.create_index([("status", 1), ("due_date", 1)])


def _serialize(t: dict) -> dict:
    if not t:
        return None
    t.pop("_id", None)
    for key in ("due_date", "created_at", "updated_at", "completed_at"):
        if key in t and isinstance(t[key], datetime):
            t[key] = t[key].isoformat()
    return t


async def _enrich(t: dict) -> dict:
    t = _serialize(t)
    if t and t.get("prospect_id"):
        ent = await db.entreprises.find_one(
            {"id": t["prospect_id"]},
            {"nom": 1, "ville": 1, "secteur_id": 1, "_id": 0}
        )
        t["prospect"] = ent or {"nom": "(supprime)"}
    if t and t.get("contact_id"):
        ct = await db.contacts.find_one(
            {"id": t["contact_id"]},
            {"prenom": 1, "nom": 1, "email": 1, "_id": 0}
        )
        t["contact"] = ct
    return t


# ============================================================
# CRUD Endpoints
# ============================================================
@router.post("")
async def create_task(payload: TaskCreate, user=Depends(get_current_user)):
    task = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "prospect_id": payload.prospect_id,
        "contact_id": payload.contact_id,
        "title": payload.title,
        "description": payload.description,
        "channel": payload.channel,
        "due_date": payload.due_date,
        "duration_minutes": payload.duration_minutes,
        "priority": payload.priority,
        "template_suggested": payload.template_suggested,
        "status": "pending",
        "outcome": None,
        "notes_outcome": None,
        "completed_at": None,
        "created_from": "manual",
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.tasks.insert_one(task)
    return await _enrich(task)


@router.get("")
async def list_tasks(
    status: Optional[str] = Query(None),
    prospect_id: Optional[str] = None,
    channel: Optional[str] = None,
    due_before: Optional[datetime] = None,
    due_after: Optional[datetime] = None,
    limit: int = Query(500, le=2000),
    user=Depends(get_current_user),
):
    q = {"user_id": user["id"]}
    if status: q["status"] = status
    if prospect_id: q["prospect_id"] = prospect_id
    if channel: q["channel"] = channel
    date_filter = {}
    if due_before: date_filter["$lte"] = due_before
    if due_after: date_filter["$gte"] = due_after
    if date_filter: q["due_date"] = date_filter

    cursor = db.tasks.find(q).sort("due_date", 1).limit(limit)
    tasks = await cursor.to_list(length=limit)
    return [await _enrich(t) for t in tasks]


@router.get("/today")
async def tasks_today(user=Depends(get_current_user)):
    today_end = now_utc().replace(hour=23, minute=59, second=59, microsecond=0)
    cursor = db.tasks.find({
        "user_id": user["id"],
        "status": "pending",
        "due_date": {"$lte": today_end}
    }).sort("due_date", 1)
    tasks = await cursor.to_list(length=200)
    return [await _enrich(t) for t in tasks]


@router.get("/upcoming")
async def tasks_upcoming(days: int = 7, user=Depends(get_current_user)):
    horizon = now_utc() + timedelta(days=days)
    cursor = db.tasks.find({
        "user_id": user["id"],
        "status": "pending",
        "due_date": {"$lte": horizon}
    }).sort("due_date", 1)
    tasks = await cursor.to_list(length=500)
    return [await _enrich(t) for t in tasks]


@router.get("/calendar")
async def tasks_calendar(
    from_date: datetime = Query(..., alias="from"),
    to_date: datetime = Query(..., alias="to"),
    include_done: bool = True,
    user=Depends(get_current_user),
):
    statuses = ["pending", "snoozed"]
    if include_done:
        statuses.append("done")
    cursor = db.tasks.find({
        "user_id": user["id"],
        "status": {"$in": statuses},
        "due_date": {"$gte": from_date, "$lte": to_date}
    }).sort("due_date", 1)
    tasks = await cursor.to_list(length=2000)
    return [await _enrich(t) for t in tasks]


@router.get("/stats")
async def tasks_stats(user=Depends(get_current_user)):
    today_start = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    week_end = today_start + timedelta(days=7)

    pipeline = [
        {"$match": {"user_id": user["id"]}},
        {"$facet": {
            "by_status": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}],
            "today": [
                {"$match": {"status": "pending", "due_date": {"$lt": today_end}}},
                {"$count": "n"}
            ],
            "overdue": [
                {"$match": {"status": "pending", "due_date": {"$lt": today_start}}},
                {"$count": "n"}
            ],
            "this_week": [
                {"$match": {"status": "pending", "due_date": {"$gte": today_start, "$lt": week_end}}},
                {"$count": "n"}
            ],
            "completed_today": [
                {"$match": {"status": "done", "completed_at": {"$gte": today_start, "$lt": today_end}}},
                {"$count": "n"}
            ],
        }}
    ]
    result = await db.tasks.aggregate(pipeline).to_list(length=1)
    if not result:
        return {"by_status": {}, "today": 0, "overdue": 0, "this_week": 0, "completed_today": 0}
    r = result[0]
    return {
        "by_status": {x["_id"]: x["count"] for x in r["by_status"]},
        "today": r["today"][0]["n"] if r["today"] else 0,
        "overdue": r["overdue"][0]["n"] if r["overdue"] else 0,
        "this_week": r["this_week"][0]["n"] if r["this_week"] else 0,
        "completed_today": r["completed_today"][0]["n"] if r["completed_today"] else 0,
    }


@router.get("/templates/list")
async def list_templates(user=Depends(get_current_user)):
    return DEFAULT_TEMPLATES


@router.get("/{task_id}")
async def get_task(task_id: str, user=Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id, "user_id": user["id"]})
    if not task:
        raise HTTPException(404, "Task not found")
    return await _enrich(task)


@router.patch("/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, user=Depends(get_current_user)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Empty payload")
    update["updated_at"] = now_utc()
    res = await db.tasks.update_one(
        {"id": task_id, "user_id": user["id"]},
        {"$set": update}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Task not found")
    task = await db.tasks.find_one({"id": task_id})
    return await _enrich(task)


@router.post("/{task_id}/complete")
async def complete_task(task_id: str, payload: TaskComplete, user=Depends(get_current_user)):
    task = await db.tasks.find_one({"id": task_id, "user_id": user["id"]})
    if not task:
        raise HTTPException(404, "Task not found")

    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {
            "status": "done",
            "outcome": payload.outcome,
            "notes_outcome": payload.notes_outcome,
            "completed_at": now_utc(),
            "updated_at": now_utc(),
        }}
    )

    # Logue une interaction si la collection existe
    try:
        await db.interactions.insert_one({
            "id": str(uuid.uuid4()),
            "entreprise_id": task["prospect_id"],
            "contact_id": task.get("contact_id"),
            "type": f"task_completed_{task['channel']}",
            "channel": task["channel"],
            "outcome": payload.outcome,
            "description": f"{task['title']} - {payload.notes_outcome or ''}".strip(" -"),
            "user_id": user["id"],
            "created_at": now_utc(),
        })
    except Exception:
        pass

    followup_task = None
    if payload.create_followup and payload.followup_days is not None:
        new_due = now_utc() + timedelta(days=payload.followup_days)
        followup = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "prospect_id": task["prospect_id"],
            "contact_id": task.get("contact_id"),
            "title": payload.followup_title or f"Relance - {task['title']}",
            "description": None,
            "channel": payload.followup_channel or "email",
            "due_date": new_due,
            "duration_minutes": None,
            "priority": task.get("priority", "medium"),
            "template_suggested": payload.followup_template,
            "status": "pending",
            "outcome": None,
            "notes_outcome": None,
            "completed_at": None,
            "created_from": "auto_followup",
            "created_at": now_utc(),
            "updated_at": now_utc(),
        }
        await db.tasks.insert_one(followup)
        followup_task = await _enrich(followup)

    completed = await db.tasks.find_one({"id": task_id})
    return {
        "completed": await _enrich(completed),
        "followup": followup_task,
    }


@router.post("/{task_id}/snooze")
async def snooze_task(task_id: str, payload: TaskSnooze, user=Depends(get_current_user)):
    res = await db.tasks.update_one(
        {"id": task_id, "user_id": user["id"]},
        {"$set": {
            "due_date": payload.new_due_date,
            "status": "pending",
            "updated_at": now_utc(),
        }}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Task not found")
    task = await db.tasks.find_one({"id": task_id})
    return await _enrich(task)


@router.delete("/{task_id}")
async def delete_task(task_id: str, user=Depends(get_current_user)):
    res = await db.tasks.update_one(
        {"id": task_id, "user_id": user["id"]},
        {"$set": {"status": "cancelled", "updated_at": now_utc()}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Task not found")
    return {"status": "cancelled"}
