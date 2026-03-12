# LifeOS — AI Personal Chief of Staff

A full-stack AI productivity system that acts as your personal 
life planner, daily scheduler, and habit coach.

## Architecture

- **Web Dashboard** — React + Vite + Tailwind + Supabase
- **Telegram Bot** — Python + python-telegram-bot
- **AI Layer** — Swappable: Groq (Llama 3.3), Gemini Flash, 
                  Claude Haiku, Ollama (local)
- **Database** — Supabase (PostgreSQL)

## Features

- 🗂 Life Document — goals across 10 life categories
- 🤖 AI chat for conversational goal creation
- 📅 AI-generated daily time-blocked schedule
- 📱 Telegram bot — morning briefings, check-ins, XP summaries
- 🎮 Gamification — XP, levels, streaks, achievements
- 📊 Analytics — productivity score, focus patterns

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend/Bot | Python 3.11, FastAPI |
| Database | Supabase (PostgreSQL) |
| AI | Groq / Gemini / Ollama / Claude |
| Deploy | Vercel (web) + Railway (bot) |

## Setup

\`\`\`bash
conda activate lifeos
cd lifeos-bot && pip install -r requirements.txt
cd lifeos-web && npm install
\`\`\`

## Built With AI Assistance

This project uses AI-assisted development (Cursor + Claude) 
for boilerplate generation. All architecture decisions, 
logic design, and commits are authored by me.
