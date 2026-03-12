"""
LifeOS Database Layer
======================
All Supabase interactions go through this file.
Clean separation: bot.py never calls Supabase directly.

Portfolio note: This is the Repository Pattern —
your data access logic is isolated from your business logic.
Swap Supabase for any other DB by only changing this file.
"""

import os
from datetime import date, datetime
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

supabase: Client = create_client(
    os.getenv("SUPABASE_URL", ""),
    os.getenv("SUPABASE_KEY", "")
)


# ─── PROJECTS ─────────────────────────────────────────────────────────────────

def get_all_projects() -> list:
    result = supabase.table("projects").select("*, tasks(*)").eq("status", "active").execute()
    return result.data or []


def create_project(data: dict) -> dict:
    result = supabase.table("projects").insert(data).execute()
    return result.data[0] if result.data else {}


def update_project_progress(project_id: str, progress: int):
    supabase.table("projects").update({"progress": progress}).eq("id", project_id).execute()


# ─── TASKS ────────────────────────────────────────────────────────────────────

def get_pending_tasks() -> list:
    result = supabase.table("tasks").select("*, projects(title, area_id)").eq("done", False).execute()
    return result.data or []


def get_todays_tasks() -> list:
    today = date.today().isoformat()
    result = (
        supabase.table("tasks")
        .select("*, projects(title, area_id)")
        .eq("done", False)
        .lte("due_date", today)
        .execute()
    )
    return result.data or []


def create_task(data: dict) -> dict:
    result = supabase.table("tasks").insert(data).execute()
    return result.data[0] if result.data else {}


def complete_task(task_id: str) -> dict:
    result = (
        supabase.table("tasks")
        .update({"done": True, "completed_at": datetime.now().isoformat()})
        .eq("id", task_id)
        .execute()
    )
    return result.data[0] if result.data else {}


def create_tasks_bulk(tasks: list) -> list:
    if not tasks:
        return []
    result = supabase.table("tasks").insert(tasks).execute()
    return result.data or []


# ─── SCHEDULE ─────────────────────────────────────────────────────────────────

def get_todays_schedule() -> dict | None:
    today = date.today().isoformat()
    result = supabase.table("daily_schedules").select("*").eq("date", today).execute()
    return result.data[0] if result.data else None


def save_schedule(blocks: list) -> dict:
    today = date.today().isoformat()
    # Upsert — replace if exists
    result = supabase.table("daily_schedules").upsert({
        "date": today,
        "blocks": blocks,
        "generated_at": datetime.now().isoformat()
    }).execute()
    return result.data[0] if result.data else {}


# ─── XP & GAMIFICATION ───────────────────────────────────────────────────────

XP_REWARDS = {"easy": 10, "medium": 25, "hard": 50, "deep_work": 40}
LEVELS = [0, 200, 500, 900, 1400, 2000, 2700, 3500, 4500, 6000]


def award_xp(amount: int, reason: str, task_id: str = None) -> dict:
    """Award XP and update user stats. Returns updated stats."""
    # Log the XP
    supabase.table("xp_log").insert({
        "amount": amount,
        "reason": reason,
        "task_id": task_id
    }).execute()

    # Get current stats
    stats = get_user_stats()
    new_xp = stats["total_xp"] + amount
    new_level = _xp_to_level(new_xp)

    # Update stats
    supabase.table("user_stats").update({
        "total_xp": new_xp,
        "level": new_level,
        "updated_at": datetime.now().isoformat()
    }).eq("id", 1).execute()

    return {**stats, "total_xp": new_xp, "level": new_level, "xp_gained": amount}


def _xp_to_level(xp: int) -> int:
    level = 1
    for i, threshold in enumerate(LEVELS):
        if xp >= threshold:
            level = i + 1
        else:
            break
    return level


def get_user_stats() -> dict:
    result = supabase.table("user_stats").select("*").eq("id", 1).execute()
    if result.data:
        return result.data[0]
    # Create default if not exists
    default = {"id": 1, "total_xp": 0, "level": 1, "current_streak": 0, "longest_streak": 0}
    supabase.table("user_stats").insert(default).execute()
    return default


def update_streak(completed_today: bool) -> dict:
    stats = get_user_stats()
    if completed_today:
        new_streak = stats["current_streak"] + 1
        longest = max(new_streak, stats["longest_streak"])
    else:
        new_streak = 0
        longest = stats["longest_streak"]

    supabase.table("user_stats").update({
        "current_streak": new_streak,
        "longest_streak": longest,
    }).eq("id", 1).execute()

    return {**stats, "current_streak": new_streak, "longest_streak": longest}


# ─── ANALYTICS ────────────────────────────────────────────────────────────────

def get_todays_summary() -> dict:
    today = date.today().isoformat()

    # Tasks completed today
    completed = (
        supabase.table("tasks")
        .select("*, projects(title, area_id)")
        .eq("done", True)
        .gte("completed_at", f"{today}T00:00:00")
        .execute()
    )

    # XP earned today
    xp_today = (
        supabase.table("xp_log")
        .select("amount")
        .gte("created_at", f"{today}T00:00:00")
        .execute()
    )

    total_xp_today = sum(r["amount"] for r in (xp_today.data or []))
    tasks_done = completed.data or []

    return {
        "date": today,
        "tasks_completed": len(tasks_done),
        "xp_earned": total_xp_today,
        "completed_tasks": tasks_done,
    }
