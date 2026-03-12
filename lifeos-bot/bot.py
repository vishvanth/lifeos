"""
LifeOS Telegram Bot
====================
Your AI personal chief-of-staff in your pocket.

Commands:
  /start     - Onboarding
  /today     - Show today's schedule
  /add       - Add a task/goal via natural language
  /done      - Mark a task complete
  /behind    - Emergency reschedule
  /stats     - Show XP, level, streak
  /life      - Bird's eye view of all projects
"""

import os
import asyncio
import logging
from datetime import date, time
from dotenv import load_dotenv

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters
)

import ai
import db

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def format_schedule_block(block: dict) -> str:
    icons = {"deep": "🔵", "medium": "🟡", "quick": "🟢", "break": "☕", "meal": "🍽", "reflection": "🌙"}
    icon = icons.get(block.get("type", ""), "▸")
    return f"{icon} {block['time']}–{block['end']}  {block['title']}"


def format_xp_bar(xp: int, level: int) -> str:
    levels = [0, 200, 500, 900, 1400, 2000, 2700, 3500, 4500, 6000]
    next_xp = levels[level] if level < len(levels) else levels[-1]
    prev_xp = levels[level - 1] if level > 0 else 0
    pct = int(((xp - prev_xp) / max(next_xp - prev_xp, 1)) * 10)
    bar = "█" * pct + "░" * (10 - pct)
    return f"Lvl {level} [{bar}] {xp}/{next_xp} XP"


# ─── COMMAND HANDLERS ─────────────────────────────────────────────────────────

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    stats = db.get_user_stats()
    await update.message.reply_text(
        f"👋 Welcome to *LifeOS* — your AI chief of staff.\n\n"
        f"I'll help you:\n"
        f"• Capture goals in plain language\n"
        f"• Plan your day automatically\n"
        f"• Keep you accountable with check-ins\n"
        f"• Track your progress and XP\n\n"
        f"*Quick commands:*\n"
        f"/today — see your schedule\n"
        f"/add — add a goal or task\n"
        f"/stats — your XP and level\n"
        f"/life — bird's eye view\n"
        f"/behind — emergency reschedule\n\n"
        f"Or just type anything — I understand plain English. 🎯",
        parse_mode="Markdown"
    )


async def today(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show today's AI-generated schedule"""
    await update.message.reply_text("⏳ Generating your schedule...")

    schedule = db.get_todays_schedule()
    stats = db.get_user_stats()

    if not schedule:
        # Generate fresh schedule
        projects = db.get_all_projects()
        tasks = db.get_pending_tasks()
        try:
            blocks = await ai.generate_daily_schedule(projects, tasks, date.today().isoformat())
            db.save_schedule(blocks)
        except Exception as e:
            await update.message.reply_text(f"❌ Couldn't generate schedule: {e}\nCheck your AI provider config.")
            return
    else:
        blocks = schedule["blocks"]

    xp_bar = format_xp_bar(stats["total_xp"], stats["level"])
    streak = stats["current_streak"]

    lines = [
        f"🌅 *Today — {date.today().strftime('%A, %d %b')}*",
        f"",
        f"⚡ {xp_bar}",
        f"🔥 Streak: {streak} days",
        f"",
        f"*Your schedule:*",
    ]

    for block in blocks:
        lines.append(format_schedule_block(block))

    deep_blocks = [b for b in blocks if b.get("type") == "deep"]
    lines.append(f"\n📌 {len(deep_blocks)} deep work blocks · Let's go 💪")

    keyboard = [
        [InlineKeyboardButton("✅ Ready, let's start", callback_data="start_day")],
        [InlineKeyboardButton("🔄 Regenerate schedule", callback_data="regen_schedule")],
    ]
    await update.message.reply_text(
        "\n".join(lines),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def add_goal(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Add a goal via natural language"""
    user_text = " ".join(context.args) if context.args else None

    if not user_text:
        await update.message.reply_text(
            "💬 Tell me what you need to do in plain English.\n\n"
            "Example:\n"
            "_/add I have CNN coursework due March 20, need to implement the model and write the report_",
            parse_mode="Markdown"
        )
        return

    await update.message.reply_text("🧠 Analysing your goal...")

    try:
        projects = db.get_all_projects()
        extracted = await ai.extract_goal_from_text(user_text, projects)
    except Exception as e:
        await update.message.reply_text(f"❌ AI extraction failed: {e}")
        return

    # If AI needs clarification
    if extracted.get("clarifying_questions"):
        questions = "\n".join(f"• {q}" for q in extracted["clarifying_questions"])
        context.user_data["pending_goal"] = extracted
        context.user_data["pending_goal_text"] = user_text
        await update.message.reply_text(
            f"🤔 I need a bit more info:\n\n{questions}\n\n"
            f"Reply with the answers and I'll add it.",
            parse_mode="Markdown"
        )
        return

    # Save to database
    try:
        project = db.create_project({
            "area_id": extracted.get("area_id", "admin"),
            "title": extracted.get("title", "Untitled"),
            "deadline": extracted.get("deadline"),
            "priority": extracted.get("priority", "medium"),
            "urgency": extracted.get("urgency", "medium"),
            "estimated_hours": extracted.get("estimated_hours", 1),
            "difficulty": extracted.get("difficulty", "medium"),
            "progress": 0,
            "status": "active",
        })

        # Save tasks
        tasks_to_create = []
        for t in extracted.get("tasks", []):
            tasks_to_create.append({
                "project_id": project["id"],
                "title": t.get("title"),
                "task_type": t.get("type", "general"),
                "estimated_mins": t.get("estimated_mins", 30),
                "difficulty": t.get("difficulty", "medium"),
                "due_date": t.get("due_date"),
                "done": False,
            })
        if tasks_to_create:
            db.create_tasks_bulk(tasks_to_create)

        # Workload calculation
        hours = extracted.get("estimated_hours", 0)
        deadline = extracted.get("deadline")
        workload_msg = ""
        if hours and deadline:
            deadline_date = date.fromisoformat(deadline)
            days_left = (deadline_date - date.today()).days
            if days_left > 0:
                hrs_per_day = round(hours / days_left, 1)
                workload_msg = f"\n📅 *{days_left} days left → {hrs_per_day}h/day recommended*"

        task_list = "\n".join(f"  • {t['title']}" for t in extracted.get("tasks", []))

        await update.message.reply_text(
            f"✅ *{extracted['title']}* added!\n\n"
            f"📁 {extracted.get('area_id', 'admin').title()}\n"
            f"🎯 Priority: {extracted.get('priority', 'medium')}\n"
            f"⏱ Est. {hours}h total\n"
            f"{workload_msg}\n\n"
            f"*Tasks created:*\n{task_list}\n\n"
            f"I'll include this in tomorrow's schedule. 🗓",
            parse_mode="Markdown"
        )

    except Exception as e:
        await update.message.reply_text(f"❌ Failed to save: {e}")


async def done_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Mark a task as complete, award XP"""
    tasks = db.get_pending_tasks()

    if not tasks:
        await update.message.reply_text("🎉 No pending tasks! You're all caught up.")
        return

    # Show top 8 pending tasks as buttons
    keyboard = []
    for task in tasks[:8]:
        project_title = task.get("projects", {}).get("title", "") if task.get("projects") else ""
        label = f"{task['title'][:35]}{'...' if len(task['title']) > 35 else ''}"
        keyboard.append([InlineKeyboardButton(label, callback_data=f"complete_{task['id']}_{task['difficulty']}")])

    await update.message.reply_text(
        "✅ Which task did you complete?",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show XP, level, streak"""
    stats = db.get_user_stats()
    summary = db.get_todays_summary()

    xp_bar = format_xp_bar(stats["total_xp"], stats["level"])

    await update.message.reply_text(
        f"⚡ *Your Stats*\n\n"
        f"{xp_bar}\n\n"
        f"🔥 Streak: *{stats['current_streak']} days* (best: {stats['longest_streak']})\n"
        f"✅ Today: *{summary['tasks_completed']} tasks* done\n"
        f"💰 XP today: *+{summary['xp_earned']}*\n\n"
        f"📊 Productivity: {stats.get('productivity_score', 0)}/100\n"
        f"🎯 Focus: {stats.get('focus_score', 0)}/100",
        parse_mode="Markdown"
    )


async def life_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Bird's eye view of all projects"""
    projects = db.get_all_projects()

    if not projects:
        await update.message.reply_text(
            "📭 No projects yet.\n\nUse /add to create your first goal!"
        )
        return

    area_icons = {
        "work": "◈", "study": "◉", "health": "◎", "social": "◍",
        "hobbies": "◌", "selfcare": "◐", "sleep": "◑", "meals": "◒",
        "growth": "◓", "admin": "□"
    }

    lines = ["🗂 *Your Life at a Glance*\n"]
    for p in projects:
        icon = area_icons.get(p.get("area_id", ""), "▸")
        progress = p.get("progress", 0)
        bar_filled = int(progress / 10)
        bar = "█" * bar_filled + "░" * (10 - bar_filled)
        deadline = p.get("deadline", "no deadline")
        tasks_total = len(p.get("tasks", []))
        tasks_done = sum(1 for t in p.get("tasks", []) if t.get("done"))

        lines.append(
            f"{icon} *{p['title']}*\n"
            f"   [{bar}] {progress}%  ·  {tasks_done}/{tasks_total} tasks\n"
            f"   📅 {deadline}\n"
        )

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def behind_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Emergency reschedule flow"""
    keyboard = [
        [InlineKeyboardButton("😴 Slept in / late start", callback_data="behind_slept")],
        [InlineKeyboardButton("🤒 Feeling unwell", callback_data="behind_unwell")],
        [InlineKeyboardButton("🔥 Overwhelmed", callback_data="behind_overwhelmed")],
        [InlineKeyboardButton("📱 Got distracted", callback_data="behind_distracted")],
    ]
    await update.message.reply_text(
        "💬 It happens. What's going on?",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ─── NATURAL LANGUAGE FALLBACK ────────────────────────────────────────────────

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle any plain text message — route to AI"""
    text = update.message.text.lower()

    # Simple intent detection before calling AI (saves API calls)
    if any(word in text for word in ["add", "need to", "have to", "due", "deadline", "finish", "complete"]):
        context.args = update.message.text.split()
        await add_goal(update, context)
        return

    if any(word in text for word in ["today", "schedule", "plan", "what should"]):
        await today(update, context)
        return

    if any(word in text for word in ["behind", "overwhelmed", "stressed", "help"]):
        await behind_command(update, context)
        return

    # General AI chat
    stats = db.get_user_stats()
    projects = db.get_all_projects()
    project_titles = [p["title"] for p in projects]

    system = f"""You are LifeOS, a supportive AI productivity coach.
User's active projects: {project_titles}
User level: {stats.get('level', 1)}, streak: {stats.get('current_streak', 0)} days.
Be concise (3-4 sentences max), warm, and practical."""

    try:
        response = await ai.chat(
            messages=[{"role": "user", "content": update.message.text}],
            system=system
        )
        await update.message.reply_text(response)
    except Exception as e:
        await update.message.reply_text(f"❌ AI error: {e}\nCheck your .env config.")


# ─── CALLBACK HANDLERS ────────────────────────────────────────────────────────

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    if data == "start_day":
        await query.edit_message_text("🚀 Let's go! I'll check in with you at midday. Focus up 💪")

    elif data == "regen_schedule":
        await query.edit_message_text("⏳ Regenerating your schedule...")
        projects = db.get_all_projects()
        tasks = db.get_pending_tasks()
        try:
            blocks = await ai.generate_daily_schedule(projects, tasks, date.today().isoformat())
            db.save_schedule(blocks)
            lines = ["🔄 *Refreshed schedule:*\n"] + [format_schedule_block(b) for b in blocks]
            await query.edit_message_text("\n".join(lines), parse_mode="Markdown")
        except Exception as e:
            await query.edit_message_text(f"❌ Error: {e}")

    elif data.startswith("complete_"):
        parts = data.split("_")
        task_id = parts[1]
        difficulty = parts[2] if len(parts) > 2 else "medium"

        db.complete_task(task_id)
        xp = {"easy": 10, "medium": 25, "hard": 50}.get(difficulty, 25)
        stats = db.award_xp(xp, f"Completed task", task_id)

        response = await ai.generate_motivational_checkin("your task", "done", {
            "streak": stats.get("current_streak", 0)
        })

        await query.edit_message_text(
            f"✅ Done! *+{xp} XP*\n\n{response}\n\n"
            f"⚡ Total: {stats['total_xp']} XP · Level {stats['level']}",
            parse_mode="Markdown"
        )

    elif data.startswith("behind_"):
        reason = data.replace("behind_", "")
        messages_map = {
            "slept": "Slept in / late start",
            "unwell": "Feeling unwell",
            "overwhelmed": "Overwhelmed",
            "distracted": "Got distracted",
        }
        reason_text = messages_map.get(reason, "behind")

        projects = db.get_all_projects()
        tasks = db.get_pending_tasks()

        try:
            # Generate a reduced schedule for the rest of the day
            blocks = await ai.generate_daily_schedule(projects, tasks[:3], date.today().isoformat())
            top_blocks = [b for b in blocks if b.get("type") in ("deep", "medium")][:3]
            schedule_lines = "\n".join(format_schedule_block(b) for b in top_blocks)

            response = await ai.generate_motivational_checkin("your day", "distracted", {})

            await query.edit_message_text(
                f"💪 *Adjusted plan for today:*\n\n"
                f"{schedule_lines}\n\n"
                f"{response}\n\n"
                f"_Progress > perfection._",
                parse_mode="Markdown"
            )
        except Exception as e:
            await query.edit_message_text(f"❌ Error generating plan: {e}")


# ─── SCHEDULED MESSAGES ───────────────────────────────────────────────────────

async def morning_briefing(context: ContextTypes.DEFAULT_TYPE):
    """Sent at 8:00 AM daily"""
    chat_id = context.job.data
    projects = db.get_all_projects()
    tasks = db.get_pending_tasks()
    stats = db.get_user_stats()

    try:
        blocks = await ai.generate_daily_schedule(projects, tasks, date.today().isoformat())
        db.save_schedule(blocks)
    except Exception:
        blocks = []

    schedule_lines = "\n".join(format_schedule_block(b) for b in blocks[:8])
    xp_bar = format_xp_bar(stats["total_xp"], stats["level"])

    keyboard = [
        [InlineKeyboardButton("🚀 Let's go!", callback_data="start_day")],
        [InlineKeyboardButton("🔄 Tweak schedule", callback_data="regen_schedule")],
    ]

    await context.bot.send_message(
        chat_id=chat_id,
        text=(
            f"🌅 *Good morning! Here's your day.*\n\n"
            f"⚡ {xp_bar}\n"
            f"🔥 Streak: {stats['current_streak']} days\n\n"
            f"*Today's schedule:*\n{schedule_lines}\n\n"
            f"Your most important task is at the top. Let's do this 💪"
        ),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def evening_review(context: ContextTypes.DEFAULT_TYPE):
    """Sent at 9:00 PM daily"""
    chat_id = context.job.data
    summary = db.get_todays_summary()
    stats = db.get_user_stats()
    streak = db.update_streak(summary["tasks_completed"] > 0)

    completed_list = "\n".join(
        f"  ✓ {t['title']}" for t in summary["completed_tasks"][:5]
    ) or "  No tasks completed today."

    await context.bot.send_message(
        chat_id=chat_id,
        text=(
            f"🌙 *Day Complete — Your Report*\n\n"
            f"✅ {summary['tasks_completed']} tasks completed\n"
            f"💰 +{summary['xp_earned']} XP earned\n"
            f"🔥 Streak: {streak['current_streak']} days\n\n"
            f"*Completed today:*\n{completed_list}\n\n"
            f"⚡ {format_xp_bar(stats['total_xp'], stats['level'])}\n\n"
            f"_Rest well. Tomorrow we go again._ 🌟"
        ),
        parse_mode="Markdown"
    )


async def midday_checkin(context: ContextTypes.DEFAULT_TYPE):
    """Sent at 12:00 PM as accountability check"""
    chat_id = context.job.data
    schedule = db.get_todays_schedule()

    if not schedule:
        return

    # Find the morning deep work block
    morning_block = next(
        (b for b in schedule["blocks"] if b.get("type") == "deep"),
        None
    )

    if not morning_block:
        return

    keyboard = [
        [InlineKeyboardButton("✅ Done!", callback_data="checkin_done")],
        [InlineKeyboardButton("🔶 Almost", callback_data="checkin_almost")],
        [InlineKeyboardButton("❌ Not started", callback_data="checkin_not_started")],
        [InlineKeyboardButton("😵 Got distracted", callback_data="checkin_distracted")],
    ]

    await context.bot.send_message(
        chat_id=chat_id,
        text=(
            f"⏰ *Midday Check-in*\n\n"
            f"Did you complete your morning block?\n"
            f"*{morning_block['title']}* ({morning_block['time']}–{morning_block['end']})"
        ),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    app = Application.builder().token(TELEGRAM_TOKEN).build()

    # Commands
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("today", today))
    app.add_handler(CommandHandler("add", add_goal))
    app.add_handler(CommandHandler("done", done_command))
    app.add_handler(CommandHandler("stats", stats_command))
    app.add_handler(CommandHandler("life", life_command))
    app.add_handler(CommandHandler("behind", behind_command))

    # Callbacks
    app.add_handler(CallbackQueryHandler(handle_callback))

    # Free text fallback
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # Scheduled jobs — replace YOUR_CHAT_ID with your Telegram user ID
    # Get your ID by messaging @userinfobot on Telegram
    YOUR_CHAT_ID = int(os.getenv("TELEGRAM_CHAT_ID", "0"))
    if YOUR_CHAT_ID:
        job_queue = app.job_queue
        job_queue.run_daily(morning_briefing, time=time(8, 0), data=YOUR_CHAT_ID, name="morning")
        job_queue.run_daily(midday_checkin, time=time(12, 0), data=YOUR_CHAT_ID, name="midday")
        job_queue.run_daily(evening_review, time=time(21, 0), data=YOUR_CHAT_ID, name="evening")

    print("🤖 LifeOS Bot is running...")
    app.run_polling()


if __name__ == "__main__":
    main()
