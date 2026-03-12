"""
LifeOS AI Provider Abstraction Layer
=====================================
Swap between Groq, Gemini, Ollama, and Claude
with a single environment variable: AI_PROVIDER

Portfolio note: This pattern is called the "Strategy Pattern" —
a classic software design pattern where the algorithm (AI provider)
is swappable at runtime without changing the calling code.
"""

import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

AI_PROVIDER = os.getenv("AI_PROVIDER", "groq")  # groq | gemini | ollama | claude
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY", "")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


# ─── PROVIDER IMPLEMENTATIONS ────────────────────────────────────────────────

async def _groq_chat(messages: list[dict], system: str) -> str:
    """Groq — free tier, Llama 3.3 70B, fastest inference"""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "system", "content": system}, *messages],
                "max_tokens": 1024,
                "temperature": 0.7,
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


async def _gemini_chat(messages: list[dict], system: str) -> str:
    """Gemini Flash — free tier, 1500 req/day, great for long context"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"

    # Gemini uses a different message format
    contents = []
    if system:
        contents.append({"role": "user", "parts": [{"text": system}]})
        contents.append({"role": "model", "parts": [{"text": "Understood."}]})
    for msg in messages:
        role = "model" if msg["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, json={"contents": contents})
        response.raise_for_status()
        return response.json()["candidates"][0]["content"]["parts"][0]["text"]


async def _ollama_chat(messages: list[dict], system: str) -> str:
    """Ollama — fully local, runs on your uni GPU, zero cost"""
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [{"role": "system", "content": system}, *messages],
                "stream": False,
            },
        )
        response.raise_for_status()
        return response.json()["message"]["content"]


async def _claude_chat(messages: list[dict], system: str) -> str:
    """Claude Haiku — best reasoning, use for complex scheduling logic"""
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": CLAUDE_API_KEY,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1024,
                "system": system,
                "messages": messages,
            },
        )
        response.raise_for_status()
        return response.json()["content"][0]["text"]


# ─── PUBLIC INTERFACE ─────────────────────────────────────────────────────────

async def chat(messages: list[dict], system: str = "") -> str:
    """
    Main entry point. Calls whichever provider is set in AI_PROVIDER.

    Usage:
        response = await chat(
            messages=[{"role": "user", "content": "Plan my day"}],
            system="You are LifeOS, a personal productivity assistant."
        )
    """
    providers = {
        "groq": _groq_chat,
        "gemini": _gemini_chat,
        "ollama": _ollama_chat,
        "claude": _claude_chat,
    }

    provider_fn = providers.get(AI_PROVIDER)
    if not provider_fn:
        raise ValueError(f"Unknown AI_PROVIDER: {AI_PROVIDER}. Choose from: {list(providers.keys())}")

    return await provider_fn(messages, system)


async def extract_goal_from_text(user_text: str, existing_projects: list) -> dict:
    """
    Takes a freeform message like:
    "I have CNN coursework due March 20, need to implement the model and write the report"

    Returns structured JSON:
    {
      "title": "CNN Coursework",
      "area_id": "study",
      "deadline": "2025-03-20",
      "priority": "high",
      "urgency": "high",
      "estimated_hours": 15,
      "difficulty": "hard",
      "tasks": [
        {"title": "Implement CNN model", "type": "coding", "estimated_mins": 180, "difficulty": "hard"},
        {"title": "Write report", "type": "writing", "estimated_mins": 240, "difficulty": "medium"}
      ],
      "clarifying_questions": []  // empty if enough info, otherwise ask these
    }
    """
    system = """You are LifeOS, an AI productivity assistant. 
Extract structured goal/project data from the user's message.
Return ONLY valid JSON, no markdown, no explanation.

Life areas to categorise into:
work, study, health, social, hobbies, selfcare, sleep, meals, growth, admin

Task types: coding, writing, studying, meeting, exercise, reading, design, admin, other

Difficulty levels: easy, medium, hard
Priority levels: low, medium, high
Urgency levels: low, medium, high

If information is missing (deadline, hours estimate, difficulty), 
add it to clarifying_questions as a list of strings.
If enough info exists, clarifying_questions should be empty."""

    existing_titles = [p.get("title", "") for p in existing_projects]
    prompt = f"""User message: "{user_text}"

Existing projects (for context, avoid duplicates): {existing_titles}

Extract and return JSON in this exact format:
{{
  "title": "project title",
  "area_id": "study",
  "deadline": "YYYY-MM-DD or null",
  "priority": "high",
  "urgency": "high", 
  "estimated_hours": 15,
  "difficulty": "hard",
  "tasks": [
    {{"title": "task name", "type": "coding", "estimated_mins": 180, "difficulty": "hard", "due_date": "YYYY-MM-DD or null"}}
  ],
  "clarifying_questions": []
}}"""

    response = await chat(
        messages=[{"role": "user", "content": prompt}],
        system=system
    )

    # Strip markdown fences if model adds them
    cleaned = response.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(cleaned)


async def generate_daily_schedule(projects: list, tasks: list, date: str) -> list:
    """
    Generates a time-blocked daily schedule from active projects/tasks.

    Returns list of time blocks:
    [
      {"time": "09:00", "end": "10:30", "type": "deep", "title": "...", "task_id": "..."},
      {"time": "10:30", "end": "10:45", "type": "break", "title": "Break"},
      ...
    ]
    """
    system = """You are LifeOS scheduler. Generate an optimal time-blocked daily schedule.
Rules:
- Start at 09:00, end by 22:00
- Deep work blocks: 90 mins max, then 15 min break
- Prioritise high urgency + close deadlines first
- Mix difficult and easy tasks (dopamine scheduling)
- Include meal breaks: lunch 12:30-13:30, dinner 18:00-18:30
- Return ONLY valid JSON array, no markdown."""

    # Summarise tasks for the prompt
    task_summary = []
    for t in tasks:
        if not t.get("done"):
            task_summary.append({
                "id": t.get("id"),
                "title": t.get("title"),
                "type": t.get("task_type", "general"),
                "estimated_mins": t.get("estimated_mins", 30),
                "difficulty": t.get("difficulty", "medium"),
                "due_date": t.get("due_date"),
                "project": next((p["title"] for p in projects if p["id"] == t.get("project_id")), "")
            })

    prompt = f"""Date: {date}
Pending tasks: {json.dumps(task_summary[:10])}  

Generate time-blocked schedule as JSON array:
[
  {{"time": "09:00", "end": "10:30", "type": "deep", "title": "task title", "task_id": "uuid or null", "area": "study"}},
  {{"time": "10:30", "end": "10:45", "type": "break", "title": "Break", "task_id": null, "area": null}}
]

Block types: deep, medium, quick, break, meal, reflection"""

    response = await chat(
        messages=[{"role": "user", "content": prompt}],
        system=system
    )

    cleaned = response.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(cleaned)


async def generate_motivational_checkin(task_title: str, response_type: str, context: dict) -> str:
    """
    Generate a supportive check-in response based on user's answer.
    response_type: done | almost | not_started | distracted
    """
    system = """You are LifeOS, a supportive productivity coach. 
Keep responses SHORT (2-3 sentences max), warm, and action-oriented.
Never be preachy. Be like a smart friend who gets it."""

    prompts = {
        "done": f"User completed: '{task_title}'. Celebrate briefly and mention XP earned. Streak: {context.get('streak', 0)} days.",
        "almost": f"User almost finished: '{task_title}'. Encourage, suggest 30 min catch-up block.",
        "not_started": f"User didn't start: '{task_title}'. Be understanding, help reschedule without guilt.",
        "distracted": f"User got distracted during: '{task_title}'. Empathise, suggest a fresh start strategy.",
    }

    response = await chat(
        messages=[{"role": "user", "content": prompts.get(response_type, prompts["done"])}],
        system=system
    )
    return response
