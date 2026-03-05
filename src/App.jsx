import { useState, useCallback } from "react";

// ─── LEVEL DATA ───────────────────────────────────────────────────────────────

const LEVELS = [
  {
    id: 1,
    name: "Tutorial: The Sacrifice",
    description: "One trap blocks the path. Send agents simultaneously — sacrifice one to clear the way for others.",
    hint: "Queue moves for multiple agents at once, then hit 'Execute Turn'. Move one agent onto the trap (💀) while the others wait — next turn, move everyone through while it sleeps.",
    grid: { cols: 5, rows: 1 },
    start: { col: 0, row: 0 },
    target: { col: 4, row: 0 },
    traps: [{ col: 2, row: 0, cooldown: 2 }],
    agents: 3,
    goal: 2,
  },
  {
    id: 2,
    name: "The Long Corridor",
    description: "A trap with cooldown 3. One agent must trigger it — then three can slip through before it reactivates.",
    hint: "With 5 agents and cooldown 3, one sacrifice + three followers = 3 survivors (the 5th agent faces a live trap again). Move agents forward together so three are right behind when the sacrifice hits.",
    grid: { cols: 7, rows: 1 },
    start: { col: 0, row: 0 },
    target: { col: 6, row: 0 },
    traps: [{ col: 3, row: 0, cooldown: 3 }],
    agents: 5,
    goal: 3,
  },
  {
    id: 3,
    name: "Two Traps",
    description: "Two hazards in sequence. The second trap has a long cooldown — if you time the sacrifice right, multiple agents can slip through.",
    hint: "Trap 1 (col 2, cooldown 2) lets 2 agents through. Trap 2 (col 5, cooldown 4) lets 4 through — but you need to have agents packed right behind the sacrifice. Move everyone forward together.",
    grid: { cols: 8, rows: 1 },
    start: { col: 0, row: 0 },
    target: { col: 7, row: 0 },
    traps: [
      { col: 2, row: 0, cooldown: 2 },
      { col: 5, row: 0, cooldown: 4 },
    ],
    agents: 6,
    goal: 3,
  },
  {
    id: 4,
    name: "Fork in the Road",
    description: "Two parallel routes, one trap each. Split your agents across both paths simultaneously.",
    hint: "Send some agents top (through row 0) and others bottom (through row 2) in the same turn. Each branch needs one sacrifice.",
    grid: { cols: 5, rows: 3 },
    start: { col: 0, row: 1 },
    target: { col: 4, row: 1 },
    traps: [
      { col: 2, row: 0, cooldown: 2 },
      { col: 2, row: 2, cooldown: 2 },
    ],
    customGraph: true,
    agents: 6,
    goal: 4,
  },
  {
    id: 5,
    name: "The Gauntlet",
    description: "Three traps, each cooldown 2. The math is merciless: ⌈8/3⌉=3 sacrifices at trap 1 leaves 5, ⌈5/3⌉=2 at trap 2 leaves 3, then 1 sacrifice at trap 3 — only 1 survivor is possible.",
    hint: "Pack agents tightly (2 followers behind each sacrifice). You need exactly 3+2+1=6 sacrifices across the three traps to get that one agent through.",
    grid: { cols: 9, rows: 1 },
    start: { col: 0, row: 0 },
    target: { col: 8, row: 0 },
    traps: [
      { col: 2, row: 0, cooldown: 2 },
      { col: 5, row: 0, cooldown: 2 },
      { col: 7, row: 0, cooldown: 1 },
    ],
    agents: 8,
    goal: 1,
  },
];

// ─── MODULE-LEVEL GRAPH ───────────────────────────────────────────────────────
// Kept outside React state to avoid JSON.parse/stringify destroying Set & Map.

let currentGraph = null;

const cellKey = (col, row) => `${col},${row}`;
const parseKey  = (k) => k.split(",").map(Number);

function buildGraph(level) {
  const nodes = new Set();
  const edges = new Map();

  const addNode = (c, r) => nodes.add(cellKey(c, r));
  const addEdge = (k1, k2) => {
    if (!edges.has(k1)) edges.set(k1, new Set());
    if (!edges.has(k2)) edges.set(k2, new Set());
    edges.get(k1).add(k2);
    edges.get(k2).add(k1);
  };

  if (level.customGraph) {
    [[0,1],[1,1],[1,0],[2,0],[3,0],[3,1],[4,1],[1,2],[2,2],[3,2]]
      .forEach(([c,r]) => addNode(c,r));
    addEdge(cellKey(0,1), cellKey(1,1));
    addEdge(cellKey(1,1), cellKey(1,0));
    addEdge(cellKey(1,0), cellKey(2,0));
    addEdge(cellKey(2,0), cellKey(3,0));
    addEdge(cellKey(3,0), cellKey(3,1));
    addEdge(cellKey(1,1), cellKey(1,2));
    addEdge(cellKey(1,2), cellKey(2,2));
    addEdge(cellKey(2,2), cellKey(3,2));
    addEdge(cellKey(3,2), cellKey(3,1));
    addEdge(cellKey(3,1), cellKey(4,1));
  } else {
    const { cols, rows } = level.grid;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        addNode(c, r);
        if (c + 1 < cols) addEdge(cellKey(c, r), cellKey(c + 1, r));
        if (r + 1 < rows) addEdge(cellKey(c, r), cellKey(c, r + 1));
      }
    }
  }
  return { nodes, edges };
}

function getNeighbors(pos) {
  return Array.from(currentGraph.edges.get(pos) || []);
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CELL_SIZE = 72;
const AGENT_COLORS = [
  "#60a5fa","#34d399","#f472b6","#fbbf24",
  "#a78bfa","#fb923c","#38bdf8","#4ade80",
];

// ─── STATE INIT ───────────────────────────────────────────────────────────────

function initState(level) {
  currentGraph = buildGraph(level);
  const trapStates = {};
  level.traps.forEach(t => {
    trapStates[cellKey(t.col, t.row)] = { active: true, cooldown: t.cooldown, timer: 0 };
  });
  return {
    agents: Array.from({ length: level.agents }, (_, i) => ({
      id: i,
      pos: cellKey(level.start.col, level.start.row),
      alive: true,
      atTarget: false,
      color: AGENT_COLORS[i % AGENT_COLORS.length],
    })),
    traps: trapStates,
    // Planning state — moves queued for this turn before committing
    selected: null,        // agent id currently being directed
    pendingMoves: {},      // { agentId: targetPos } — queued but not yet executed
    turn: 0,
    phase: "playing",
    log: ["Plan moves for your agents, then press ▶ Execute Turn."],
  };
}

// ─── GAME LOGIC ───────────────────────────────────────────────────────────────

/**
 * Queue (or toggle) a move for one agent. Does NOT advance the turn.
 * Validates: must be a neighbor, destination must not be claimed by another
 * pending move (unless start/target), and agent must be alive/active.
 */
function queueMove(state, level, agentId, targetPos) {
  const agent = state.agents[agentId];
  if (!agent || !agent.alive || agent.atTarget)
    return state;

  // Toggle off if same destination already queued for this agent
  if (state.pendingMoves[agentId] === targetPos) {
    const pm = { ...state.pendingMoves };
    delete pm[agentId];
    return { ...state, pendingMoves: pm, selected: null };
  }

  if (!getNeighbors(agent.pos).includes(targetPos))
    return { ...state, log: ["Not a neighboring cell.", ...state.log.slice(0,5)] };

  const startPos   = cellKey(level.start.col, level.start.row);
  const targetCell = cellKey(level.target.col, level.target.row);

  // Check that no other pending move already claims this cell
  // (start and target allow stacking)
  if (targetPos !== startPos && targetPos !== targetCell) {
    const alreadyClaimed = Object.entries(state.pendingMoves).some(
      ([aid, dest]) => Number(aid) !== agentId && dest === targetPos
    );
    if (alreadyClaimed)
      return { ...state, log: ["Another agent is already moving there!", ...state.log.slice(0,5)] };
  }

  const pm = { ...state.pendingMoves, [agentId]: targetPos };
  return { ...state, pendingMoves: pm, selected: null };
}

/**
 * Commit all pending moves simultaneously, resolve traps, tick cooldowns,
 * check win/lose. Returns the next game state.
 */
function executeTurn(state, level) {
  if (Object.keys(state.pendingMoves).length === 0)
    return { ...state, log: ["Queue at least one move first!", ...state.log.slice(0,5)] };

  const newAgents = state.agents.map(a => ({ ...a }));
  const newTraps  = {};
  Object.entries(state.traps).forEach(([k, v]) => { newTraps[k] = { ...v }; });

  const targetCell = cellKey(level.target.col, level.target.row);
  const logParts   = [];

  // Apply all moves simultaneously
  Object.entries(state.pendingMoves).forEach(([aid, dest]) => {
    const a = newAgents[Number(aid)];
    if (!a.alive || a.atTarget) return;
    a.pos = dest;
  });

  // Resolve traps — any agent that landed on an active trap is eliminated.
  // Multiple agents on the same trap cell: only the first (lowest id) triggers it,
  // but all others on that cell in the same turn also die (trap was still active for them too).
  // We process in agent-id order for determinism.
  newAgents.forEach(a => {
    if (!a.alive || a.atTarget) return;
    if (newTraps[a.pos]?.active) {
      a.alive = false;
      a.pos   = "dead";
      if (newTraps[a.pos === "dead" ? Object.keys(state.pendingMoves).find(aid => state.pendingMoves[aid] === a.pos) : a.pos]) {
        // Already deactivated by an earlier agent this turn — still dead
      }
    }
  });

  // Re-resolve properly: iterate agents in id order, deactivate trap on first hit
  newAgents.forEach(a => { if (state.pendingMoves[a.id] !== undefined) a.pos = state.pendingMoves[a.id]; });
  // Reset and redo cleanly
  newAgents.forEach((a, i) => { Object.assign(a, { ...state.agents[i] }); });

  // --- Clean simultaneous resolution ---
  // 1. Compute destination for each moving agent
  const destinations = {}; // agentId -> dest
  Object.entries(state.pendingMoves).forEach(([aid, dest]) => {
    const a = state.agents[Number(aid)];
    if (a.alive && !a.atTarget) destinations[Number(aid)] = dest;
  });

  // 2. Apply positions
  newAgents.forEach((a, i) => { Object.assign(a, { ...state.agents[i] }); });
  Object.entries(destinations).forEach(([aid, dest]) => {
    newAgents[Number(aid)].pos = dest;
  });

  // 3. Reactivate traps whose cooldown has expired BEFORE resolving moves.
  //    timer counts elapsed inactive turns (0 = just deactivated).
  //    When timer == cooldown the trap is hot again at the START of this turn.
  const reactivated = [];
  Object.keys(newTraps).forEach(tk => {
    const trap = newTraps[tk];
    if (!trap.active && trap.timer >= trap.cooldown) {
      trap.active = true;
      trap.timer  = 0;
      reactivated.push(tk);
    }
  });
  if (reactivated.length) logParts.push(`🔴 Trap(s) reactivated: ${reactivated.join(", ")}`);

  // 4. Resolve traps: any agent that stepped on an ACTIVE trap dies.
  //    Only traps that were already active BEFORE this turn (or just reactivated in step 3) kill.
  const firedThisTurn = new Set();
  newAgents.forEach(a => {
    if (!a.alive || a.atTarget) return;
    const trap = newTraps[a.pos];
    if (trap && trap.active) {
      trap.active = false;
      trap.timer  = 0;   // elapsed=0; will be incremented from NEXT turn onward
      firedThisTurn.add(a.pos);
      a.alive = false;
      a.pos   = "dead";
      logParts.push(`💥 Agent ${a.id + 1} triggered trap at (${destinations[a.id]})! Cooldown: ${trap.cooldown}.`);
    }
  });

  // 5. Check target arrivals
  newAgents.forEach(a => {
    if (a.alive && !a.atTarget && a.pos === targetCell) {
      a.atTarget = true;
      logParts.push(`✅ Agent ${a.id + 1} reached the target!`);
    }
  });

  // 6. Tick cooldown timers (count-up).
  //    Traps fired THIS turn stay at 0 (shown as 0/C after this turn).
  //    All other inactive traps get +1 elapsed turn.
  //    Reactivation happens at the START of next turn when timer reaches cooldown (step 3).
  Object.keys(newTraps).forEach(tk => {
    const trap = newTraps[tk];
    if (!trap.active && !firedThisTurn.has(tk)) {
      trap.timer += 1;
    }
  });

  if (logParts.length === 0) logParts.push(`Turn ${state.turn + 1}: agents advanced.`);

  const newLog   = [...logParts, ...state.log.slice(0, 5)];
  const active   = newAgents.filter(a => a.alive && !a.atTarget);
  const succeeded = newAgents.filter(a => a.atTarget).length;

  let phase = "playing";
  if (active.length === 0) {
    if (succeeded >= level.goal) {
      phase = "won";
      newLog.unshift(`🎉 Mission complete! ${succeeded} agents reached safety.`);
    } else {
      phase = "lost";
      newLog.unshift(`💀 Only ${succeeded}/${level.goal} agents survived. Try again!`);
    }
  }

  return {
    agents:       newAgents,
    traps:        newTraps,
    selected:     null,
    pendingMoves: {},
    turn:         state.turn + 1,
    phase,
    log:          newLog,
  };
}

// ─── VISUAL COMPONENTS ───────────────────────────────────────────────────────

function TrapIcon({ active, timer, cooldown }) {
  // Three visual states:
  // 1. active   — red, skull, dangerous right now
  // 2. warning  — timer==0 & inactive: grey with amber "!" — safe THIS turn, reactivates after moves
  // 3. cooldown — timer>0 & inactive: dark blue, sleeping, cyan arc countdown
  const r = 14;
  const circ = 2 * Math.PI * r;
  const progress = active ? 0 : timer / cooldown;
  const dashOffset = circ * (1 - progress);

  return (
    <div style={{
      width: 52, height: 52, borderRadius: 8,
      background: active ? "linear-gradient(135deg,#ef4444,#7f1d1d)" : "linear-gradient(135deg,#1e293b,#0f172a)",
      border: active ? "2px solid #fca5a5" : "2px solid #334155",
      boxShadow: active ? "0 0 16px rgba(239,68,68,0.7)" : "0 0 6px rgba(0,0,0,0.4)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      transition: "background 0.3s, border 0.3s, box-shadow 0.3s",
      pointerEvents: "none", flexShrink: 0,
      position: "relative", gap: 1,
    }}>
      {!active && (
        <svg width="52" height="52" style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
          <circle cx="26" cy="26" r={r} fill="none" stroke="#1e3a5f" strokeWidth="3" />
          <circle cx="26" cy="26" r={r} fill="none"
            stroke="#22d3ee" strokeWidth="3"
            strokeDasharray={circ}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
      )}
      <span style={{ fontSize: 18, lineHeight: 1, zIndex: 1 }}>
        {active ? "💀" : "😴"}
      </span>
      <div style={{
        fontSize: 10, fontFamily: "monospace", fontWeight: 700, lineHeight: 1, zIndex: 1,
        color: active ? "rgba(255,200,200,0.85)" : "#22d3ee",
      }}>
        {active ? `c=${cooldown}` : `${timer}/${cooldown}`}
      </div>
    </div>
  );
}

function AgentBubble({ color, selected, pending, tiny }) {
  const size = tiny ? 22 : 28;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color,
      border: selected
        ? "3px solid #fff"
        : pending
          ? "3px solid #fbbf24"
          : "2px solid rgba(255,255,255,0.2)",
      boxShadow: selected
        ? `0 0 18px #fff, 0 0 8px ${color}`
        : pending
          ? `0 0 10px #fbbf24`
          : "0 2px 6px rgba(0,0,0,0.5)",
      transition: "all 0.15s", flexShrink: 0, pointerEvents: "none",
    }} />
  );
}

function GameGrid({ level, state, onCellClick }) {
  const startPos   = cellKey(level.start.col, level.start.row);
  const targetPos  = cellKey(level.target.col, level.target.row);
  const selectedId = state.selected;
  const selectedAgent = selectedId !== null ? state.agents[selectedId] : null;

  // Valid moves for selected agent (excluding cells claimed by pending moves of others)
  const validMoves = selectedAgent
    ? getNeighbors(selectedAgent.pos).filter(nb => {
        if (nb === startPos || nb === targetPos) return true;
        return !Object.entries(state.pendingMoves).some(
          ([aid, dest]) => Number(aid) !== selectedId && dest === nb
        );
      })
    : [];

  // Where each agent is visually headed (for arrow / ghost rendering)
  const agentsAt    = k => state.agents.filter(a => a.alive && !a.atTarget && a.pos === k);
  const pendingAt   = k => Object.entries(state.pendingMoves)
    .filter(([, dest]) => dest === k)
    .map(([aid]) => state.agents[Number(aid)])
    .filter(a => a && a.alive && !a.atTarget);
  const succeededAgents = state.agents.filter(a => a.atTarget);

  const W = level.grid.cols * CELL_SIZE;
  const H = level.grid.rows * CELL_SIZE;
  const nodes = Array.from(currentGraph.nodes);

  // Build edge lines for SVG
  const drawnEdges = new Set();
  const edgeLines  = [];
  nodes.forEach(k => {
    getNeighbors(k).forEach(nk => {
      const eid = [k, nk].sort().join("|");
      if (!drawnEdges.has(eid)) {
        drawnEdges.add(eid);
        const [c,  r ] = parseKey(k);
        const [nc, nr] = parseKey(nk);
        edgeLines.push({
          x1: c  * CELL_SIZE + CELL_SIZE / 2, y1: r  * CELL_SIZE + CELL_SIZE / 2,
          x2: nc * CELL_SIZE + CELL_SIZE / 2, y2: nr * CELL_SIZE + CELL_SIZE / 2,
        });
      }
    });
  });

  // Build pending-move arrows for SVG
  const arrows = Object.entries(state.pendingMoves).map(([aid, dest]) => {
    const a = state.agents[Number(aid)];
    if (!a || !a.alive || a.atTarget) return null;
    const [sc, sr] = parseKey(a.pos);
    const [dc, dr] = parseKey(dest);
    return {
      x1: sc * CELL_SIZE + CELL_SIZE / 2,
      y1: sr * CELL_SIZE + CELL_SIZE / 2,
      x2: dc * CELL_SIZE + CELL_SIZE / 2,
      y2: dr * CELL_SIZE + CELL_SIZE / 2,
      color: a.color,
    };
  }).filter(Boolean);

  return (
    <div style={{ position: "relative", width: W, height: H, margin: "0 auto" }}>
      {/* Edge lines — rendered BEHIND the cell divs */}
      <svg style={{ position: "absolute", top: 0, left: 0, width: W, height: H, pointerEvents: "none", zIndex: 0 }}>
        {edgeLines.map((e, i) => (
          <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke="#1e3a5f" strokeWidth={4} strokeLinecap="round" />
        ))}
      </svg>

      {/* Pending-move arrows — rendered ABOVE the cell divs */}
      {arrows.length > 0 && (
        <svg style={{ position: "absolute", top: 0, left: 0, width: W, height: H, pointerEvents: "none", zIndex: 3 }}>
          <defs>
            {arrows.map((arr, i) => (
              <marker key={i} id={`arrowhead-${i}`} markerWidth="6" markerHeight="6"
                refX="5" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill={arr.color} opacity="0.9" />
              </marker>
            ))}
          </defs>
          {arrows.map((arr, i) => {
            const dx = arr.x2 - arr.x1, dy = arr.y2 - arr.y1;
            const len = Math.sqrt(dx*dx + dy*dy) || 1;
            const shorten = 20;
            const lengthen = 6;
            return (
              <line key={`arr-${i}`}
                x1={arr.x1 + dx/len*lengthen} y1={arr.y1 + dy/len*lengthen}
                x2={arr.x2 - dx/len*shorten}  y2={arr.y2 - dy/len*shorten}
                stroke={arr.color} strokeWidth={2.5} strokeDasharray="5 3" opacity="0.9"
                markerEnd={`url(#arrowhead-${i})`}
              />
            );
          })}
        </svg>
      )}

      {nodes.map(k => {
        const [c, r]     = parseKey(k);
        const isStart    = k === startPos;
        const isTarget   = k === targetPos;
        const trap       = state.traps[k];
        const here       = agentsAt(k);
        const incoming   = pendingAt(k);
        const isValidMove   = validMoves.includes(k);
        const isSelectedPos = selectedAgent?.pos === k;
        const isDestOf    = selectedId !== null && state.pendingMoves[selectedId] === k;

        let bg     = "#0a1020";
        let border = "1px solid #1e293b";
        if (isStart)        { bg = "#0c2340";  border = "2px solid #1d4ed8"; }
        if (isTarget)       { bg = "#052e1c";  border = "2px solid #059669"; }
        if (isValidMove)    { bg = "#0f2a4a";  border = "2px solid #60a5fa"; }
        if (isDestOf)       { bg = "#2a1f04";  border = "2px solid #fbbf24"; }
        if (isSelectedPos)  {                  border = "2px solid #fff"; }

        return (
          <div key={k} onClick={() => onCellClick(k)} style={{
            position: "absolute",
            left: c * CELL_SIZE + 5, top: r * CELL_SIZE + 5,
            width: CELL_SIZE - 10, height: CELL_SIZE - 10,
            background: bg, border, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexWrap: "wrap", gap: 3, padding: 4,
            cursor: (isValidMove || isDestOf || here.length > 0) ? "pointer" : "default",
            transition: "background 0.15s, border 0.15s",
            boxShadow: isValidMove ? "0 0 12px rgba(96,165,250,0.2)"
                      : isDestOf   ? "0 0 12px rgba(251,191,36,0.25)"
                      : "none",
            zIndex: 1,
          }}>
            {isStart && here.length === 0 && incoming.length === 0 && (
              <span style={{ position: "absolute", bottom: 2, fontSize: 9, color: "#3b82f6", fontFamily: "monospace", letterSpacing: 1 }}>START</span>
            )}
            {isTarget && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 20 }}>🏁</span>
                {succeededAgents.map(a => <AgentBubble key={a.id} color={a.color} tiny />)}
              </div>
            )}
            {trap && <TrapIcon active={trap.active} timer={trap.timer} cooldown={trap.cooldown} />}
            {/* Current-position agents */}
            {here.map(a => {
              const hasPending = state.pendingMoves[a.id] !== undefined;
              return (
                <AgentBubble key={a.id} color={a.color}
                  selected={selectedId === a.id}
                  pending={hasPending}
                  tiny={here.length > 2} />
              );
            })}
            {/* Move hint dot */}
            {isValidMove && !trap && here.length === 0 && !isTarget && incoming.length === 0 && (
              <div style={{ width: 14, height: 14, borderRadius: "50%",
                background: "rgba(96,165,250,0.25)", border: "2px solid rgba(96,165,250,0.65)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function HostilePathGame() {
  const [screen,    setScreen]    = useState("menu");
  const [levelIdx,  setLevelIdx]  = useState(0);
  const [gameState, setGameState] = useState(null);
  const [showHint,  setShowHint]  = useState(false);
  const [completed, setCompleted] = useState(new Set());

  const level = LEVELS[levelIdx];

  const startLevel = useCallback((idx) => {
    setLevelIdx(idx);
    setGameState(initState(LEVELS[idx]));
    setShowHint(false);
    setScreen("game");
  }, []);

  /**
   * Clicking a cell either:
   *   1. Selects the first agent standing there (if nothing selected)
   *   2. Queues a move from the selected agent to that cell (if it's a valid neighbor)
   *   3. Switches selection to an agent on that cell (if cell isn't reachable)
   *   4. Deselects if clicking the already-selected agent's cell
   */
  const handleCellClick = useCallback((targetPos) => {
    setGameState(prev => {
      if (!prev || prev.phase !== "playing") return prev;

      const here = prev.agents.filter(a => a.alive && !a.atTarget && a.pos === targetPos);

      // Nothing selected — try to select an agent here
      if (prev.selected === null) {
        if (here.length > 0) return { ...prev, selected: here[0].id };
        return prev;
      }

      const selAgent = prev.agents[prev.selected];

      // Clicked the currently selected agent's own cell — deselect
      if (selAgent.pos === targetPos) {
        // Also cancel pending move for this agent if any
        const pm = { ...prev.pendingMoves };
        delete pm[prev.selected];
        return { ...prev, selected: null, pendingMoves: pm };
      }

      // Clicked an agent on a non-neighboring cell — switch selection
      if (here.length > 0 && !getNeighbors(selAgent.pos).includes(targetPos)) {
        return { ...prev, selected: here[0].id };
      }

      // Otherwise queue a move
      return queueMove(prev, level, prev.selected, targetPos);
    });
  }, [level]);

  const handleExecuteTurn = useCallback(() => {
    setGameState(prev => {
      if (!prev || prev.phase !== "playing") return prev;
      const next = executeTurn(prev, level);
      if (next.phase === "won") setCompleted(c => new Set([...c, level.id]));
      return next;
    });
  }, [level]);

  const handleClearMoves = useCallback(() => {
    setGameState(prev => prev ? { ...prev, pendingMoves: {}, selected: null } : prev);
  }, []);

  // ── MENU ────────────────────────────────────────────────────────────────────
  if (screen === "menu") return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 30% 20%, #0d1f3c 0%, #060d1a 60%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Courier New', monospace", color: "#e2e8f0", padding: 32,
    }}>
      <div style={{ textAlign: "center", maxWidth: 560 }}>
        <div style={{ fontSize: 11, letterSpacing: 5, color: "#3b82f6", textTransform: "uppercase", marginBottom: 14 }}>
          ICAPS 2026 · Puzzle Game
        </div>
        <h1 style={{
          fontSize: 52, fontWeight: 900, margin: "0 0 6px",
          background: "linear-gradient(130deg,#60a5fa 0%,#34d399 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: -1,
        }}>HOSTILE PATH</h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 32, lineHeight: 1.7 }}>
          Route agents simultaneously through hazardous terrain.<br />
          Sacrifice some to open the way for the rest.
        </p>

        <div style={{
          background: "rgba(15,23,42,0.9)", border: "1px solid #1e3a5f",
          borderRadius: 12, padding: 20, marginBottom: 32, textAlign: "left",
        }}>
          <div style={{ fontSize: 11, color: "#3b82f6", letterSpacing: 3, textTransform: "uppercase", marginBottom: 12 }}>How to Play</div>
          {[
            ["💀","Traps","eliminate agents that step on them while active; then enter cooldown"],
            ["⏳","Cooldown","trap sleeps for N turns after triggering — use that window to slip through"],
            ["🏁","Goal","get the required number of agents to the target"],
            ["1️⃣","Select","click an agent (or its cell) to select it — it glows white"],
            ["➡️","Queue","click a neighboring cell to queue a move (gold arrow shows it)"],
            ["▶","Execute","when ready, press Execute Turn — ALL queued moves happen at once"],
          ].map(([icon, label, desc]) => (
            <div key={label} style={{ display: "flex", gap: 10, marginBottom: 7, fontSize: 13 }}>
              <span style={{ width: 24, flexShrink: 0, textAlign: "center" }}>{icon}</span>
              <span><b style={{ color: "#e2e8f0" }}>{label}</b>{" — "}<span style={{ color: "#94a3b8" }}>{desc}</span></span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button onClick={() => startLevel(0)} style={{
            padding: "13px 32px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
            border: "none", borderRadius: 8, color: "#fff", fontSize: 14,
            fontFamily: "monospace", fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 20px rgba(37,99,235,0.45)",
          }}>▶ START</button>
          <button onClick={() => setScreen("levelselect")} style={{
            padding: "13px 28px", background: "rgba(15,23,42,0.8)",
            border: "1px solid #334155", borderRadius: 8, color: "#94a3b8",
            fontSize: 14, fontFamily: "monospace", cursor: "pointer",
          }}>LEVELS</button>
        </div>

        <p style={{ marginTop: 40, fontSize: 11, color: "#1e3a5f", lineHeight: 1.6 }}>
          Based on <i style={{ color: "#334155" }}>"Optimal Path Planning in Hostile Environments"</i><br />
          Kaczmarczyk · Schierreich · Tanujaya · Xu · ICAPS 2026
        </p>
      </div>
    </div>
  );

  // ── LEVEL SELECT ─────────────────────────────────────────────────────────────
  if (screen === "levelselect") return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 30% 20%, #0d1f3c 0%, #060d1a 60%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Courier New', monospace", color: "#e2e8f0", padding: 32,
    }}>
      <div style={{ maxWidth: 520, width: "100%" }}>
        <button onClick={() => setScreen("menu")} style={{
          background: "none", border: "none", color: "#475569",
          fontSize: 13, fontFamily: "monospace", cursor: "pointer", marginBottom: 20,
        }}>← BACK</button>
        <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 20 }}>SELECT LEVEL</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LEVELS.map((lvl, i) => {
            const done = completed.has(lvl.id);
            return (
              <div key={lvl.id} onClick={() => startLevel(i)} style={{
                padding: "14px 18px", background: "rgba(15,23,42,0.85)",
                border: `1px solid ${done ? "#065f46" : "#1e293b"}`,
                borderRadius: 10, cursor: "pointer",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: done ? "#34d399" : "#e2e8f0" }}>
                    {done ? "✅ " : ""}{lvl.id}. {lvl.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>{lvl.description}</div>
                </div>
                <div style={{ fontSize: 11, color: "#334155", textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                  <div>{lvl.agents} agents</div>
                  <div>Goal: {lvl.goal}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── GAME ─────────────────────────────────────────────────────────────────────
  if (!gameState) return null;

  const succeeded      = gameState.agents.filter(a => a.atTarget).length;
  const activeCount    = gameState.agents.filter(a => a.alive && !a.atTarget).length;
  const deadCount      = gameState.agents.filter(a => !a.alive).length;
  const queuedCount    = Object.keys(gameState.pendingMoves).length;
  const isWon          = gameState.phase === "won";
  const isLost         = gameState.phase === "lost";

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 30% 20%, #0d1f3c 0%, #060d1a 60%)",
      fontFamily: "'Courier New', monospace", color: "#e2e8f0",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: "1px solid #0f172a",
        background: "rgba(6,13,26,0.95)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => setScreen("menu")} style={{
            background: "none", border: "none", color: "#334155",
            fontSize: 13, fontFamily: "monospace", cursor: "pointer",
          }}>← MENU</button>
          <div>
            <div style={{ fontSize: 10, color: "#1d4ed8", letterSpacing: 3, textTransform: "uppercase" }}>
              Level {level.id} / {LEVELS.length}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{level.name}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          {[
            ["Turn",   gameState.turn,          "#60a5fa"],
            ["Safe",   `${succeeded}/${level.goal}`, "#34d399"],
            ["Active", activeCount,             "#fbbf24"],
            ["Lost",   deadCount,               "#ef4444"],
          ].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#334155", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Win / Lose overlay */}
      {(isWon || isLost) && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        }}>
          <div style={{
            background: "#060d1a", border: `2px solid ${isWon ? "#059669" : "#dc2626"}`,
            borderRadius: 16, padding: 40, textAlign: "center", maxWidth: 400,
            boxShadow: `0 0 60px ${isWon ? "rgba(5,150,105,0.35)" : "rgba(220,38,38,0.35)"}`,
          }}>
            <div style={{ fontSize: 60, marginBottom: 10 }}>{isWon ? "🎉" : "💀"}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: isWon ? "#34d399" : "#ef4444", marginBottom: 8 }}>
              {isWon ? "MISSION COMPLETE" : "MISSION FAILED"}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
              {isWon
                ? `${succeeded} agents reached safety in ${gameState.turn} turns.`
                : `Only ${succeeded}/${level.goal} agents made it.`}
            </div>
            {isWon && (
              <div style={{ fontSize: 11, color: "#1e3a5f", marginBottom: 24, lineHeight: 1.7, fontStyle: "italic" }}>
                This is the "run-wait-sacrifice" strategy — proven optimal for path topologies by Kaczmarczyk et al. (ICAPS 2026).
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => startLevel(levelIdx)} style={{
                padding: "10px 20px", background: "rgba(15,23,42,0.9)",
                border: "1px solid #334155", borderRadius: 8, color: "#94a3b8",
                fontSize: 13, fontFamily: "monospace", cursor: "pointer",
              }}>↺ RETRY</button>
              {isWon && levelIdx + 1 < LEVELS.length && (
                <button onClick={() => startLevel(levelIdx + 1)} style={{
                  padding: "10px 20px", background: "linear-gradient(135deg,#059669,#047857)",
                  border: "none", borderRadius: 8, color: "#fff",
                  fontSize: 13, fontFamily: "monospace", fontWeight: 700, cursor: "pointer",
                }}>NEXT →</button>
              )}
              {isWon && levelIdx + 1 >= LEVELS.length && (
                <button onClick={() => setScreen("menu")} style={{
                  padding: "10px 20px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                  border: "none", borderRadius: 8, color: "#fff",
                  fontSize: 13, fontFamily: "monospace", fontWeight: 700, cursor: "pointer",
                }}>🏆 YOU WIN!</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", padding: "16px", gap: 14,
      }}>

        {/* Description + hint */}
        <div style={{
          maxWidth: 680, width: "100%",
          background: "rgba(15,23,42,0.7)", border: "1px solid #0f2a4a",
          borderRadius: 8, padding: "10px 16px", fontSize: 13, color: "#94a3b8",
          textAlign: "center", lineHeight: 1.6,
        }}>
          {level.description}{" "}
          <span onClick={() => setShowHint(h => !h)} style={{ color: "#2563eb", cursor: "pointer" }}>
            {showHint ? "▲ hide" : "▼ hint"}
          </span>
          {showHint && (
            <div style={{ marginTop: 6, color: "#3b82f6", fontSize: 12, fontStyle: "italic" }}>
              💡 {level.hint}
            </div>
          )}
        </div>

        {/* Grid */}
        <div style={{
          background: "rgba(6,13,26,0.9)", border: "1px solid #0f172a",
          borderRadius: 16, padding: 16, overflowX: "auto",
        }}>
          <GameGrid level={level} state={gameState} onCellClick={handleCellClick} />
        </div>

        {/* Action bar */}
        <div style={{
          display: "flex", gap: 10, alignItems: "center",
          background: "rgba(6,13,26,0.9)", border: "1px solid #0f172a",
          borderRadius: 10, padding: "10px 18px",
          maxWidth: 680, width: "100%",
        }}>
          <div style={{ flex: 1, fontSize: 13, color: "#475569" }}>
            {gameState.selected !== null
              ? `Agent ${gameState.selected + 1} selected — click a neighboring cell to queue a move`
              : queuedCount > 0
                ? `${queuedCount} move${queuedCount > 1 ? "s" : ""} queued — add more or execute`
                : "Click an agent to select it, then click a neighbor to queue a move"}
          </div>
          <button
            onClick={handleClearMoves}
            disabled={queuedCount === 0 && gameState.selected === null}
            style={{
              padding: "8px 14px", background: "rgba(15,23,42,0.8)",
              border: "1px solid #334155", borderRadius: 6, color: "#64748b",
              fontSize: 12, fontFamily: "monospace", cursor: "pointer",
              opacity: queuedCount === 0 ? 0.4 : 1,
            }}
          >✕ Clear</button>
          <button
            onClick={handleExecuteTurn}
            disabled={queuedCount === 0}
            style={{
              padding: "10px 22px",
              background: queuedCount > 0
                ? "linear-gradient(135deg,#2563eb,#1d4ed8)"
                : "rgba(15,23,42,0.5)",
              border: queuedCount > 0 ? "none" : "1px solid #1e293b",
              borderRadius: 8, color: queuedCount > 0 ? "#fff" : "#334155",
              fontSize: 14, fontFamily: "monospace", fontWeight: 700, cursor: queuedCount > 0 ? "pointer" : "default",
              boxShadow: queuedCount > 0 ? "0 4px 16px rgba(37,99,235,0.4)" : "none",
              transition: "all 0.15s",
            }}
          >▶ Execute Turn</button>
        </div>

        {/* Bottom panels */}
        <div style={{
          display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center",
          maxWidth: 680, width: "100%",
        }}>
          {/* Agent roster */}
          <div style={{
            flex: 1, minWidth: 170, background: "rgba(6,13,26,0.85)",
            border: "1px solid #0f172a", borderRadius: 10, padding: 14,
          }}>
            <div style={{ fontSize: 10, color: "#334155", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Agents</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {gameState.agents.map(a => {
                const hasPending = gameState.pendingMoves[a.id] !== undefined;
                return (
                  <div key={a.id}
                    onClick={() => a.alive && !a.atTarget ? handleCellClick(a.pos) : null}
                    title={a.atTarget ? "Safe!" : !a.alive ? "Lost" : hasPending ? `Moving to (${gameState.pendingMoves[a.id]})` : "Click to select"}
                    style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: !a.alive ? "#1e293b" : a.color,
                      border: gameState.selected === a.id
                        ? "3px solid #fff"
                        : hasPending ? "3px solid #fbbf24" : "2px solid rgba(255,255,255,0.15)",
                      cursor: a.alive && !a.atTarget ? "pointer" : "default",
                      opacity: a.alive || a.atTarget ? 1 : 0.25,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, color: "#fff", fontWeight: 700,
                      boxShadow: gameState.selected === a.id
                        ? "0 0 12px #fff"
                        : hasPending ? "0 0 8px #fbbf24" : "none",
                      transition: "all 0.15s",
                    }}
                  >
                    {a.atTarget ? "✓" : !a.alive ? "✕" : hasPending ? "→" : ""}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#334155" }}>
              Gold border = move queued
            </div>
          </div>

          {/* Trap status */}
          <div style={{
            flex: 1, minWidth: 170, background: "rgba(6,13,26,0.85)",
            border: "1px solid #0f172a", borderRadius: 10, padding: 14,
          }}>
            <div style={{ fontSize: 10, color: "#334155", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Traps</div>
            {Object.entries(gameState.traps).map(([k, trap]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: trap.active ? "#ef4444" : "#1e293b",
                  boxShadow: trap.active ? "0 0 8px #ef4444" : "none",
                }} />
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  ({k}) — {trap.active
                    ? <span style={{ color: "#ef4444" }}>ACTIVE 💀</span>
                    : <span style={{ color: "#22d3ee" }}>cooldown {trap.timer}/{trap.cooldown}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Log */}
          <div style={{
            flex: 2, minWidth: 200, background: "rgba(6,13,26,0.85)",
            border: "1px solid #0f172a", borderRadius: 10, padding: 14,
          }}>
            <div style={{ fontSize: 10, color: "#334155", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Event Log</div>
            {gameState.log.map((msg, i) => (
              <div key={i} style={{
                fontSize: 12, lineHeight: 1.4, marginBottom: 4,
                color: i === 0 ? "#cbd5e1" : "#334155",
                opacity: Math.max(0.15, 1 - i * 0.2),
              }}>{msg}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
