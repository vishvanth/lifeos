"""
LifeOS Telegram Bot — Full Accountability Edition
===================================================
Features:
  - Task start notifications with feeling check
  - Mid-task check-ins
  - Task end review with XP + vibe check
  - Motivational messages tailored to user's feeling
  - Morning briefing, evening review, midday check-in
"""

import os
import asyncio
import logging
from datetime import date, time, datetime, timedelta
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
YOUR_CHAT_ID = int(os.getenv("TELEGRAM_CHAT_ID", "0"))


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


# ─── TASK NOTIFICATION SCHEDULER ─────────────────────────────────────────────

def schedule_task_notifications(app, chat_id: int, blocks: list):
    """
    Given today's schedule blocks, schedule 3 notifications per task:
    1. At task start — feeling check + motivation
    2. At midpoint — are you still on track?
    3. At task end — how did it go? XP award.
    """
    now = datetime.now()
    today = now.date()

    for block in blocks:
        if block.get("type") in ("break", "meal"):
            continue

        try:
            start_h, start_m = map(int, block["time"].split(":"))
            end_h, end_m = map(int, block["end"].split(":"))

            start_dt = datetime.combine(today, time(start_h, start_m))
            end_dt = datetime.combine(today, time(end_h, end_m))
            duration_mins = int((end_dt - start_dt).total_seconds() / 60)
            midpoint_dt = start_dt + timedelta(minutes=duration_mins // 2)

            block_data = {**block, "duration_mins": duration_mins}

            if start_dt > now:
                app.job_queue.run_once(
                    notify_task_start,
                    when=start_dt,
                    data={"chat_id": chat_id, "block": block_data},
                    name=f"start_{block['time']}_{block['title'][:10]}",
                )
            if midpoint_dt > now:
                app.job_queue.run_once(
                    notify_task_midpoint,
                    when=midpoint_dt,
                    data={"chat_id": chat_id, "block": block_data},
                    name=f"mid_{block['time']}_{block['title'][:10]}",
                )
            if end_dt > now:
                app.job_queue.run_once(
                    notify_task_end,
                    when=end_dt,
                    data={"chat_id": chat_id, "block": block_data},
                    name=f"end_{block['time']}_{block['title'][:10]}",
                )

        except Exception as e:
            logger.warning(f"Could not schedule notification for block {block.get('title')}: {e}")


# ─── TASK START NOTIFICATION ──────────────────────────────────────────────────

async def notify_task_start(context: ContextTypes.DEFAULT_TYPE):
    chat_id = context.job.data["chat_id"]
    block = context.job.data["block"]
    task_id = block.get("task_id", "none")

    keyboard = [
        [
            InlineKeyboardButton("😤 Ready", callback_data=f"feel_ready_{task_id}"),
            InlineKeyboardButton("😐 Okay", callback_data=f"feel_okay_{task_id}"),
        ],
        [
            InlineKeyboardButton("😰 Anxious", callback_data=f"feel_anxious_{task_id}"),
            InlineKeyboardButton("😴 Tired", callback_data=f"feel_tired_{task_id}"),
        ],
    ]

    await context.bot.send_message(
        chat_id=chat_id,
        text=(
            f"🎯 *Starting now:* {block['title']}\n"
            f"⏱ {block['duration_mins']} mins · "
            f"{block.get('type', 'focused').title()} work\n\n"
            f"How are you feeling about this?"
        ),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


# ─── MID-TASK CHECK-IN ────────────────────────────────────────────────────────

async def notify_task_midpoint(context: ContextTypes.DEFAULT_TYPE):
    chat_id = context.job.data["chat_id"]
    block = context.job.data["block"]
    task_id = block.get("task_id", "none")

    keyboard = [
        [InlineKeyboardButton("✅ Going well", callback_data=f"mid_good_{task_id}")],
        [InlineKeyboardButton("🔶 Struggling a bit", callback_data=f"mid_struggle_{task_id}")],
        [InlineKeyboardButton("❌ Got derailed", callback_data=f"mid_derailed_{task_id}")],
    ]

    await context.bot.send_message(
        chat_id=chat_id,
        text=(
            f"⏱ *Halfway check-in*\n\n"
            f"You're halfway through *{block['title']}*\n"
            f"Still on track?"
        ),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


# ─── TASK END NOTIFICATION ────────────────────────────────────────────────────

async def notify_task_end(context: ContextTypes.DEFAULT_TYPE):
    chat_id = context.job.data["chat_id"]
    block = context.job.data["block"]
    task_id = block.get("task_id", "none")

    keyboard = [
        [
            InlineKeyboardButton("✅ Completed!", callback_data=f"end_done_{task_id}"),
            InlineKeyboardButton("🔶 Almost done", callback_data=f"end_almost_{task_id}"),
        ],
        [InlineKeyboardButton("❌ Didn't finish", callback_data=f"end_incomplete_{task_id}")],
    ]

    await context.bot.send_message(
        chat_id=chat_id,
        text=(
            f"⏰ *Time's up!*\n\n"
            f"How did *{block['title']}* go?"
        ),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


# ─── COMMAND HANDLERS ─────────────────────────────────────────────────────────

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        f"👋 Welcome to *LifeOS* — your AI chief of staff.\n\n"
        f"*Commands:*\n"
        f"/today — see your schedule + set task notifications\n"
        f"/add — add a goal or task\n"
        f"/done — mark a task complete\n"
        f"/stats — your XP and level\n"
        f"/life — bird's eye view\n"
        f"/behind — emergency reschedule\n\n"
        f"Or just type anything in plain English 🎯",
        parse_mode="Markdown"
    )


async def today(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Generating your schedule...")

    schedule = db.get_todays_schedule()
    stats = db.get_user_stats()

    if not schedule:
        projects = db.get_all_projects()
        tasks = db.get_pending_tasks()
        try:
            blocks = await ai.generate_daily_schedule(
                projects, tasks, date.today().isoformat()
            )
            db.save_schedule(blocks)
        except Exception as e:
            await update.message.reply_text(
                f"❌ Couldn't generate schedule: {e}\n"
                f"Check your AI provider config in .env"
            )
            return
    else:
        blocks = schedule["blocks"]

    # Schedule task notifications for today
    if YOUR_CHAT_ID:
        schedule_task_notifications(context.application, YOUR_CHAT_ID, blocks)
        notification_note = "🔔 Task notifications scheduled!"
    else:
        notification_note = "⚠️ Set TELEGRAM_CHAT_ID in .env for notifications"

    xp_bar = format_xp_bar(stats["total_xp"], stats["level"])
    lines = [
        f"🌅 *Today — {date.today().strftime('%A, %d %b')}*\n",
        f"⚡ {xp_bar}",
        f"🔥 Streak: {stats['current_streak']} days\n",
        f"*Your schedule:*",
    ]
    for block in blocks:
        lines.append(format_schedule_block(block))

    deep_blocks = [b for b in blocks if b.get("type") == "deep"]
    lines.append(f"\n📌 {len(deep_blocks)} deep work blocks")
    lines.append(notification_note)

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
    user_text = " ".join(context.args) if context.args else None
    if not user_text:
        await update.message.reply_text(
            "💬 Tell me what you need to do in plain English.\n\n"
            "_Example: /add CNN coursework due Friday, need to implement model and write report_",
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

    if extracted.get("clarifying_questions"):
        questions = "\n".join(f"• {q}" for q in extracted["clarifying_questions"])
        context.user_data["pending_goal"] = extracted
        context.user_data["pending_goal_text"] = user_text
        await update.message.reply_text(
            f"🤔 I need a bit more info:\n\n{questions}\n\nReply with the answers.",
            parse_mode="Markdown"
        )
        return

    context.user_data["pending_goal"] = {**extracted, "ready_to_save": True}
    context.user_data["pending_goal_text"] = user_text
    await _show_goal_confirmation(update, extracted)


async def _show_goal_confirmation(update, extracted):
    tasks_list = "\n".join(
        f"  • {t['title']} ({t['estimated_mins']}m, {t['difficulty']})"
        for t in extracted.get("tasks", [])
    )
    hours = extracted.get("estimated_hours", 0)
    deadline = extracted.get("deadline")
    hrs_per_day = None
    if deadline:
        days_left = (date.fromisoformat(deadline) - date.today()).days
        if days_left > 0 and hours:
            hrs_per_day = round(hours / days_left, 1)

    await update.message.reply_text(
        f"✅ Got it! Here's what I extracted:\n\n"
        f"📁 *{extracted['title']}*\n"
        f"Area: {extracted.get('area_id')} · Priority: {extracted.get('priority')} · "
        f"Difficulty: {extracted.get('difficulty')}\n"
        f"{f'Deadline: {deadline}' if deadline else ''}\n"
        f"{f'→ Recommend *{hrs_per_day}h/day* to finish on time' if hrs_per_day else ''}\n\n"
        f"*Tasks:*\n{tasks_list}\n\n"
        f"Reply *yes* to save to your Life Document.",
        parse_mode="Markdown"
    )


async def done_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    tasks = db.get_pending_tasks()
    if not tasks:
        await update.message.reply_text("🎉 No pending tasks — you're all caught up!")
        return

    keyboard = []
    for task in tasks[:8]:
        label = f"{task['title'][:35]}{'...' if len(task['title']) > 35 else ''}"
        keyboard.append([InlineKeyboardButton(
            label, callback_data=f"complete_{task['id']}_{task['difficulty']}"
        )])

    await update.message.reply_text(
        "✅ Which task did you complete?",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    stats = db.get_user_stats()
    summary = db.get_todays_summary()
    xp_bar = format_xp_bar(stats["total_xp"], stats["level"])

    await update.message.reply_text(
        f"⚡ *Your Stats*\n\n"
        f"{xp_bar}\n\n"
        f"🔥 Streak: *{stats['current_streak']} days* (best: {stats['longest_streak']})\n"
        f"✅ Today: *{summary['tasks_completed']} tasks* done\n"
        f"💰 XP today: *+{summary['xp_earned']}*",
        parse_mode="Markdown"
    )


async def life_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    projects = db.get_all_projects()
    if not projects:
        await update.message.reply_text("📭 No projects yet. Use /add to create your first goal!")
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
        bar = "█" * int(progress / 10) + "░" * (10 - int(progress / 10))
        tasks_total = len(p.get("tasks", []))
        tasks_done = sum(1 for t in p.get("tasks", []) if t.get("done"))
        lines.append(
            f"{icon} *{p['title']}*\n"
            f"   [{bar}] {progress}%  ·  {tasks_done}/{tasks_total} tasks\n"
            f"   📅 {p.get('deadline', 'no deadline')}\n"
        )

    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def behind_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
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


# ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text

    # Pending clarification answers
    if context.user_data.get("pending_goal") and not context.user_data["pending_goal"].get("ready_to_save"):
        pending_text = context.user_data.get("pending_goal_text", "")
        await update.message.reply_text("🧠 Got it, updating your goal...")
        try:
            combined = f"{pending_text}. Additional info: {text}"
            projects = db.get_all_projects()
            extracted = await ai.extract_goal_from_text(combined, projects)

            if extracted.get("clarifying_questions"):
                context.user_data["pending_goal"] = extracted
                context.user_data["pending_goal_text"] = combined
                questions = "\n".join(f"• {q}" for q in extracted["clarifying_questions"])
                await update.message.reply_text(f"Just a bit more:\n\n{questions}")
                return

            context.user_data["pending_goal"] = {**extracted, "ready_to_save": True}
            context.user_data["pending_goal_text"] = combined
            await _show_goal_confirmation(update, extracted)
        except Exception as e:
            await update.message.reply_text(f"❌ Error: {e}")
        return

    # Yes confirmation to save goal
    if text.strip().lower() == "yes" and context.user_data.get("pending_goal", {}).get("ready_to_save"):
        extracted = context.user_data["pending_goal"]
        try:
            project = db.create_project({
                "area_id": extracted.get("area_id", "admin"),
                "title": extracted.get("title", "Untitled"),
                "deadline": extracted.get("deadline"),
                "priority": extracted.get("priority", "medium"),
                "urgency": extracted.get("urgency", "medium"),
                "estimated_hours": extracted.get("estimated_hours", 1),
                "difficulty": extracted.get("difficulty", "medium"),
                "progress": 0, "status": "active",
            })
            tasks_to_create = [
                {
                    "project_id": project["id"],
                    "title": t.get("title"),
                    "task_type": t.get("type", "general"),
                    "estimated_mins": t.get("estimated_mins", 30),
                    "difficulty": t.get("difficulty", "medium"),
                    "due_date": t.get("due_date"),
                    "done": False,
                }
                for t in extracted.get("tasks", [])
            ]
            if tasks_to_create:
                db.create_tasks_bulk(tasks_to_create)

            context.user_data.pop("pending_goal", None)
            context.user_data.pop("pending_goal_text", None)

            await update.message.reply_text(
                f"✅ *{extracted['title']}* added!\n\n"
                f"📁 {extracted.get('area_id', 'admin').title()}\n"
                f"🎯 Priority: {extracted.get('priority')}\n"
                f"⏱ Est. {extracted.get('estimated_hours')}h total\n\n"
                f"{len(tasks_to_create)} tasks created. Use /today to schedule them 🗓",
                parse_mode="Markdown"
            )
        except Exception as e:
            await update.message.reply_text(f"❌ Failed to save: {e}")
        return

    # Intent detection
    lower = text.lower()
    if any(w in lower for w in ["need to", "have to", "due", "deadline", "finish", "assignment", "project"]):
        context.args = text.split()
        await add_goal(update, context)
        return
    if any(w in lower for w in ["today", "schedule", "plan", "what should"]):
        await today(update, context)
        return
    if any(w in lower for w in ["behind", "overwhelmed", "stressed"]):
        await behind_command(update, context)
        return

    # General AI chat
    stats = db.get_user_stats()
    projects = db.get_all_projects()
    system = (
        f"You are LifeOS, a supportive AI productivity coach. "
        f"User's projects: {[p['title'] for p in projects]}. "
        f"Level: {stats.get('level', 1)}, streak: {stats.get('current_streak', 0)} days. "
        f"Be concise (3-4 sentences), warm, practical. "
        f"Do NOT ask about existing projects unless directly relevant."
    )
    try:
        response = await ai.chat(
            messages=[{"role": "user", "content": text}],
            system=system
        )
        await update.message.reply_text(response)
    except Exception as e:
        await update.message.reply_text(f"❌ AI error: {e}")


# ─── CALLBACK HANDLER ─────────────────────────────────────────────────────────

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data

    # ── Schedule day ──
    if data == "start_day":
        await query.edit_message_text("🚀 Let's go! Notifications are set. Focus up 💪")

    elif data == "regen_schedule":
        await query.edit_message_text("⏳ Regenerating...")
        projects = db.get_all_projects()
        tasks = db.get_pending_tasks()
        try:
            blocks = await ai.generate_daily_schedule(projects, tasks, date.today().isoformat())
            db.save_schedule(blocks)
            if YOUR_CHAT_ID:
                schedule_task_notifications(context.application, YOUR_CHAT_ID, blocks)
            lines = ["🔄 *Refreshed schedule:*\n"] + [format_schedule_block(b) for b in blocks]
            await query.edit_message_text("\n".join(lines), parse_mode="Markdown")
        except Exception as e:
            await query.edit_message_text(f"❌ Error: {e}")

    # ── Complete task ──
    elif data.startswith("complete_"):
        parts = data.split("_")
        task_id, difficulty = parts[1], parts[2] if len(parts) > 2 else "medium"
        db.complete_task(task_id)
        xp = {"easy": 10, "medium": 25, "hard": 50}.get(difficulty, 25)
        stats = db.award_xp(xp, "Task completed", task_id)
        response = await ai.generate_motivational_checkin("your task", "done", {"streak": stats.get("current_streak", 0)})
        await query.edit_message_text(
            f"✅ Done! *+{xp} XP*\n\n{response}\n\n⚡ {stats['total_xp']} XP · Level {stats['level']}",
            parse_mode="Markdown"
        )

    # ── How are you feeling (task start) ──
    elif data.startswith("feel_"):
        _, feeling, task_id = data.split("_", 2)
        responses = {
            "ready": "🔥 *Let's get it!*\n\nYou're in the zone. Lock in, close distractions, give this your full focus. Let's go 💪",
            "okay": "👍 *Okay is enough to start.*\n\nYou don't need to feel motivated — just open it and write one line. Momentum builds itself. 🚀",
            "anxious": "💙 *Anxiety means you care.*\n\nBreak it to the smallest first step. Not the whole task — just 5 minutes. The anxiety fades once you start. 🧘",
            "tired": "😴 *Tired but here — that counts.*\n\nTry the 10-minute rule: work for just 10 minutes. You'll usually find your second wind. ⚡",
        }
        await query.edit_message_text(responses.get(feeling, "Good luck! 💪"), parse_mode="Markdown")

    # ── Mid-task check-in ──
    elif data.startswith("mid_"):
        _, status, task_id = data.split("_", 2)
        responses = {
            "good": "✅ *Keep going — you're in flow!*\n\nDon't break the momentum. Finish strong 🔥",
            "struggle": "🔶 *Struggling is part of the process.*\n\nWrite down what's blocking you in one sentence. Naming it often breaks it. You've got this 💪",
            "derailed": "❌ *Derailed — let's reset.*\n\nClose everything. 2 minutes away from the screen. Then come back and do just ONE small thing. Recovery is a skill. 🧘",
        }
        await query.edit_message_text(responses.get(status, "Keep going!"), parse_mode="Markdown")

    # ── Task end ──
    elif data.startswith("end_"):
        _, status, task_id = data.split("_", 2)

        if status == "done" and task_id != "none":
            task_data = db.complete_task(task_id)
            difficulty = task_data.get("difficulty", "medium") if task_data else "medium"
            xp = {"easy": 10, "medium": 25, "hard": 50}.get(difficulty, 25)
            stats = db.award_xp(xp, "Task completed", task_id)

            await query.edit_message_text(
                f"🎉 *Task complete! +{xp} XP*\n\n"
                f"⚡ {stats['total_xp']} XP · Level {stats['level']}\n"
                f"🔥 Streak: {stats['current_streak']} days\n\n"
                f"How do you feel right now?",
                parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup([
                    [
                        InlineKeyboardButton("💪 Energised", callback_data=f"vibe_energy_{task_id}"),
                        InlineKeyboardButton("😐 Okay", callback_data=f"vibe_okay_{task_id}"),
                    ],
                    [
                        InlineKeyboardButton("😓 Drained", callback_data=f"vibe_drained_{task_id}"),
                        InlineKeyboardButton("😤 Frustrated", callback_data=f"vibe_frustrated_{task_id}"),
                    ],
                ])
            )
        elif status == "almost":
            await query.edit_message_text(
                "🔶 *Almost there — that's progress!*\n\n"
                "I'll add 30 minutes tomorrow to finish. Note what's left so you pick it up quickly 📝",
                parse_mode="Markdown"
            )
        elif status == "incomplete":
            await query.edit_message_text(
                "❌ *Didn't finish — no worries.*\n\n"
                "I'll reschedule this for tomorrow morning when energy is fresh. Rest now, attack it tomorrow 🌙",
                parse_mode="Markdown"
            )

    # ── Post-task vibe check ──
    elif data.startswith("vibe_"):
        _, vibe, task_id = data.split("_", 2)
        responses = {
            "energy": "💪 *Energised after deep work — that's flow state!*\n\nThis is your brain rewarding focused effort. I'll protect this time slot in future schedules. 🧠",
            "okay": "😐 *Okay is sustainable — that's healthy.*\n\nConsistent okay beats occasional brilliant. You showed up, you did the work. That's the whole game. ✅",
            "drained": "😓 *Drained means you gave real effort.*\n\nTake a proper break — 20 minutes away from screens. Drink water, move around. Your next task will go better. 🌿",
            "frustrated": "😤 *Frustration usually means you care about quality.*\n\nWrite down what frustrated you in one sentence. Then let it go. You showed up. That's enough. 🙏",
        }
        await query.edit_message_text(responses.get(vibe, "Thanks for checking in 💪"), parse_mode="Markdown")

    # ── Behind / emergency ──
    elif data.startswith("behind_"):
        reason = data.replace("behind_", "")
        tasks = db.get_pending_tasks()
        try:
            projects = db.get_all_projects()
            blocks = await ai.generate_daily_schedule(projects, tasks[:3], date.today().isoformat())
            top_blocks = [b for b in blocks if b.get("type") in ("deep", "medium")][:3]
            schedule_lines = "\n".join(format_schedule_block(b) for b in top_blocks)
            await query.edit_message_text(
                f"💪 *Adjusted plan for the rest of today:*\n\n"
                f"{schedule_lines}\n\n"
                f"Progress > perfection. You've got this. 🌟",
                parse_mode="Markdown"
            )
        except Exception as e:
            await query.edit_message_text(f"❌ Error: {e}")

    # ── Midday check-in responses ──
    elif data.startswith("checkin_"):
        status = data.replace("checkin_", "")
        responses = {
            "done": "🎉 *Excellent!* That's how it's done. Keep that energy for the afternoon 💪",
            "almost": "🔶 *Almost counts!* I'll add 30 mins catch-up at 14:00. Finish strong.",
            "not_started": "❌ *Okay — fresh start.* Move it to 13:30 and go hard for 90 mins. You've got time.",
            "distracted": "😵 *Distracted happens.* Close all tabs. One task. 25 minutes. Go.",
        }
        await query.edit_message_text(responses.get(status, "Keep going!"), parse_mode="Markdown")


# ─── SCHEDULED DAILY MESSAGES ─────────────────────────────────────────────────

async def morning_briefing(context: ContextTypes.DEFAULT_TYPE):
    chat_id = context.job.data
    projects = db.get_all_projects()
    tasks = db.get_pending_tasks()
    stats = db.get_user_stats()

    try:
        blocks = await ai.generate_daily_schedule(projects, tasks, date.today().isoformat())
        db.save_schedule(blocks)
        schedule_task_notifications(context.application, chat_id, blocks)
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
            f"🔔 Task notifications are set — I'll check in with you at each block."
        ),
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def midday_checkin(context: ContextTypes.DEFAULT_TYPE):
    chat_id = context.job.data
    schedule = db.get_todays_schedule()
    if not schedule:
        return

    morning_block = next((b for b in schedule["blocks"] if b.get("type") == "deep"), None)
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


async def evening_review(context: ContextTypes.DEFAULT_TYPE):
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


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    app = Application.builder().token(TELEGRAM_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("today", today))
    app.add_handler(CommandHandler("add", add_goal))
    app.add_handler(CommandHandler("done", done_command))
    app.add_handler(CommandHandler("stats", stats_command))
    app.add_handler(CommandHandler("life", life_command))
    app.add_handler(CommandHandler("behind", behind_command))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    if YOUR_CHAT_ID:
        jq = app.job_queue
        jq.run_daily(morning_briefing, time=time(8, 0),  data=YOUR_CHAT_ID, name="morning")
        jq.run_daily(midday_checkin,   time=time(12, 0), data=YOUR_CHAT_ID, name="midday")
        jq.run_daily(evening_review,   time=time(21, 0), data=YOUR_CHAT_ID, name="evening")
        print(f"✅ Scheduled: 8AM briefing, 12PM check-in, 9PM review for chat {YOUR_CHAT_ID}")
    else:
        print("⚠️  TELEGRAM_CHAT_ID not set — scheduled messages disabled")

    print("🤖 LifeOS Bot is running with full accountability features...")
    app.run_polling()


if __name__ == "__main__":
    main()
