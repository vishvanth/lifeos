// LifeOS — Supabase client
// Single instance shared across the whole app

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Missing Supabase env vars. Create lifeos-web/.env with:\n" +
    "VITE_SUPABASE_URL=...\n" +
    "VITE_SUPABASE_ANON_KEY=..."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// ─── LIFE AREAS (static, matches DB seed) ────────────────────────────────────

export const LIFE_AREAS = [
  { id: "work",     name: "Work / Career",        icon: "◈", color: "#f59e0b" },
  { id: "study",    name: "Study / Academics",     icon: "◉", color: "#60a5fa" },
  { id: "health",   name: "Health & Fitness",      icon: "◎", color: "#34d399" },
  { id: "social",   name: "Social",                icon: "◍", color: "#a78bfa" },
  { id: "hobbies",  name: "Hobbies",               icon: "◌", color: "#f87171" },
  { id: "selfcare", name: "Self-Care",             icon: "◐", color: "#f472b6" },
  { id: "sleep",    name: "Sleep",                 icon: "◑", color: "#818cf8" },
  { id: "meals",    name: "Meals",                 icon: "◒", color: "#2dd4bf" },
  { id: "growth",   name: "Personal Growth",       icon: "◓", color: "#c084fc" },
  { id: "admin",    name: "Life Admin",            icon: "□", color: "#94a3b8" },
];

export const AREA_MAP = Object.fromEntries(LIFE_AREAS.map((a) => [a.id, a]));

// ─── XP / LEVEL SYSTEM ───────────────────────────────────────────────────────

export const LEVEL_THRESHOLDS = [0, 200, 500, 900, 1400, 2000, 2700, 3500, 4500, 6000];
export const XP_REWARDS = { easy: 10, medium: 25, hard: 50, deep_work: 40 };

export function getXpInfo(xp) {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  const nextXp = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS.at(-1);
  const prevXp = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const pct = Math.min(((xp - prevXp) / Math.max(nextXp - prevXp, 1)) * 100, 100);
  return { level, nextXp, prevXp, pct };
}

// ─── DATABASE HELPERS ─────────────────────────────────────────────────────────

export async function getProjects() {
  const { data, error } = await supabase
    .from("projects")
    .select("*, tasks(*)")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createProject(project) {
  const { data, error } = await supabase.from("projects").insert(project).select().single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, updates) {
  const { data, error } = await supabase.from("projects").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function getTasks(projectId = null) {
  let query = supabase.from("tasks").select("*, projects(title, area_id)");
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function completeTask(taskId, difficulty = "medium") {
  const { data, error } = await supabase
    .from("tasks")
    .update({ done: true, completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .select()
    .single();
  if (error) throw error;

  // Award XP
  const xp = XP_REWARDS[difficulty] ?? 25;
  await supabase.from("xp_log").insert({ amount: xp, reason: "Task completed", task_id: taskId });
  await supabase.rpc("increment_xp", { xp_amount: xp }).catch(() => {
    // Fallback if RPC not set up: manual update
    return getStats().then((s) =>
      supabase.from("user_stats").update({ total_xp: (s?.total_xp ?? 0) + xp }).eq("id", 1)
    );
  });

  return { task: data, xpGained: xp };
}

export async function getStats() {
  const { data, error } = await supabase.from("user_stats").select("*").eq("id", 1).single();
  if (error) return null;
  return data;
}

export async function getTodaysSchedule() {
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase.from("daily_schedules").select("*").eq("date", today).single();
  return data;
}

export async function saveSchedule(blocks) {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("daily_schedules")
    .upsert({ date: today, blocks, generated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}
