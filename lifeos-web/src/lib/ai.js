/**
 * LifeOS — AI Provider Layer (Frontend)
 * =======================================
 * Mirrors the Python ai.py but runs in the browser.
 * Provider is set by the user in Settings and stored in localStorage.
 *
 * Portfolio note: Same Strategy Pattern as the Python layer.
 * Consistent architecture across both surfaces.
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────

export const AI_PROVIDERS = {
  groq: {
    name: "Groq · Llama 3.3",
    label: "Free",
    color: "#f59e0b",
    model: "llama-3.3-70b-versatile",
    baseURL: "https://api.groq.com/openai/v1/chat/completions",
  },
  gemini: {
    name: "Gemini 1.5 Flash",
    label: "Free",
    color: "#3b82f6",
    model: "gemini-1.5-flash",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
  },
  claude: {
    name: "Claude Haiku",
    label: "~£0.01/msg",
    color: "#a78bfa",
    model: "claude-haiku-4-5-20251001",
    baseURL: "https://api.anthropic.com/v1/messages",
  },
  ollama: {
    name: "Ollama (Local)",
    label: "Free",
    color: "#34d399",
    baseURL: "http://localhost:11434/api/chat",
  },
};

// ─── CONFIG STORAGE ───────────────────────────────────────────────────────────

export function getAIConfig() {
  return {
    provider: localStorage.getItem("ai_provider") || "groq",
    apiKey: localStorage.getItem("ai_api_key") || "",
    ollamaModel: localStorage.getItem("ollama_model") || "llama3.2",
  };
}

export function saveAIConfig(config) {
  localStorage.setItem("ai_provider", config.provider);
  localStorage.setItem("ai_api_key", config.apiKey);
  if (config.ollamaModel) localStorage.setItem("ollama_model", config.ollamaModel);
}

// ─── PROVIDER IMPLEMENTATIONS ─────────────────────────────────────────────────

async function groqChat(messages, system, apiKey) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: system }, ...messages],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `Groq error ${response.status}`);
  }
  const data = await response.json();
  return data.choices[0].message.content;
}

async function geminiChat(messages, system, apiKey) {
  const contents = [];
  if (system) {
    contents.push({ role: "user", parts: [{ text: system }] });
    contents.push({ role: "model", parts: [{ text: "Understood." }] });
  }
  for (const msg of messages) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }) }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `Gemini error ${response.status}`);
  }
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

async function claudeChat(messages, system, apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system,
      messages,
    }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `Claude error ${response.status}`);
  }
  const data = await response.json();
  return data.content[0].text;
}

async function ollamaChat(messages, system, ollamaModel = "llama3.2") {
  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      messages: [{ role: "system", content: system }, ...messages],
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`Ollama error ${response.status} — is Ollama running?`);
  const data = await response.json();
  return data.message.content;
}

// ─── PUBLIC INTERFACE ─────────────────────────────────────────────────────────

export async function chat(messages, system = "") {
  const { provider, apiKey, ollamaModel } = getAIConfig();

  switch (provider) {
    case "groq":    return groqChat(messages, system, apiKey);
    case "gemini":  return geminiChat(messages, system, apiKey);
    case "claude":  return claudeChat(messages, system, apiKey);
    case "ollama":  return ollamaChat(messages, system, ollamaModel);
    default:        throw new Error(`Unknown provider: ${provider}`);
  }
}

export async function extractGoalFromText(userText, existingProjects = []) {
  const today = new Date().toISOString().split("T")[0];
  const system = `You are LifeOS, an AI productivity assistant.
Today's date is ${today}. Always use this as reference for relative dates like "next Friday" or "tomorrow".
Extract structured goal/project data from the user's message.
Return ONLY valid JSON, no markdown, no explanation.

Life area IDs: work, study, health, social, hobbies, selfcare, sleep, meals, growth, admin
Task types: coding, writing, studying, meeting, exercise, reading, design, admin, other
Difficulty: easy | medium | hard
Priority: low | medium | high`;

  const existingTitles = existingProjects.map((p) => p.title);
  const prompt = `User message: "${userText}"
Existing projects (avoid duplicates): ${JSON.stringify(existingTitles)}

Return this exact JSON structure:
{
  "title": "project title",
  "area_id": "study",
  "deadline": "YYYY-MM-DD or null",
  "priority": "high",
  "urgency": "high",
  "estimated_hours": 15,
  "difficulty": "hard",
  "tasks": [
    {"title": "task name", "type": "coding", "estimated_mins": 180, "difficulty": "hard", "due_date": "YYYY-MM-DD or null"}
  ],
  "clarifying_questions": []
}`;

  const response = await chat([{ role: "user", content: prompt }], system);
  const cleaned = response.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

export async function generateDailySchedule(projects, tasks) {
  const today = new Date().toISOString().split("T")[0];
  const system = `You are LifeOS scheduler. Generate an optimal time-blocked daily schedule.
Rules:
- Start 09:00, end by 22:00. Deep work max 90 mins, then 15 min break.
- Prioritise high urgency + nearest deadlines first.
- Mix difficult and easy tasks (dopamine scheduling).
- Include lunch 12:30-13:30.
- Return ONLY a valid JSON array, no markdown.`;

  const taskSummary = tasks
    .filter((t) => !t.done)
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      title: t.title,
      type: t.task_type || "general",
      estimated_mins: t.estimated_mins || 30,
      difficulty: t.difficulty || "medium",
      due_date: t.due_date,
      project: projects.find((p) => p.id === t.project_id)?.title || "",
    }));

  const prompt = `Date: ${today}
Pending tasks: ${JSON.stringify(taskSummary)}

Return schedule as JSON array:
[{"time":"09:00","end":"10:30","type":"deep","title":"...","task_id":"uuid or null","area":"study"}]
Block types: deep | medium | quick | break | meal | reflection`;

  const response = await chat([{ role: "user", content: prompt }], system);
  const cleaned = response.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}
