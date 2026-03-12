Claude chat -> https://claude.ai/share/cffcee63-9721-42b0-b71c-5df3fb9b80c0

git add .
git commit -m "feat: initial project scaffold

- conda env with Python 3.11
- React + Vite web app bootstrapped
- Python bot structure created
- Supabase schema planned
- README with architecture overview"

# Push to GitHub
gh repo create lifeos --public
git push -u origin main
```

---

## Step 6 — How To Use AI To Build Each Part

Here's the exact workflow for every feature:

### Using Cursor (best for this project)
```
1. Install Cursor (cursor.com) — it's VS Code with AI built in
2. Open your lifeos/ folder in Cursor
3. Use Cmd+K to generate code inline
4. Use Cmd+L to chat about architecture
```

**The rule:** AI generates the file skeleton. You fill in the business logic. Example:
```
You tell Cursor:
"Generate a React component for a project card that shows 
title, progress bar, deadline countdown, and area colour. 
Use Tailwind. Props: project, area, onClick."

Cursor generates it.
You review every line.
You modify the styling and logic.
You commit it.
```

### Using Claude (this chat) for architecture
Use me for:
- "What's the best way to structure the AI provider abstraction?"
- "Review this Python scheduler logic"
- "Help me write the system prompt for goal extraction"

---

## Step 7 — Build Order With AI Assistance
```
Week 1 — Foundation (you + Cursor)
├── Day 1: Supabase schema + seed data (SQL, you write it)
├── Day 2: React routing + layout shell (Cursor generates, you style)
├── Day 3: Life Document page (Cursor scaffolds, you add logic)
├── Day 4: Project + Task CRUD (you design the UX, Cursor helps)
└── Day 5: Supabase hooks + real data (you write the data layer)

Week 2 — AI Core (you + Claude prompts)
├── Day 1: AI provider abstraction in Python (I'll give you this)
├── Day 2: Goal extraction prompt engineering (you design prompts)
├── Day 3: Schedule generation logic (you own the algorithm)
└── Day 4: Wire AI to web chat interface

Week 3 — Telegram Bot (Python, your strongest layer as AI student)
├── Day 1: Bot setup + command handlers
├── Day 2: Morning briefing (8AM) + evening review (9PM)  
├── Day 3: Check-in flow + emergency reschedule
└── Day 4: XP notifications + achievement alerts

Week 4 — Polish + Deploy
├── Day 1: Analytics dashboard
├── Day 2: Gamification (XP, levels, streaks)
├── Day 3: Deploy web (Vercel) + bot (Railway free)
└── Day 4: Portfolio write-up + demo videogit add .
git commit -m "feat: initial project scaffold

- conda env with Python 3.11
- React + Vite web app bootstrapped
- Python bot structure created
- Supabase schema planned
- README with architecture overview"

# Push to GitHub
gh repo create lifeos --public
git push -u origin main
```

---

## Step 6 — How To Use AI To Build Each Part

Here's the exact workflow for every feature:

### Using Cursor (best for this project)
```
1. Install Cursor (cursor.com) — it's VS Code with AI built in
2. Open your lifeos/ folder in Cursor
3. Use Cmd+K to generate code inline
4. Use Cmd+L to chat about architecture
```

**The rule:** AI generates the file skeleton. You fill in the business logic. Example:
```
You tell Cursor:
"Generate a React component for a project card that shows 
title, progress bar, deadline countdown, and area colour. 
Use Tailwind. Props: project, area, onClick."

Cursor generates it.
You review every line.
You modify the styling and logic.
You commit it.
```

### Using Claude (this chat) for architecture
Use me for:
- "What's the best way to structure the AI provider abstraction?"
- "Review this Python scheduler logic"
- "Help me write the system prompt for goal extraction"

---

## Step 7 — Build Order With AI Assistance
```
Week 1 — Foundation (you + Cursor)
├── Day 1: Supabase schema + seed data (SQL, you write it)
├── Day 2: React routing + layout shell (Cursor generates, you style)
├── Day 3: Life Document page (Cursor scaffolds, you add logic)
├── Day 4: Project + Task CRUD (you design the UX, Cursor helps)
└── Day 5: Supabase hooks + real data (you write the data layer)

Week 2 — AI Core (you + Claude prompts)
├── Day 1: AI provider abstraction in Python (I'll give you this)
├── Day 2: Goal extraction prompt engineering (you design prompts)
├── Day 3: Schedule generation logic (you own the algorithm)
└── Day 4: Wire AI to web chat interface

Week 3 — Telegram Bot (Python, your strongest layer as AI student)
├── Day 1: Bot setup + command handlers
├── Day 2: Morning briefing (8AM) + evening review (9PM)  
├── Day 3: Check-in flow + emergency reschedule
└── Day 4: XP notifications + achievement alerts

Week 4 — Polish + Deploy
├── Day 1: Analytics dashboard
├── Day 2: Gamification (XP, levels, streaks)
├── Day 3: Deploy web (Vercel) + bot (Railway free)
└── Day 4: Portfolio write-up + demo video