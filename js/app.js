/**
 * Border Wars — HD world map UI
 * Outline border drawing + Colony Sim IO expansion.
 */

(function () {
  const canvas = document.getElementById("map");
  const ctx = canvas.getContext("2d", { alpha: false });
  // High-definition display canvas (sim grid is MAP_COLS × MAP_ROWS from world.js)
  canvas.width = 1920;
  canvas.height = 960;

  const sim = new Simulation();
  const CELL_W = canvas.width / MAP_COLS;
  const CELL_H = canvas.height / MAP_ROWS;

  let mode = "border"; // border | fill | erase | pan | claim
  let brush = 12;
  let activeNation = null;
  let selectedId = null;
  let drawing = false;
  let panX = 0;
  let panY = 0;
  let scale = 1;
  let lastPan = null;
  let speed = 1;
  let accum = 0;
  let dirty = true;
  let overlayDirty = true;
  let landCache = null;
  let strokeCache = null;
  let overlayCanvas = null;
  let overlayImg = null;
  let overlayData = null;
  let lastFeedLen = -1;
  let lastTs = performance.now();
  let borderPath = [];
  let lastStrokeCell = null;
  let lastHudTs = 0;
  const rgbCache = new Map(); // nationId -> {r,g,b,color}

  const el = {
    phase: document.getElementById("phaseBadge"),
    brush: document.getElementById("brushSize"),
    brushLabel: document.getElementById("brushLabel"),
    name: document.getElementById("nationName"),
    color: document.getElementById("nationColor"),
    list: document.getElementById("nationList"),
    selected: document.getElementById("selectedInfo"),
    feed: document.getElementById("feed"),
    worldTech: document.getElementById("worldTech"),
    tooltip: document.getElementById("tooltip"),
    btnStart: document.getElementById("btnStart"),
    btnPause: document.getElementById("btnPause"),
    allowNukes: document.getElementById("allowNukes"),
    speed: document.getElementById("simSpeed"),
    speedLabel: document.getElementById("speedLabel"),
  };

  function usedColors() {
    return new Set([...sim.nations.values()].map((n) => String(n.color).toLowerCase()));
  }

  function nextFreeColor() {
    return randomNationColor(usedColors());
  }

  function setActiveColor(hex, applyToNation = true) {
    el.color.value = hex;
    if (applyToNation && activeNation) {
      activeNation.color = hex;
      rgbCache.delete(activeNation.id);
      dirty = true;
      overlayDirty = true;
      refreshNationList();
    }
    highlightSwatch(hex);
  }

  function highlightSwatch(hex) {
    const want = String(hex).toLowerCase();
    for (const btn of document.querySelectorAll(".color-swatch")) {
      btn.classList.toggle("active", btn.dataset.color.toLowerCase() === want);
    }
  }

  function buildColorSwatches() {
    const host = document.getElementById("colorSwatches");
    if (!host || !NATION_COLORS) return;
    host.innerHTML = "";
    for (const hex of NATION_COLORS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "color-swatch";
      btn.title = hex;
      btn.dataset.color = hex;
      btn.style.background = hex;
      btn.addEventListener("click", () => {
        setActiveColor(hex, true);
        if (!activeNation) ensureActiveNation();
      });
      host.appendChild(btn);
    }
    highlightSwatch(el.color.value);
  }

  function ensureActiveNation() {
    if (activeNation && sim.nations.has(activeNation.id)) return activeNation;
    const name = (el.name.value || "").trim() || `Colony ${sim.nextId}`;
    const color = el.color.value || nextFreeColor();
    activeNation = sim.createNation(name, color);
    el.name.value = activeNation.name;
    el.color.value = activeNation.color;
    selectedId = activeNation.id;
    highlightSwatch(activeNation.color);
    refreshNationList();
    logFeed("tech", `${activeNation.name} founded. Draw an outline border, then claim the inside.`);
    return activeNation;
  }

  function setMode(next) {
    mode = next;
    const ids = ["btnBorder", "btnFill", "btnClaim", "btnErase", "btnPan"];
    const map = { border: "btnBorder", fill: "btnFill", claim: "btnClaim", erase: "btnErase", pan: "btnPan" };
    for (const id of ids) {
      const node = document.getElementById(id);
      if (node) node.classList.toggle("active", map[mode] === id);
    }
    canvas.style.cursor = mode === "pan" ? "grab" : "crosshair";
  }

  function canvasToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    let mx = (clientX - rect.left) * sx;
    let my = (clientY - rect.top) * sy;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    mx = (mx - cx - panX) / scale + cx;
    my = (my - cy - panY) / scale + cy;
    return { gx: Math.floor(mx / CELL_W), gy: Math.floor(my / CELL_H) };
  }

  function paintStrokeAt(gx, gy) {
    const n = ensureActiveNation();
    // Border + fill both use a chunky radius so countries can be sketched quickly
    const radius = Math.max(1, Math.round(brush / 2));
    let painted = false;

    if (lastStrokeCell) {
      // interpolate so fast mouse moves don't leave gaps in the outline
      const x0 = lastStrokeCell.x;
      const y0 = lastStrokeCell.y;
      const dx = gx - x0;
      const dy = gy - y0;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
      for (let s = 1; s <= steps; s++) {
        const x = Math.round(x0 + (dx * s) / steps);
        const y = Math.round(y0 + (dy * s) / steps);
        if (mode === "erase") {
          const r = Math.max(1, Math.round(brush / 2));
          for (let yy = -r; yy <= r; yy++) {
            for (let xx = -r; xx <= r; xx++) {
              if (xx * xx + yy * yy > r * r) continue;
              painted = sim.eraseCell(x + xx, y + yy) || painted;
            }
          }
        } else if (mode === "border") {
          painted = sim.paintBorderDot(x, y, n.id, radius) || painted;
          borderPath.push(x, y);
        } else {
          for (let yy = -radius; yy <= radius; yy++) {
            for (let xx = -radius; xx <= radius; xx++) {
              if (xx * xx + yy * yy > radius * radius) continue;
              painted = sim.paintCell(x + xx, y + yy, n.id) || painted;
            }
          }
        }
      }
    } else if (mode === "erase") {
      painted = sim.eraseCell(gx, gy) || painted;
    } else if (mode === "border") {
      painted = sim.paintBorderDot(gx, gy, n.id, radius) || painted;
      borderPath.push(gx, gy);
    } else {
      painted = sim.paintBorderDot(gx, gy, n.id, radius) || painted;
    }

    lastStrokeCell = { x: gx, y: gy };
    if (painted) {
      dirty = true;
      overlayDirty = true;
      if (sim.dirtyNations?.size) sim.flushDirtyStats();
      refreshNationList();
      updateSelected();
      el.worldTech.textContent = sim.worldTechSummary();
    }
  }

  function tryAutoFillFromPath() {
    if (borderPath.length < 16) return;
    const n = ensureActiveNation();
    const x0 = borderPath[0];
    const y0 = borderPath[1];
    const x1 = borderPath[borderPath.length - 2];
    const y1 = borderPath[borderPath.length - 1];
    const closeDist = Math.hypot(x1 - x0, y1 - y0);
    if (closeDist > 8) return; // not closed enough

    // seed = average of path, nudged inside by scanning nearby empty land
    let sx = 0;
    let sy = 0;
    const pts = borderPath.length / 2;
    for (let i = 0; i < borderPath.length; i += 2) {
      sx += borderPath[i];
      sy += borderPath[i + 1];
    }
    sx = Math.round(sx / pts);
    sy = Math.round(sy / pts);

    let seed = null;
    for (let r = 0; r <= 30 && !seed; r++) {
      for (let dy = -r; dy <= r && !seed; dy++) {
        for (let dx = -r; dx <= r && !seed; dx++) {
          const x = sx + dx;
          const y = sy + dy;
          if (!inBounds(x, y) || !isLand(x, y)) continue;
          if (sim.owner[idx(x, y)] === OWNER_EMPTY) seed = { x, y };
        }
      }
    }
    if (!seed) return;
    const res = sim.floodFillInside(seed.x, seed.y, n.id);
    if (res.leaked) {
      logFeed("battle", "Outline looks open — border leaked. Close the loop, then use Claim inside.");
    } else if (res.filled > 0) {
      logFeed("tech", `Claimed ${res.filled} tiles inside ${n.name}'s border.`);
      dirty = true;
      overlayDirty = true;
      sim.recomputeNationStats(n.id);
      refreshNationList();
      updateSelected();
      el.worldTech.textContent = sim.worldTechSummary();
    }
  }

  function claimAt(gx, gy) {
    const n = ensureActiveNation();
    const res = sim.floodFillInside(gx, gy, n.id);
    if (res.leaked) {
      logFeed("battle", "That region is not enclosed — draw a closed border first.");
    } else if (res.filled === 0) {
      logFeed("tech", "Click empty land inside a closed outline to claim it.");
    } else {
      logFeed("tech", `Filled ${res.filled} tiles for ${n.name}.`);
      dirty = true;
      overlayDirty = true;
      sim.recomputeNationStats(n.id);
      refreshNationList();
      updateSelected();
      el.worldTech.textContent = sim.worldTechSummary();
    }
  }

  function buildLandCache() {
    const off = document.createElement("canvas");
    off.width = MAP_COLS;
    off.height = MAP_ROWS;
    const octx = off.getContext("2d");
    const img = octx.createImageData(MAP_COLS, MAP_ROWS);
    const d = img.data;
    for (let y = 0; y < MAP_ROWS; y++) {
      for (let x = 0; x < MAP_COLS; x++) {
        const i = (y * MAP_COLS + x) * 4;
        if (LAND[idx(x, y)]) {
          const shade = 52 + Math.floor((y / MAP_ROWS) * 16);
          const border = COUNTRY_BORDER[idx(x, y)];
          d[i] = shade - 6 + (border ? 40 : 0);
          d[i + 1] = shade + 14 + (border ? 30 : 0);
          d[i + 2] = shade - 4 + (border ? 12 : 0);
          d[i + 3] = 255;
        } else {
          const wave = 26 + ((x * 3 + y * 5) % 9);
          d[i] = 14;
          d[i + 1] = 32 + (wave % 6);
          d[i + 2] = 48 + (wave % 10);
          d[i + 3] = 255;
        }
      }
    }
    octx.putImageData(img, 0, 0);
    landCache = off;
  }

  function buildStrokeCache() {
    const off = document.createElement("canvas");
    off.width = canvas.width;
    off.height = canvas.height;
    const octx = off.getContext("2d");
    octx.clearRect(0, 0, off.width, off.height);
    octx.strokeStyle = "rgba(210, 230, 215, 0.55)";
    octx.lineWidth = 1.1;
    octx.lineJoin = "round";
    octx.lineCap = "round";

    const strokes = WORLD_STROKES || [];
    for (const country of strokes) {
      for (const ring of country) {
        if (!ring || ring.length < 2) continue;
        octx.beginPath();
        for (let i = 0; i < ring.length; i++) {
          const [lon, lat] = ring[i];
          const x = ((lon + 180) / 360) * canvas.width;
          const y = ((90 - lat) / 180) * canvas.height;
          if (i === 0) octx.moveTo(x, y);
          else octx.lineTo(x, y);
        }
        octx.stroke();
      }
    }
    strokeCache = off;
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function nationRgb(n) {
    let c = rgbCache.get(n.id);
    if (!c || c.color !== n.color) {
      c = { ...hexToRgb(n.color), color: n.color };
      rgbCache.set(n.id, c);
    }
    return c;
  }

  // Packed-pixel colour lookup per nation id (inner fill + brighter border) so the
  // overlay rebuild is a tight typed-array loop: no Map lookups, rounding or
  // per-channel writes per cell.
  const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x0a0b0c0d]).buffer)[0] === 0x0d;
  let lutInner = new Uint32Array(64);
  let lutBorder = new Uint32Array(64);
  let overlay32 = null;
  let overlayVersion = -1;

  function packRgba(r, g, b, a) {
    r = Math.min(255, Math.round(r));
    g = Math.min(255, Math.round(g));
    b = Math.min(255, Math.round(b));
    return LITTLE_ENDIAN
      ? ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
      : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
  }

  function rebuildColorLut() {
    const need = sim.nextId + 1;
    if (lutInner.length < need) {
      lutInner = new Uint32Array(need + 32);
      lutBorder = new Uint32Array(need + 32);
    } else {
      lutInner.fill(0);
      lutBorder.fill(0);
    }
    for (const n of sim.nations.values()) {
      const rgb = nationRgb(n);
      lutInner[n.id] = packRgba(rgb.r * 0.72, rgb.g * 0.72, rgb.b * 0.72, 165);
      lutBorder[n.id] = packRgba(rgb.r * 0.98 + 40, rgb.g * 0.98 + 20, rgb.b * 0.98, 245);
    }
  }

  function rebuildOverlay() {
    if (!overlayCanvas) {
      overlayCanvas = document.createElement("canvas");
      overlayCanvas.width = MAP_COLS;
      overlayCanvas.height = MAP_ROWS;
    }
    const octx = overlayCanvas.getContext("2d", { willReadFrequently: false });
    if (!overlayImg) {
      overlayImg = octx.createImageData(MAP_COLS, MAP_ROWS);
      overlayData = overlayImg.data;
      overlay32 = new Uint32Array(overlayData.buffer);
    }
    rebuildColorLut();
    const px = overlay32;
    px.fill(0);

    if (typeof ensureMapCaches === "function") ensureMapCaches();
    const owner = sim.owner;
    const land = LAND;
    const cells = LAND_CELLS;
    const cols = MAP_COLS;
    const total = owner.length;
    const inner = lutInner;
    const edge = lutBorder;
    for (let li = 0; li < cells.length; li++) {
      const cell = cells[li];
      const id = owner[cell];
      if (!id) continue;
      const x = cell % cols;
      // Border if any 4-neighbour is water, off-map, or someone else's
      const border =
        (x + 1 < cols ? land[cell + 1] !== 1 || owner[cell + 1] !== id : false) ||
        (x > 0 ? land[cell - 1] !== 1 || owner[cell - 1] !== id : false) ||
        (cell + cols < total ? land[cell + cols] !== 1 || owner[cell + cols] !== id : false) ||
        (cell >= cols ? land[cell - cols] !== 1 || owner[cell - cols] !== id : false);
      px[cell] = border ? edge[id] : inner[id];
    }
    octx.putImageData(overlayImg, 0, 0);
    overlayDirty = false;
    overlayVersion = sim.territoryVersion;
  }

  function draw() {
    dirty = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a1014";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
    ctx.scale(scale, scale);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    if (!landCache) buildLandCache();
    if (!strokeCache) buildStrokeCache();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(landCache, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(strokeCache, 0, 0);

    if (overlayDirty || overlayVersion !== sim.territoryVersion) rebuildOverlay();
    if (overlayCanvas) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
    }

    for (const f of sim.flashes) {
      const px = (f.x + 0.5) * CELL_W;
      const py = (f.y + 0.5) * CELL_H;
      const maxLife = f.kind === "strategic" ? 36 : f.kind === "intercept" ? 14 : 26;
      const lifeF = Math.max(0.15, f.life / maxLife);
      const baseR = (f.big ? f.r * 1.8 : f.r + 1) * CELL_W;
      const rad = Math.max(CELL_W * 4, baseR * lifeF);

      if (f.kind === "intercept") {
        const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
        g.addColorStop(0, "rgba(180,220,255,0.9)");
        g.addColorStop(0.5, "rgba(100,160,255,0.35)");
        g.addColorStop(1, "rgba(80,120,200,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // Large yellow nuclear strike marker
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, "rgba(255,255,200,1)");
      g.addColorStop(0.18, "rgba(255,230,80,0.95)");
      g.addColorStop(0.45, "rgba(255,200,40,0.65)");
      g.addColorStop(0.75, "rgba(255,140,20,0.28)");
      g.addColorStop(1, "rgba(255,100,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fill();

      // Solid yellow core so the strike reads clearly on the map
      ctx.fillStyle = `rgba(255, 230, 70, ${0.55 + 0.4 * lifeF})`;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(CELL_W * 2.5, rad * 0.28), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 160, ${0.7 * lifeF})`;
      ctx.lineWidth = Math.max(2, CELL_W * 0.6);
      ctx.beginPath();
      ctx.arc(px, py, rad * 0.85, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function refreshNationList() {
    el.list.innerHTML = "";
    const nations = [...sim.nations.values()].filter((n) => n.cells > 0 || n === activeNation);
    nations.sort((a, b) => (b.techPower || 0) - (a.techPower || 0) || b.cells - a.cells);
    for (const n of nations) {
      const row = document.createElement("div");
      row.className = "nation-item" + (n.id === selectedId ? " selected" : "");
      row.innerHTML = `<span class="dot" style="background:${n.color}"></span><span>${escapeHtml(n.name)}</span><span class="meta">${n.cells} · Σ${n.techPower || 0}</span>`;
      row.addEventListener("click", () => {
        selectedId = n.id;
        activeNation = n;
        el.name.value = n.name;
        setActiveColor(n.color, false);
        refreshNationList();
        updateSelected();
      });
      el.list.appendChild(row);
    }
    el.worldTech.textContent = sim.worldTechSummary();
  }

  function updateSelected() {
    const n = selectedId ? sim.nations.get(selectedId) : null;
    if (!n) {
      el.selected.textContent = "Draw a border outline, claim inside, then inspect live tech hubs here.";
      return;
    }
    const hubs = (n.hubs || [])
      .slice(0, 8)
      .map((h) => {
        const ruin = sim.regionRuin?.get(h.name);
        const dead = ruin
          ? ` <span style="color:#c45c26">☢${ruin.kind === "strategic" ? "wiped" : "hit"}</span>`
          : "";
        const share = h.share != null ? ` <span style="opacity:.7">${h.share}%</span>` : "";
        return `${h.name}${share} +${h.contribution}${h.hub ? " ★" : ""}${h.base ? " ⚔" : ""}${dead}`;
      })
      .join("<br>") || "No subregions sampled yet";
    const regions = (n.regions || []).map((r) => `${r.name} (${r.share}%)`).join(", ") || n.name;
    const arms = (n.weapons || []).slice(0, 5).join(", ") || "none listed";
    const dual = (n.dualUse || []).slice(0, 5).join(", ") || "none listed";
    const strength = Math.round(n.power());
    const r = (v) => Math.round(v || 0);
    const focus = n.focusFoe ? sim.nations.get(n.focusFoe) : null;
    const capBits = [];
    if (n.caps?.carriers) capBits.push("carriers");
    if (n.caps?.subs) capBits.push("subs");
    if (n.caps?.secondStrike) capBits.push("2nd-strike");
    if (n.caps?.abm) capBits.push(`ABM ${n.caps.abm}`);
    if (n.caps?.penetration) capBits.push(`pen +${n.caps.penetration}`);
    const navyNote = n.coastCells <= 0 ? " · landlocked" : n.island ? " · island" : "";
    el.selected.innerHTML = `
      <div style="margin-bottom:8px;font-weight:600">${escapeHtml(n.name)}</div>
      <div class="stat"><span>Land</span><strong>${n.cells} tiles · ${n.coastCells || 0} coast</strong></div>
      <div class="stat"><span>Tech power (Σ hubs)</span><strong>${n.techPower || 0} · ${techPowerLabel(n.techPower || 0)}</strong></div>
      <div class="stat"><span>Combat strength</span><strong>${strength}</strong></div>
      <div class="stat"><span>Local avg tech</span><strong>${n.tech} · peak ${n.peakTech || n.tech}</strong></div>
      <div class="stat"><span>Industry power</span><strong>${n.industryPower || 0} (avg ${n.industry})</strong></div>
      <div class="stat"><span>Navy (fleet → at sea)</span><strong>${r(n.naval)} → ${r(n.navalEff)}${navyNote}</strong></div>
      <div class="stat"><span>Air force (→ effective)</span><strong>${r(n.airforce)} → ${r(n.airEff)}</strong></div>
      <div class="stat"><span>Sea reach</span><strong>${n.canProjectSea() ? `${n.seaRange()} tiles` : "coastal only"}</strong></div>
      <div class="stat"><span>Nuclear program</span><strong>${r(n.nuclear)} · ${n.nukesLeft || 0} warheads</strong></div>
      <div class="stat"><span>Missile defense</span><strong>${r(n.nukeDefense)}</strong></div>
      <div class="stat"><span>Capabilities</span><strong>${capBits.join(", ") || "conventional"}</strong></div>
      <div class="stat"><span>Weaponized</span><strong>${n.weaponized}</strong></div>
      <div class="stat"><span>Weaponizable</span><strong>${n.weaponizable}</strong></div>
      <div class="stat"><span>Arms posture</span><strong>${weaponLabel(n.weaponized, n.weaponizable)}</strong></div>
      <div class="stat"><span>Morale</span><strong>${Math.round(n.morale)}</strong></div>
      <div class="stat"><span>War mood</span><strong>${warResponseLabel(n.militarism, n.pacifism)}</strong></div>
      <div class="stat"><span>Main front</span><strong>${focus ? escapeHtml(focus.name) : "none"}</strong></div>
      <div style="margin-top:8px;color:var(--muted);font-size:0.78rem"><strong style="color:var(--ink)">Hub contributions</strong> (live · % of region held)<br>${hubs}</div>
      <div style="margin-top:6px;color:var(--muted);font-size:0.75rem">Subregions: ${escapeHtml(regions)}</div>
      <div style="margin-top:6px;color:var(--muted);font-size:0.75rem"><strong style="color:var(--ink)">Fielded:</strong> ${escapeHtml(arms)}</div>
      <div style="margin-top:4px;color:var(--muted);font-size:0.75rem"><strong style="color:var(--ink)">Dual-use:</strong> ${escapeHtml(dual)}</div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function logFeed(type, text) {
    sim.pushEvent(type, text);
    renderFeed();
  }

  function renderFeed() {
    lastFeedLen = sim.eventSeq;
    el.feed.innerHTML = sim.events
      .slice(0, 40)
      .map((e) => `<div class="event ${e.type}"><div class="t">t${e.t}</div>${escapeHtml(e.text)}</div>`)
      .join("");
  }

  function setPhase(label) {
    el.phase.textContent = label;
  }

  document.getElementById("btnBorder").addEventListener("click", () => setMode("border"));
  document.getElementById("btnFill").addEventListener("click", () => setMode("fill"));
  document.getElementById("btnClaim").addEventListener("click", () => setMode("claim"));
  document.getElementById("btnErase").addEventListener("click", () => setMode("erase"));
  document.getElementById("btnPan").addEventListener("click", () => setMode("pan"));

  document.getElementById("btnNewNation").addEventListener("click", () => {
    activeNation = null;
    el.name.value = "";
    setActiveColor(nextFreeColor(), false);
    ensureActiveNation();
    setMode("border");
  });

  document.getElementById("btnRandomColonies").addEventListener("click", () => {
    const created = sim.spawnRandomColonies(8);
    if (!created.length) {
      logFeed("battle", "No unclaimed countries left to colonize.");
      return;
    }
    activeNation = created[created.length - 1];
    selectedId = activeNation.id;
    el.name.value = activeNation.name;
    setActiveColor(activeNation.color, false);
    dirty = true;
    overlayDirty = true;
    refreshNationList();
    updateSelected();
    el.worldTech.textContent = sim.worldTechSummary();
    const names = created.map((n) => n.name).join(", ");
    logFeed("tech", `Random colonies founded (${created.length}): ${names}.`);
  });

  document.getElementById("btnRandomColor").addEventListener("click", () => {
    setActiveColor(nextFreeColor(), true);
  });

  el.name.addEventListener("change", () => {
    if (activeNation) {
      activeNation.name = el.name.value.trim() || activeNation.name;
      refreshNationList();
      updateSelected();
    }
  });
  el.color.addEventListener("input", () => {
    setActiveColor(el.color.value, true);
  });

  buildColorSwatches();

  el.brush.addEventListener("input", () => {
    brush = Number(el.brush.value);
    el.brushLabel.textContent = String(brush);
  });
  brush = Number(el.brush.value);

  el.speed.addEventListener("input", () => {
    speed = Number(el.speed.value);
    el.speedLabel.textContent = `${speed}×`;
  });

  el.allowNukes.addEventListener("change", () => {
    sim.allowNukes = el.allowNukes.checked;
  });

  el.btnStart.addEventListener("click", () => {
    const living = [...sim.nations.values()].filter((n) => n.cells > 0);
    if (living.length < 1) {
      logFeed("battle", "Draw at least one colony before starting.");
      return;
    }
    // Stats + initial warhead loadout come from territory (spent nukes never refill)
    sim.recomputeAllStats();
    for (const n of living) {
      n.morale = 70;
      n.warWeariness = 0;
      n.alive = true;
    }
    sim.running = true;
    el.btnStart.disabled = true;
    el.btnPause.disabled = false;
    el.btnPause.textContent = "Pause";
    setPhase("WAR");
    logFeed("battle", "Colonies begin expanding — borders will clash.");
    refreshNationList();
    updateSelected();
  });

  el.btnPause.addEventListener("click", () => {
    if (!sim.running && el.btnStart.disabled) {
      sim.running = true;
      el.btnPause.textContent = "Pause";
      setPhase("WAR");
      return;
    }
    sim.running = false;
    el.btnPause.textContent = "Resume";
    setPhase("PAUSED");
  });

  document.getElementById("btnReset").addEventListener("click", () => {
    sim.resetTerritory();
    activeNation = null;
    selectedId = null;
    borderPath = [];
    el.btnStart.disabled = false;
    el.btnPause.disabled = true;
    el.btnPause.textContent = "Pause";
    setPhase("DRAW");
    el.feed.innerHTML = "";
    lastFeedLen = -1;
    refreshNationList();
    updateSelected();
    dirty = true;
    overlayDirty = true;
    rgbCache.clear();
    logFeed("tech", "Map cleared. Draw outline borders on the HD world map.");
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (mode === "pan") {
      lastPan = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = "grabbing";
      return;
    }
    const { gx, gy } = canvasToCell(e.clientX, e.clientY);
    if (sim.running) {
      const n = sim.nationAt(gx, gy);
      if (n) {
        selectedId = n.id;
        activeNation = n;
        refreshNationList();
        updateSelected();
      }
      return;
    }
    if (mode === "claim") {
      claimAt(gx, gy);
      return;
    }
    drawing = true;
    borderPath = [];
    lastStrokeCell = null;
    paintStrokeAt(gx, gy);
  });

  window.addEventListener("mouseup", () => {
    if (drawing && mode === "border") tryAutoFillFromPath();
    drawing = false;
    lastStrokeCell = null;
    lastPan = null;
    if (mode === "pan") canvas.style.cursor = "grab";
  });

  canvas.addEventListener("mousemove", (e) => {
    const { gx, gy } = canvasToCell(e.clientX, e.clientY);
    const rect = canvas.getBoundingClientRect();
    el.tooltip.style.left = `${e.clientX - rect.left + 14}px`;
    el.tooltip.style.top = `${e.clientY - rect.top + 14}px`;

    if (inBounds(gx, gy)) {
      const n = sim.nationAt(gx, gy);
      const prof = profileAtCell(gx, gy, MAP_COLS, MAP_ROWS);
      const land = isLand(gx, gy);
      const meta = countryMetaAt(gx, gy);
      el.tooltip.classList.remove("hidden");
      const live = n && typeof sim.profileOwned === "function" ? sim.profileOwned(gx, gy) : prof;
      const ruin = sim.regionRuin?.get(prof.name);
      const ruinBit = ruin
        ? `<br><span style="color:#e8a060">☢ ${ruin.kind} ruin — tech ×${ruin.techMul.toFixed(2)} · mil ×${ruin.milMul.toFixed(2)}</span>`
        : "";
      el.tooltip.innerHTML = land
        ? `<strong>${n ? escapeHtml(n.name) : "Unclaimed"}</strong><br>${escapeHtml(prof.name)}${live.hub ? " ★hub" : ""}${live.base ? " ⚔base" : ""}${meta?.iso ? ` · ${meta.iso}` : ""}${ruinBit}<br>Tech ${live.tech} · Navy ${live.naval} · Air ${live.airforce ?? "—"}<br>Arms ${live.weaponized ?? "—"} · Dual-use ${live.weaponizable ?? "—"}${live.nuclear >= 50 ? " · nukes" : ""}${live.nukeDef ? ` · ABM ${live.nukeDef}` : ""}${n ? `<br>Colony Σ tech ${n.techPower || 0} · warheads ${n.nukesLeft || 0} · def ${Math.round(n.nukeDefense || 0)}` : ""}`
        : "Ocean";
    } else {
      el.tooltip.classList.add("hidden");
    }

    if (lastPan && mode === "pan") {
      panX += e.clientX - lastPan.x;
      panY += e.clientY - lastPan.y;
      lastPan = { x: e.clientX, y: e.clientY };
      dirty = true;
      return;
    }
    if (drawing && !sim.running && mode !== "claim") paintStrokeAt(gx, gy);
  });

  canvas.addEventListener("mouseleave", () => {
    el.tooltip.classList.add("hidden");
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      scale = Math.max(1, Math.min(6, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
      dirty = true;
    },
    { passive: false }
  );

  logFeed(
    "tech",
    `HD map ready — ${WORLD_META.length} countries. Draw an outline border (not a fill), close the loop to auto-claim, or use Claim inside.`
  );

  function frame(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    if (sim.running) {
      accum += dt * speed * 6;
      let steps = 0;
      while (accum >= 1 && steps < 10) {
        sim.step();
        accum -= 1;
        steps++;
      }
      if (steps) {
        dirty = true; // overlay itself only rebuilds when territoryVersion moved
        if (sim.eventSeq !== lastFeedLen) renderFeed();
        // Throttle DOM HUD — sim accuracy unchanged; UI refreshes ~8×/sec
        if (ts - lastHudTs > 120) {
          lastHudTs = ts;
          refreshNationList();
          updateSelected();
        }
        const alive = [...sim.nations.values()].filter((n) => n.alive && n.cells > 0);
        if (alive.length === 1 && sim.tick > 30) {
          sim.running = false;
          el.btnPause.disabled = true;
          setPhase("VICTORY");
          refreshNationList();
          updateSelected();
          logFeed("fall", `${alive[0].name} dominates the map.`);
        }
      }
    }

    if (dirty || sim.flashes.length) draw();
    requestAnimationFrame(frame);
  }

  setMode("border");
  if (typeof ensureMapCaches === "function") ensureMapCaches();
  // Build the cell→region index off the critical path so the first colony
  // (and the first war ticks) don't hitch on geo lookups
  setTimeout(() => {
    if (typeof ensureRegionIndex === "function") ensureRegionIndex();
  }, 0);
  draw();
  requestAnimationFrame(frame);
})();
