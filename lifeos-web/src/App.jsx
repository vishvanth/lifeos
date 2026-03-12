import { useState, useEffect, useRef, useCallback } from "react";
import {
  supabase, LIFE_AREAS, AREA_MAP, getXpInfo,
  getProjects, createProject, updateProject,
  getTasks, completeTask, getStats, saveSchedule, getTodaysSchedule,
} from "./lib/supabase";
import {
  chat, extractGoalFromText, generateDailySchedule,
  AI_PROVIDERS, getAIConfig, saveAIConfig,
} from "./lib/ai";

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=JetBrains+Mono:wght@300;400;500&family=Outfit:wght@300;400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0c0c0c; --bg2: #141414; --bg3: #1c1c1c; --bg4: #242424;
      --border: #272727; --border2: #333;
      --text: #e8e3d9; --text2: #8a8278; --text3: #4a4642;
      --accent: #f59e0b; --accent2: #d97706; --accent-dim: rgba(245,158,11,0.1);
      --red: #ef4444; --green: #10b981; --blue: #60a5fa; --purple: #a78bfa;
      --font-display: 'DM Serif Display', serif;
      --font-mono: 'JetBrains Mono', monospace;
      --font-body: 'Outfit', sans-serif;
      --r: 8px;
    }
    html, body, #root { height: 100%; }
    body { background: var(--bg); color: var(--text); font-family: var(--font-body); font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased; }
    ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: var(--bg); } ::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }
    button { cursor: pointer; border: none; background: none; font-family: var(--font-body); color: var(--text); transition: opacity 0.15s; }
    button:hover { opacity: 0.8; }
    input, textarea, select { font-family: var(--font-body); color: var(--text); background: var(--bg3); border: 1px solid var(--border); border-radius: var(--r); outline: none; transition: border-color 0.2s; }
    input:focus, textarea:focus, select:focus { border-color: var(--accent); }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    .fade-up { animation: fadeUp 0.35s ease forwards; }
    .spinner { width: 16px; height: 16px; border: 2px solid var(--border2); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
  `}</style>
);

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function ProgressBar({ value, color, height = 4 }) {
  return (
    <div style={{ width: "100%", height, background: "var(--bg4)", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(value, 100)}%`, height: "100%", background: color || "var(--accent)", borderRadius: 99, transition: "width 0.6s ease" }} />
    </div>
  );
}

function Badge({ children, color }) {
  return (
    <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontFamily: "var(--font-mono)", background: color ? `${color}20` : "var(--bg4)", color: color || "var(--text2)", border: `1px solid ${color ? `${color}40` : "var(--border)"}`, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Card({ children, style, onClick }) {
  return (
    <div onClick={onClick} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 20, transition: "border-color 0.2s", cursor: onClick ? "pointer" : "default", ...style }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = "var(--border2)")}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = "var(--border)")}>
      {children}
    </div>
  );
}

function Btn({ children, onClick, variant = "default", size = "md", disabled, style }) {
  const styles = {
    default: { background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)" },
    accent: { background: "var(--accent)", border: "none", color: "#000", fontWeight: 600 },
    ghost: { background: "transparent", border: "none", color: "var(--text2)" },
    danger: { background: "var(--bg3)", border: "1px solid var(--red)", color: "var(--red)" },
  };
  const sizes = { sm: { padding: "4px 12px", fontSize: 12 }, md: { padding: "8px 16px", fontSize: 13 }, lg: { padding: "12px 24px", fontSize: 14 } };
  return (
    <button onClick={onClick} disabled={disabled} style={{ borderRadius: "var(--r)", fontFamily: "var(--font-body)", transition: "all 0.15s", opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer", ...styles[variant], ...sizes[size], ...style }}>
      {children}
    </button>
  );
}

function XPBar({ stats }) {
  if (!stats) return null;
  const { level, pct, nextXp } = getXpInfo(stats.total_xp);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", minWidth: 50 }}>LVL {level}</span>
      <div style={{ flex: 1, height: 4, background: "var(--bg4)", borderRadius: 99, overflow: "hidden", minWidth: 80 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 99, transition: "width 0.8s ease" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)" }}>{stats.total_xp}/{nextXp}</span>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────

const NAV = [
  { id: "dashboard", icon: "⊡", label: "Dashboard" },
  { id: "life",      icon: "◈", label: "Life Document" },
  { id: "schedule",  icon: "▦", label: "Schedule" },
  { id: "chat",      icon: "◎", label: "AI Assistant" },
  { id: "analytics", icon: "◉", label: "Analytics" },
  { id: "settings",  icon: "⊞", label: "Settings" },
];

function Sidebar({ page, setPage, stats }) {
  return (
    <aside style={{ width: 220, background: "var(--bg2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", height: "100vh", position: "fixed", left: 0, top: 0, zIndex: 100 }}>
      {/* Logo */}
      <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--accent)", letterSpacing: "-0.02em" }}>LifeOS</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", marginTop: 2 }}>personal chief of staff</div>
      </div>

      {/* XP Bar */}
      {stats && (
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
          <XPBar stats={stats} />
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)" }}>🔥 {stats.current_streak}d streak</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)" }}>P:{stats.productivity_score ?? 0}</span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 8px" }}>
        {NAV.map((item) => (
          <button key={item.id} onClick={() => setPage(item.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 6, marginBottom: 2, background: page === item.id ? "var(--accent-dim)" : "transparent", color: page === item.id ? "var(--accent)" : "var(--text2)", border: "none", fontSize: 13, textAlign: "left", fontFamily: "var(--font-body)", transition: "all 0.15s" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, width: 18, textAlign: "center" }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Date */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)" }}>
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
        </div>
      </div>
    </aside>
  );
}

// ─── DASHBOARD PAGE ───────────────────────────────────────────────────────────

function Dashboard({ projects, stats, schedule, onCompleteTask }) {
  const todayTasks = (projects || []).flatMap((p) =>
    (p.tasks || []).filter((t) => !t.done && t.due_date <= new Date().toISOString().split("T")[0])
  ).slice(0, 5);

  const totalProgress = projects?.length
    ? Math.round(projects.reduce((s, p) => s + (p.progress || 0), 0) / projects.length)
    : 0;

  const blockColors = { deep: "#60a5fa", medium: "#f59e0b", quick: "#34d399", break: "#4a4642", meal: "#2dd4bf", reflection: "#c084fc" };

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 400, letterSpacing: "-0.02em" }}>
          Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}.
        </h1>
        <p style={{ color: "var(--text2)", marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 11 }}>
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Productivity", value: `${stats?.productivity_score ?? 0}`, unit: "/100", color: "var(--accent)" },
          { label: "Focus Score", value: `${stats?.focus_score ?? 0}`, unit: "/100", color: "var(--blue)" },
          { label: "Life Progress", value: `${totalProgress}`, unit: "%", color: "var(--green)" },
          { label: "Streak", value: `${stats?.current_streak ?? 0}`, unit: "days", color: "var(--purple)" },
        ].map((s) => (
          <Card key={s.label} style={{ padding: 16 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 28, color: s.color }}>{s.value}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text3)" }}>{s.unit}</span>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Today's schedule */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Today's Schedule</span>
            <Badge color="var(--accent)">{schedule?.blocks?.length ?? 0} blocks</Badge>
          </div>
          {schedule?.blocks?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {schedule.blocks.slice(0, 7).map((block, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", minWidth: 38 }}>{block.time}</span>
                  <div style={{ width: 3, height: 24, background: blockColors[block.type] || "var(--border2)", borderRadius: 99, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: block.type === "break" || block.type === "meal" ? "var(--text3)" : "var(--text)" }}>{block.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--text3)", fontSize: 12 }}>No schedule yet — go to Schedule page to generate one.</p>
          )}
        </Card>

        {/* Due today */}
        <Card>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Due Today</div>
          {todayTasks.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {todayTasks.map((task) => {
                const area = AREA_MAP[projects?.find((p) => p.id === task.project_id)?.area_id];
                return (
                  <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => onCompleteTask(task)} style={{ width: 16, height: 16, borderRadius: 4, border: "1px solid var(--border2)", background: "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }} title="Mark done">□</button>
                    <span style={{ flex: 1, fontSize: 12, color: "var(--text)" }}>{task.title}</span>
                    {area && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: area.color }}>{area.icon}</span>}
                    <Badge>{task.difficulty}</Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "var(--text3)", fontSize: 12 }}>Nothing due today. Add goals via the AI Assistant.</p>
          )}
        </Card>

        {/* Life areas overview */}
        <Card style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Life Areas — Bird's Eye View</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {LIFE_AREAS.map((area) => {
              const areaProjects = (projects || []).filter((p) => p.area_id === area.id);
              const avgProgress = areaProjects.length
                ? Math.round(areaProjects.reduce((s, p) => s + (p.progress || 0), 0) / areaProjects.length)
                : 0;
              return (
                <div key={area.id} style={{ padding: 12, background: "var(--bg3)", borderRadius: 6, border: `1px solid ${area.color}22` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ color: area.color, fontSize: 16 }}>{area.icon}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)" }}>{areaProjects.length}p</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 6, lineHeight: 1.3 }}>{area.name}</div>
                  <ProgressBar value={avgProgress} color={area.color} height={3} />
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", marginTop: 4 }}>{avgProgress}%</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── LIFE DOCUMENT PAGE ───────────────────────────────────────────────────────

function LifeDocument({ projects, onRefresh }) {
  const [selectedArea, setSelectedArea] = useState(null);
  const [expandedProject, setExpandedProject] = useState(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProject, setNewProject] = useState({ title: "", area_id: "study", deadline: "", priority: "medium", estimated_hours: 5, difficulty: "medium" });
  const [saving, setSaving] = useState(false);

  const filteredProjects = selectedArea
    ? projects.filter((p) => p.area_id === selectedArea)
    : projects;

  const handleAddProject = async () => {
    if (!newProject.title) return;
    setSaving(true);
    try {
      await createProject({ ...newProject, status: "active", progress: 0 });
      setShowAddProject(false);
      setNewProject({ title: "", area_id: "study", deadline: "", priority: "medium", estimated_hours: 5, difficulty: "medium" });
      onRefresh();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  return (
    <div className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400 }}>Life Document</h1>
          <p style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>All your goals, organised by life area</p>
        </div>
        <Btn variant="accent" onClick={() => setShowAddProject(!showAddProject)}>+ Add Project</Btn>
      </div>

      {/* Add project form */}
      {showAddProject && (
        <Card style={{ marginBottom: 20, borderColor: "var(--accent)", animation: "fadeUp 0.2s ease" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.06em" }}>New Project</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            <input placeholder="Project title..." value={newProject.title} onChange={(e) => setNewProject({ ...newProject, title: e.target.value })} style={{ padding: "8px 12px", fontSize: 13 }} />
            <select value={newProject.area_id} onChange={(e) => setNewProject({ ...newProject, area_id: e.target.value })} style={{ padding: "8px 12px", fontSize: 13 }}>
              {LIFE_AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input type="date" value={newProject.deadline} onChange={(e) => setNewProject({ ...newProject, deadline: e.target.value })} style={{ padding: "8px 12px", fontSize: 13 }} />
            <select value={newProject.priority} onChange={(e) => setNewProject({ ...newProject, priority: e.target.value })} style={{ padding: "8px 12px", fontSize: 13 }}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
            <select value={newProject.difficulty} onChange={(e) => setNewProject({ ...newProject, difficulty: e.target.value })} style={{ padding: "8px 12px", fontSize: 13 }}>
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="accent" onClick={handleAddProject} disabled={saving}>{saving ? "Saving..." : "Save Project"}</Btn>
            <Btn onClick={() => setShowAddProject(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {/* Area filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={() => setSelectedArea(null)} style={{ padding: "4px 12px", borderRadius: 99, border: "1px solid var(--border)", background: !selectedArea ? "var(--accent-dim)" : "transparent", color: !selectedArea ? "var(--accent)" : "var(--text2)", fontSize: 12, fontFamily: "var(--font-body)" }}>All</button>
        {LIFE_AREAS.map((area) => {
          const count = projects.filter((p) => p.area_id === area.id).length;
          if (!count) return null;
          return (
            <button key={area.id} onClick={() => setSelectedArea(area.id === selectedArea ? null : area.id)} style={{ padding: "4px 12px", borderRadius: 99, border: `1px solid ${selectedArea === area.id ? area.color + "80" : "var(--border)"}`, background: selectedArea === area.id ? area.color + "15" : "transparent", color: selectedArea === area.id ? area.color : "var(--text2)", fontSize: 12, fontFamily: "var(--font-body)" }}>
              {area.icon} {area.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Projects */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredProjects.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◌</div>
            <div>No projects yet. Add one above or use the AI Assistant.</div>
          </div>
        )}
        {filteredProjects.map((project) => {
          const area = AREA_MAP[project.area_id] || AREA_MAP.admin;
          const tasks = project.tasks || [];
          const doneTasks = tasks.filter((t) => t.done).length;
          const isExpanded = expandedProject === project.id;
          const daysLeft = project.deadline ? Math.ceil((new Date(project.deadline) - new Date()) / 86400000) : null;

          return (
            <div key={project.id} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden" }}>
              <div onClick={() => setExpandedProject(isExpanded ? null : project.id)} style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <span style={{ color: area.color, fontSize: 18, width: 24, textAlign: "center", flexShrink: 0 }}>{area.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{project.title}</span>
                    <Badge color={project.priority === "high" ? "var(--red)" : project.priority === "medium" ? "var(--accent)" : "var(--text3)"}>{project.priority}</Badge>
                    {daysLeft !== null && <Badge color={daysLeft < 3 ? "var(--red)" : daysLeft < 7 ? "var(--accent)" : "var(--text3)"}>{daysLeft}d left</Badge>}
                  </div>
                  <ProgressBar value={project.progress || 0} color={area.color} height={3} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", textAlign: "right", flexShrink: 0 }}>
                  <div>{doneTasks}/{tasks.length} tasks</div>
                  <div style={{ marginTop: 2 }}>{project.progress || 0}%</div>
                </div>
                <span style={{ color: "var(--text3)", fontSize: 12, flexShrink: 0 }}>{isExpanded ? "▴" : "▾"}</span>
              </div>

              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "12px 16px 16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                    {[
                      ["Est. Hours", `${project.estimated_hours}h`],
                      ["Difficulty", project.difficulty],
                      ["Deadline", project.deadline || "None"],
                      ["Status", project.status],
                    ].map(([label, value]) => (
                      <div key={label} style={{ background: "var(--bg3)", padding: "8px 10px", borderRadius: 6 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text3)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 12 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Tasks</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {tasks.map((task) => (
                      <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--bg3)", borderRadius: 6, opacity: task.done ? 0.4 : 1 }}>
                        <span style={{ color: task.done ? "var(--green)" : "var(--text3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{task.done ? "✓" : "○"}</span>
                        <span style={{ flex: 1, fontSize: 12, textDecoration: task.done ? "line-through" : "none" }}>{task.title}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)" }}>{task.estimated_mins}m</span>
                        <Badge>{task.difficulty}</Badge>
                      </div>
                    ))}
                    {!tasks.length && <p style={{ color: "var(--text3)", fontSize: 12 }}>No tasks yet. Use AI Assistant to add them.</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SCHEDULE PAGE ────────────────────────────────────────────────────────────

function Schedule({ projects, schedule, onScheduleGenerated }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const blockColors = { deep: "#60a5fa", medium: "#f59e0b", quick: "#34d399", break: "#333", meal: "#2dd4bf", reflection: "#c084fc" };
  const blockLabels = { deep: "Deep Work", medium: "Focused", quick: "Quick Win", break: "Break", meal: "Meal", reflection: "Reflection" };

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const tasks = projects.flatMap((p) => (p.tasks || []).filter((t) => !t.done));
      const blocks = await generateDailySchedule(projects, tasks);
      await saveSchedule(blocks);
      onScheduleGenerated(blocks);
    } catch (e) {
      setError(`Failed: ${e.message}. Check your AI provider settings.`);
    }
    setGenerating(false);
  };

  const blocks = schedule?.blocks || [];
  const deepBlocks = blocks.filter((b) => b.type === "deep");
  const totalDeepMins = deepBlocks.reduce((s, b) => {
    const [sh, sm] = b.time.split(":").map(Number);
    const [eh, em] = b.end.split(":").map(Number);
    return s + (eh * 60 + em - (sh * 60 + sm));
  }, 0);

  return (
    <div className="fade-up">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400 }}>Today's Schedule</h1>
          <p style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Btn variant="accent" onClick={handleGenerate} disabled={generating}>
          {generating ? <><span className="spinner" style={{ marginRight: 8 }} />Generating...</> : "⟳ Generate Schedule"}
        </Btn>
      </div>

      {error && <div style={{ background: "#ef444420", border: "1px solid #ef4444", borderRadius: "var(--r)", padding: "12px 16px", marginBottom: 16, color: "#ef4444", fontSize: 13 }}>{error}</div>}

      {blocks.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Deep Work", value: `${Math.round(totalDeepMins / 60 * 10) / 10}h`, color: "var(--blue)" },
            { label: "Total Blocks", value: blocks.length, color: "var(--accent)" },
            { label: "Deep Sessions", value: deepBlocks.length, color: "var(--green)" },
          ].map((s) => (
            <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "12px 16px", display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 22, color: s.color }}>{s.value}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", textTransform: "uppercase" }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Time blocks */}
      {blocks.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 60 }}>
          <div style={{ color: "var(--text3)", fontSize: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>▦</div>
            No schedule yet. Click Generate Schedule to let the AI plan your day.
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {blocks.map((block, i) => {
            const color = blockColors[block.type] || "var(--text3)";
            const isBreak = block.type === "break" || block.type === "meal";
            return (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text3)", minWidth: 38, paddingTop: 14, textAlign: "right" }}>{block.time}</div>
                <div style={{ width: 3, background: color, borderRadius: 99, flexShrink: 0, opacity: isBreak ? 0.3 : 0.8 }} />
                <div style={{ flex: 1, background: isBreak ? "transparent" : "var(--bg2)", border: isBreak ? "none" : "1px solid var(--border)", borderRadius: "var(--r)", padding: isBreak ? "12px 0" : "12px 16px" }}>
                  {!isBreak ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{block.title}</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Badge color={color}>{blockLabels[block.type] || block.type}</Badge>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)" }}>{block.time}–{block.end}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text3)" }}>{block.title} · {block.time}–{block.end}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AI CHAT PAGE ─────────────────────────────────────────────────────────────

function AIChat({ projects, stats, onRefresh }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey! I'm your LifeOS AI. Tell me about a goal, deadline, or task — or just ask me to plan something. What are you working on?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingGoal, setPendingGoal] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const addMessage = (role, content) => setMessages((prev) => [...prev, { role, content }]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    addMessage("user", userMsg);
    setLoading(true);

    try {
      const config = getAIConfig();
      if (!config.apiKey && config.provider !== "ollama") {
        addMessage("assistant", "⚠️ No API key set. Go to **Settings** and add your API key for the selected provider.");
        setLoading(false);
        return;
      }

      // Detect if user is describing a goal/task
      const goalKeywords = ["need to", "have to", "due", "deadline", "finish", "coursework", "project", "assignment", "working on", "goal"];
      const looksLikeGoal = goalKeywords.some((k) => userMsg.toLowerCase().includes(k));

      if (looksLikeGoal) {
        addMessage("assistant", "🧠 Analysing your goal...");
        const extracted = await extractGoalFromText(userMsg, projects);

        if (extracted.clarifying_questions?.length) {
          setPendingGoal({ extracted, originalText: userMsg });
          addMessage("assistant", `I need a bit more info:\n\n${extracted.clarifying_questions.map((q) => `• ${q}`).join("\n")}\n\nJust reply with the answers.`);
        } else {
          setPendingGoal({ extracted, readyToSave: true });
          const tasks = extracted.tasks?.map((t) => `• ${t.title} (${t.estimated_mins}m, ${t.difficulty})`).join("\n") || "No tasks extracted";
          const daysLeft = extracted.deadline ? Math.ceil((new Date(extracted.deadline) - new Date()) / 86400000) : null;
          const hrsPerDay = daysLeft && extracted.estimated_hours ? (extracted.estimated_hours / daysLeft).toFixed(1) : null;

          addMessage("assistant",
            `Got it! Here's what I extracted:\n\n` +
            `📁 **${extracted.title}**\n` +
            `Area: ${extracted.area_id} · Priority: ${extracted.priority} · Difficulty: ${extracted.difficulty}\n` +
            `${extracted.deadline ? `Deadline: ${extracted.deadline}` : ""}\n` +
            `${hrsPerDay ? `→ Recommend **${hrsPerDay}h/day** to finish on time\n` : ""}\n` +
            `**Tasks:**\n${tasks}\n\n` +
            `Shall I save this to your Life Document? Reply **yes** to confirm.`
          );
        }
      } else if (userMsg.toLowerCase() === "yes" && pendingGoal?.readyToSave) {
        // Save confirmed goal
        const { extracted } = pendingGoal;
        const project = await createProject({
          area_id: extracted.area_id || "admin",
          title: extracted.title,
          deadline: extracted.deadline,
          priority: extracted.priority || "medium",
          urgency: extracted.urgency || "medium",
          estimated_hours: extracted.estimated_hours || 1,
          difficulty: extracted.difficulty || "medium",
          progress: 0,
          status: "active",
        });
        if (extracted.tasks?.length) {
          const tasksToInsert = extracted.tasks.map((t) => ({
            project_id: project.id,
            title: t.title,
            task_type: t.type || "general",
            estimated_mins: t.estimated_mins || 30,
            difficulty: t.difficulty || "medium",
            due_date: t.due_date || null,
            done: false,
          }));
          await supabase.from("tasks").insert(tasksToInsert);
        }
        setPendingGoal(null);
        onRefresh();
        addMessage("assistant", `✅ **${extracted.title}** has been added to your Life Document!\n\nHead to the Life Document or Schedule page to see it. I've structured ${extracted.tasks?.length || 0} tasks for you.`);
      } else {
        // General AI conversation
        const system = `You are LifeOS, an AI personal productivity coach. 
The user's active projects: ${projects.map((p) => p.title).join(", ")}.
XP level: ${stats?.level ?? 1}, streak: ${stats?.current_streak ?? 0} days.
Be warm, concise (3-5 sentences), and action-oriented. Apply Atomic Habits principles when relevant.`;

        const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
        history.push({ role: "user", content: userMsg });

        const response = await chat(history, system);
        addMessage("assistant", response);
      }
    } catch (e) {
      addMessage("assistant", `❌ Error: ${e.message}\n\nCheck your AI provider and API key in Settings.`);
    }
    setLoading(false);
  };

  const formatMessage = (content) => {
    return content.split("\n").map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      return <div key={i} style={{ lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: bold || "&nbsp;" }} />;
    });
  };

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400 }}>AI Assistant</h1>
        <p style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>Tell me your goals in plain English. I'll structure everything.</p>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 16 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "75%", padding: "12px 16px", borderRadius: 12, background: msg.role === "user" ? "var(--accent)" : "var(--bg2)", color: msg.role === "user" ? "#000" : "var(--text)", border: msg.role === "user" ? "none" : "1px solid var(--border)", fontSize: 13, lineHeight: 1.6 }}>
              {formatMessage(msg.content)}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "12px 16px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12 }}>
              <span className="spinner" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {["Plan my day", "I'm behind on my work", "What should I focus on?", "Give me a quick win"].map((p) => (
          <button key={p} onClick={() => setInput(p)} style={{ padding: "4px 12px", borderRadius: 99, border: "1px solid var(--border)", background: "transparent", color: "var(--text2)", fontSize: 11, fontFamily: "var(--font-body)" }}>{p}</button>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Tell me about a goal, task, or deadline..."
          style={{ flex: 1, padding: "12px 16px", fontSize: 13, borderRadius: "var(--r)" }}
        />
        <Btn variant="accent" onClick={handleSend} disabled={loading || !input.trim()} style={{ paddingLeft: 20, paddingRight: 20 }}>Send</Btn>
      </div>
    </div>
  );
}

// ─── ANALYTICS PAGE ───────────────────────────────────────────────────────────

function Analytics({ projects, stats }) {
  const allTasks = projects.flatMap((p) => p.tasks || []);
  const doneTasks = allTasks.filter((t) => t.done);
  const completionRate = allTasks.length ? Math.round((doneTasks.length / allTasks.length) * 100) : 0;

  const byDifficulty = {
    easy: allTasks.filter((t) => t.difficulty === "easy").length,
    medium: allTasks.filter((t) => t.difficulty === "medium").length,
    hard: allTasks.filter((t) => t.difficulty === "hard").length,
  };

  const { level, pct, nextXp } = getXpInfo(stats?.total_xp || 0);

  const ACHIEVEMENTS = [
    { id: "first_task", icon: "⚡", name: "First Step", desc: "Complete your first task", unlocked: doneTasks.length >= 1 },
    { id: "deep_worker", icon: "🔵", name: "Deep Worker", desc: "Complete a hard task", unlocked: doneTasks.some((t) => t.difficulty === "hard") },
    { id: "streak_5", icon: "🔥", name: "5 Day Streak", desc: "Maintain a 5-day streak", unlocked: (stats?.current_streak || 0) >= 5 },
    { id: "projects_3", icon: "◈", name: "Planner", desc: "Create 3 projects", unlocked: projects.length >= 3 },
    { id: "tasks_10", icon: "✓", name: "Executor", desc: "Complete 10 tasks", unlocked: doneTasks.length >= 10 },
    { id: "level_3", icon: "⭐", name: "Rising", desc: "Reach Level 3", unlocked: level >= 3 },
  ];

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400 }}>Analytics</h1>
        <p style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>Your productivity at a glance</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* XP Progress */}
        <Card>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>XP Progress</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 40, color: "var(--accent)" }}>Lvl {level}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text2)" }}>{stats?.total_xp || 0} XP</span>
          </div>
          <ProgressBar value={pct} color="var(--accent)" height={8} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)" }}>
            <span>Current</span><span>{nextXp} XP for next level</span>
          </div>
        </Card>

        {/* Completion rate */}
        <Card>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Task Completion</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 40, color: "var(--green)" }}>{completionRate}%</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text2)" }}>{doneTasks.length}/{allTasks.length} tasks</span>
          </div>
          <ProgressBar value={completionRate} color="var(--green)" height={8} />
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
            {Object.entries(byDifficulty).map(([diff, count]) => (
              <div key={diff}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text3)", textTransform: "uppercase" }}>{diff}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text)" }}>{count}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Project progress */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Project Progress</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {projects.map((p) => {
            const area = AREA_MAP[p.area_id] || AREA_MAP.admin;
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: area.color, width: 20, textAlign: "center" }}>{area.icon}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{p.title}</span>
                <div style={{ width: 120 }}><ProgressBar value={p.progress || 0} color={area.color} height={4} /></div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text3)", minWidth: 30 }}>{p.progress || 0}%</span>
              </div>
            );
          })}
          {!projects.length && <p style={{ color: "var(--text3)", fontSize: 12 }}>No projects yet.</p>}
        </div>
      </Card>

      {/* Achievements */}
      <Card>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Achievements</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {ACHIEVEMENTS.map((a) => (
            <div key={a.id} style={{ padding: 14, background: "var(--bg3)", borderRadius: 6, border: `1px solid ${a.unlocked ? "var(--accent)" : "var(--border)"}`, opacity: a.unlocked ? 1 : 0.4 }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{a.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: "var(--text2)" }}>{a.desc}</div>
              {a.unlocked && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", marginTop: 6, textTransform: "uppercase" }}>Unlocked ✓</div>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────

function Settings() {
  const [config, setConfig] = useState(getAIConfig);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveAIConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 400 }}>Settings</h1>
        <p style={{ color: "var(--text2)", fontSize: 12, marginTop: 4 }}>Configure your AI provider and preferences</p>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>AI Provider</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
          {Object.entries(AI_PROVIDERS).map(([id, provider]) => (
            <button key={id} onClick={() => setConfig({ ...config, provider: id })} style={{ padding: 14, borderRadius: "var(--r)", border: `1px solid ${config.provider === id ? provider.color : "var(--border)"}`, background: config.provider === id ? `${provider.color}15` : "var(--bg3)", textAlign: "left", transition: "all 0.2s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: config.provider === id ? provider.color : "var(--text)" }}>{provider.name}</span>
                <Badge color={id === "groq" || id === "gemini" || id === "ollama" ? "var(--green)" : "var(--accent)"}>{provider.label}</Badge>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)" }}>
                {id === "groq" && "Free · Llama 3.3 70B · Fastest"}
                {id === "gemini" && "Free · 1500 req/day · Google"}
                {id === "ollama" && "Local · Your uni GPU · Zero cost"}
                {id === "claude" && "Best quality · ~£0.01/message"}
              </div>
            </button>
          ))}
        </div>

        {config.provider !== "ollama" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>API Key</label>
            <input type="password" value={config.apiKey} onChange={(e) => setConfig({ ...config, apiKey: e.target.value })} placeholder={`Enter your ${AI_PROVIDERS[config.provider]?.name} API key`} style={{ width: "100%", padding: "10px 14px", fontSize: 13 }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", marginTop: 6 }}>
              {config.provider === "groq" && "Get free key at console.groq.com"}
              {config.provider === "gemini" && "Get free key at aistudio.google.com"}
              {config.provider === "claude" && "Get key at console.anthropic.com"}
            </div>
          </div>
        )}

        {config.provider === "ollama" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Ollama Model</label>
            <input value={config.ollamaModel} onChange={(e) => setConfig({ ...config, ollamaModel: e.target.value })} placeholder="llama3.2" style={{ width: "100%", padding: "10px 14px", fontSize: 13 }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", marginTop: 6 }}>Run: ollama pull llama3.2 · Make sure Ollama is running locally</div>
          </div>
        )}

        <Btn variant="accent" onClick={handleSave}>{saved ? "✓ Saved!" : "Save Settings"}</Btn>
      </Card>

      {/* Telegram info */}
      <Card>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>Telegram Bot</div>
        <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7 }}>
          Your Telegram bot runs separately as a Python process.<br />
          Configure it in <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--bg3)", padding: "1px 6px", borderRadius: 4 }}>lifeos-bot/.env</code> and start with:
        </p>
        <div style={{ background: "var(--bg3)", borderRadius: "var(--r)", padding: "12px 14px", marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text2)" }}>
          <div>conda activate lifeos</div>
          <div>cd lifeos-bot</div>
          <div>python bot.py</div>
        </div>
      </Card>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [p, s, sch] = await Promise.all([getProjects(), getStats(), getTodaysSchedule()]);
      setProjects(p || []);
      setStats(s);
      setSchedule(sch);
    } catch (e) {
      console.error("Load error:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCompleteTask = async (task) => {
    try {
      await completeTask(task.id, task.difficulty);
      await loadData();
    } catch (e) { console.error(e); }
  };

  const PAGES = {
    dashboard: <Dashboard projects={projects} stats={stats} schedule={schedule} onCompleteTask={handleCompleteTask} />,
    life:      <LifeDocument projects={projects} onRefresh={loadData} />,
    schedule:  <Schedule projects={projects} schedule={schedule} onScheduleGenerated={(blocks) => setSchedule({ blocks })} />,
    chat:      <AIChat projects={projects} stats={stats} onRefresh={loadData} />,
    analytics: <Analytics projects={projects} stats={stats} />,
    settings:  <Settings />,
  };

  return (
    <>
      <GlobalStyles />
      <div style={{ display: "flex", height: "100vh" }}>
        <Sidebar page={page} setPage={setPage} stats={stats} />
        <main style={{ marginLeft: 220, flex: 1, overflowY: "auto", padding: "36px 40px" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
              <div className="spinner" style={{ width: 28, height: 28 }} />
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text3)" }}>Loading your life...</div>
            </div>
          ) : PAGES[page]}
        </main>
      </div>
    </>
  );
}
