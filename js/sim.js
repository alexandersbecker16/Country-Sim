/**
 * Colony Sim IO–style conquest:
 * colonies auto-expand into empty land, clash on shared borders,
 * tech / naval / air / nukes / morale shape the push.
 *
 * Performance model:
 *  - Every land cell maps to one region (city / subregion / country) via
 *    CELL_REGION. Each nation keeps a live Int32Array of cells-per-region, so
 *    stat refresh is O(regions ≈ 300) instead of O(cells ≈ 100k) per tick.
 *  - Capture meters live in flat Float32Arrays (no Map churn).
 *  - Combat power is cached once per tick per nation.
 */

const OWNER_EMPTY = 0;

class Nation {
  constructor(id, name, color) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.alive = true;
    this.cells = 0;
    this.coastCells = 0;
    this.regionCounts = null; // Int32Array(REGIONS.length) — owned cells per region
    this.tech = 40;
    this.industry = 40;
    this.techPower = 0;
    this.industryPower = 0;
    this.peakTech = 40;
    this.naval = 30;
    this.airforce = 25;
    this.navalEff = 0; // coast / tech / industry adjusted — used in combat
    this.airEff = 0;
    this.nuclear = 0;
    this.nuclearBonus = 0; // proliferation gains on top of territory-derived nuclear
    this.weaponized = 20;
    this.weaponizable = 25;
    this.weapons = [];
    this.dualUse = [];
    this.caps = armsCapabilities([]);
    this.militarism = 40;
    this.pacifism = 40;
    this.island = false;
    this.regions = [];
    this.hubs = [];
    this.morale = 70;
    this.warWeariness = 0;
    this.nukeDefense = 0;
    this.nukesLeft = 0; // warhead stockpile — spent warheads never refill
    this.arsenalBase = 0; // arsenal already credited (captured silos add, spent never return)
    this.arsenalNow = 0; // current territory arsenal (caps slow warhead production)
    this.warheadsInit = false;
    this.airforceCap = null; // lasting ceilings after city strikes
    this.weaponizedCap = null;
    this.navalCap = null;
    this.takenThisTick = 0;
    this.lostThisTick = 0;
    this.lostPrev = 0;
    this.takenPrev = 0;
    this.lostTo = new Map(); // foeId -> cells lost to them this tick
    this.lostToPrev = new Map(); // last tick's losses by foe (drives focus / revenge)
    this.focusFoe = 0; // strategic target this tick
    this.seaTargets = []; // persistent landing zones {i, foe, d, from, score}
    this.frontierLen = 0; // enemy-adjacent border cells (last frontier scan)
    this.frontierFoes = 0; // distinct neighbours on that border
    this.netTrend = 0; // smoothed taken - lost per tick (winning > 0)
    this.regionCount = 0; // distinct regions currently held
    this.coreRegion = null; // top hub — never ceded
    this.cedeCooldownUntil = 0; // tick before which no further concessions
    this.truceWith = new Map(); // foeId -> tick until which we won't cede land to them
    this.airAttrition = 0;
    this.navalAttrition = 0;
    this._pow = 1; // cached once per tick
    this.statsDirty = false;
    this.identitySet = false; // first territory sync uses founding blend
  }

  power() {
    // Multi-hub empires fight harder: techPower sums distinct subregions
    const techF = 0.4 + this.techPower / 220 + this.peakTech / 400;
    const indF = 0.45 + this.industryPower / 240 + this.industry / 280;
    const airF = 0.7 + this.airEff / 220;
    const armsF = 0.75 + this.weaponized / 250;
    const moraleF = 0.55 + this.morale / 160;
    const milF = 0.7 + this.militarism / 200;
    const sizeF = Math.sqrt(Math.max(1, this.cells));
    return sizeF * techF * indF * airF * armsF * moraleF * milF;
  }

  expansionPressure() {
    const base =
      2 +
      this.industryPower / 80 +
      this.techPower / 100 +
      this.militarism / 50;
    const moraleMul = 0.55 + this.morale / 140;
    const wear = 1 - Math.min(0.55, this.warWeariness / 180);
    return Math.max(0.4, base * moraleMul * wear);
  }

  /** Fleet strength a colony can actually put to sea: needs coastline, tech, yards. */
  computeEffective() {
    const coast = this.coastCells;
    const coastF = coast <= 0 ? 0.12 : Math.min(1, 0.3 + 0.7 * Math.sqrt(Math.min(1, coast / 60)));
    const navTechF = 0.7 + this.tech / 300;
    const carrierF = this.caps.carriers ? 1.08 : 1;
    this.navalEff = Math.max(0, Math.min(100, this.naval * coastF * navTechF * carrierF));
    const airTechF = 0.65 + this.tech / 280;
    const airIndF = 0.8 + this.industry / 500;
    this.airEff = Math.max(0, Math.min(100, this.airforce * airTechF * airIndF));
  }

  canProjectSea() {
    // Sea invasions need a real fleet or heavy airlift — islands need less
    if (!this.island) return this.navalEff >= 26 || this.airEff >= 55;
    return this.navalEff >= 20 || this.airEff >= 58;
  }

  seaRange() {
    let r = 3 + Math.floor(this.navalEff / 14) + Math.floor(this.airEff / 50);
    if (this.caps.carriers) r += 2;
    if (this.caps.subs) r += 1;
    return Math.min(13, r);
  }

  syncFromBlend(blend, { founding = false } = {}) {
    // Live territory aggregate always refreshes additive power + hub list
    this.tech = blend.tech;
    this.industry = blend.industry;
    this.techPower = blend.techPower ?? 0;
    this.industryPower = blend.industryPower ?? 0;
    this.peakTech = blend.peakTech ?? blend.tech ?? 40;
    this.hubs = blend.hubs || [];
    this.regions = blend.regions || [];
    this.regionCount = blend.regionCount ?? this.hubs.length;
    this.coreRegion = blend.coreRegion ?? this.hubs[0]?.name ?? null;

    const nuclearTarget = Math.min(100, (blend.nuclear ?? 0) + this.nuclearBonus);
    if (founding) {
      this.naval = blend.naval;
      this.airforce = blend.airforce ?? 25;
      this.nuclear = nuclearTarget;
      this.nukeDefense = blend.nukeDefense ?? 0;
      this.weaponized = blend.weaponized ?? 20;
      this.weaponizable = blend.weaponizable ?? 25;
      this.militarism = blend.militarism;
      this.pacifism = blend.pacifism;
      this.island = blend.island;
      this.weapons = blend.weapons || [];
      this.dualUse = blend.dualUse || [];
    } else {
      // Force structure drifts toward what the territory can sustain:
      // gains come fast (captured yards / bases), losses bleed slowly.
      this.naval = drift(this.naval, blend.naval, 0.05, 0.03);
      this.airforce = drift(this.airforce, blend.airforce ?? 0, 0.05, 0.03);
      this.nuclear = drift(this.nuclear, nuclearTarget, 0.1, 0.02);
      this.nukeDefense = drift(this.nukeDefense, blend.nukeDefense ?? 0, 0.1, 0.05);
      this.weaponized = Math.round(this.weaponized * 0.85 + (blend.weaponized ?? this.weaponized) * 0.15);
      this.weaponizable = Math.max(this.weaponizable, blend.weaponizable ?? 0);
      this.militarism = Math.round(this.militarism * 0.85 + blend.militarism * 0.15);
      this.pacifism = Math.round(this.pacifism * 0.85 + blend.pacifism * 0.15);
      this.island = blend.island;
      if (blend.weapons?.length) {
        this.weapons = [...new Set([...blend.weapons, ...(this.weapons || [])])].slice(0, 10);
      }
      if (blend.dualUse?.length) {
        this.dualUse = [...new Set([...blend.dualUse, ...(this.dualUse || [])])].slice(0, 10);
      }
      // City-strike caps: glassed hubs/bases keep military from bouncing back
      if (this.navalCap != null) this.naval = Math.min(this.naval, this.navalCap);
      if (this.airforceCap != null) this.airforce = Math.min(this.airforce, this.airforceCap);
      if (this.weaponizedCap != null) this.weaponized = Math.min(this.weaponized, this.weaponizedCap);
    }
    this.caps = armsCapabilities(this.weapons);
    this.computeEffective();

    // Warhead stockpile: territory arsenal credited once; captured silos add new
    // warheads, but fired warheads stay gone.
    const arsenal = blend.arsenal ?? 0;
    this.arsenalNow = arsenal;
    if (founding || !this.warheadsInit) {
      this.nukesLeft = Math.max(this.nukesLeft, stockpileFor(arsenal));
      this.arsenalBase = arsenal;
      this.warheadsInit = true;
    } else {
      // Captured silo fields add warheads once (high-water mark — no re-credit
      // for land lost and retaken); spent warheads never come back this way.
      const sNow = stockpileFor(arsenal);
      const sBase = stockpileFor(this.arsenalBase);
      if (sNow > sBase) {
        this.nukesLeft += Math.max(1, Math.floor((sNow - sBase) * 0.5));
        this.arsenalBase = arsenal;
      }
    }
    this.statsDirty = false;
  }
}

/** Warheads a territory's nuclear complex supports. */
function stockpileFor(a) {
  return a > 0 ? Math.min(30, Math.round(a * 4) + 1) : 0;
}

function drift(cur, target, up, down) {
  if (!Number.isFinite(target)) return cur;
  const d = target - cur;
  return cur + d * (d > 0 ? up : down);
}

class Simulation {
  constructor() {
    if (typeof ensureMapCaches === "function") ensureMapCaches();
    this.owner = new Int16Array(MAP_COLS * MAP_ROWS);
    this.nations = new Map(); // id -> Nation
    this.nextId = 1;
    this.tick = 0;
    this.running = false;
    this.allowNukes = true;
    this.events = [];
    this.flashes = []; // {x,y,life,r,color}
    this.territoryVersion = 0; // bumps whenever any cell changes owner (render gating)
    this.lastCedeTick = -999; // global throttle for surrender events
    this.eventSeq = 0; // total events ever pushed (feed refresh key)
    // Soft capture meters: land clashes + sea assaults (flat arrays, no Map churn)
    this.landMeter = new Float32Array(MAP_COLS * MAP_ROWS);
    this.seaMeter = new Float32Array(MAP_COLS * MAP_ROWS);
    this.dirtyNations = new Set(); // live stat refresh when territory changes
    /** @type {Map<string, {techMul:number, milMul:number, hubDead:boolean, baseDead:boolean, kind:string}>} */
    this.regionRuin = new Map(); // city/subregion benefits destroyed by nukes
    // Reused BFS stamps — avoids allocating Uint8Array(MAP) every naval probe
    this._seenStamp = new Uint32Array(MAP_COLS * MAP_ROWS);
    this._seenGen = 1;
    this._qx = new Int32Array(8192);
    this._qy = new Int32Array(8192);
    this._qd = new Int32Array(8192);
    this._powById = [];
    this._regionsReady = false;
    // Static per-coast-cell hint: water distance to the nearest *other* landmass
    // (0 = unknown, 255 = none in reach). Filled lazily, so open-ocean coasts
    // stop wasting invasion probes after their first look.
    this._seaHint = new Uint8Array(MAP_COLS * MAP_ROWS);
  }

  seaHint(start) {
    const h = this._seaHint[start];
    if (h) return h;
    const qx = this._qx;
    const qy = this._qy;
    const qd = this._qd;
    const stamp = this._seenStamp;
    const gen = this._nextSeenGen();
    const cols = MAP_COLS;
    const rows = MAP_ROWS;
    const home = LANDMASS[start];
    const maxD = 16;
    let head = 0;
    let tail = 0;
    qx[tail] = start % cols;
    qy[tail] = (start / cols) | 0;
    qd[tail] = 0;
    tail++;
    stamp[start] = gen;
    let found = 255;
    outer: while (head < tail) {
      const x = qx[head];
      const y = qy[head];
      const d = qd[head];
      head++;
      for (let k = 0; k < 4; k++) {
        const nx = x + N4_DX[k];
        const ny = y + N4_DY[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (stamp[ni] === gen) continue;
        stamp[ni] = gen;
        if (LAND[ni] === 1) {
          if (d > 0 && LANDMASS[ni] !== home) {
            found = d;
            break outer;
          }
          continue;
        }
        const nd = d + 1;
        if (nd > maxD || tail >= qx.length) continue;
        qx[tail] = nx;
        qy[tail] = ny;
        qd[tail] = nd;
        tail++;
      }
    }
    this._seaHint[start] = found;
    return found;
  }

  ensureRegions() {
    if (this._regionsReady) return;
    ensureRegionIndex();
    this._regionsReady = true;
  }

  _nextSeenGen() {
    let g = ++this._seenGen;
    if (g >= 0xfffffffe) {
      this._seenStamp.fill(0);
      this._seenGen = 1;
      g = 1;
    }
    return g;
  }

  resetTerritory() {
    this.owner.fill(OWNER_EMPTY);
    this.nations.clear();
    this.nextId = 1;
    this.tick = 0;
    this.lastCedeTick = -999;
    this.running = false;
    this.events = [];
    this.flashes = [];
    this.landMeter.fill(0);
    this.seaMeter.fill(0);
    this.dirtyNations.clear();
    this.regionRuin.clear();
    this.territoryVersion++;
  }

  /** Profile for a cell with lasting nuke devastation applied. */
  profileOwned(x, y) {
    const prof = profileAtCell(x, y, MAP_COLS, MAP_ROWS);
    return typeof applyRegionRuin === "function"
      ? applyRegionRuin(prof, this.regionRuin)
      : prof;
  }

  /**
   * Destroy tech / military benefits of a city (and scale by blast severity).
   * Tactical: mainly bases / military. Strategic: wipes hubs + industry.
   */
  devastateRegion(prof, kind, severity = 1) {
    if (!prof?.name) return;
    const sev = Math.max(0.15, Math.min(1, severity));
    const prev = this.regionRuin.get(prof.name) || {
      techMul: 1,
      milMul: 1,
      hubDead: false,
      baseDead: false,
      kind: kind,
    };
    const isStrategic = kind === "strategic";
    if (isStrategic) {
      // Strategic: city tech + industry almost gone; military infrastructure erased
      const techHit = 0.06 + (1 - sev) * 0.22;
      const milHit = 0.04 + (1 - sev) * 0.18;
      prev.techMul = Math.min(prev.techMul, techHit);
      prev.milMul = Math.min(prev.milMul, milHit);
      if (sev >= 0.45) {
        prev.hubDead = true;
        prev.baseDead = true;
      }
    } else {
      // Tactical: crush bases / fielded arms; tech hubs only partially damaged
      const milHit = prof.base
        ? 0.1 + (1 - sev) * 0.2
        : 0.35 + (1 - sev) * 0.35;
      const techHit = prof.hub
        ? 0.4 + (1 - sev) * 0.35
        : 0.65 + (1 - sev) * 0.25;
      prev.milMul = Math.min(prev.milMul, milHit);
      prev.techMul = Math.min(prev.techMul, techHit);
      if (prof.base && sev >= 0.35) prev.baseDead = true;
      if (prof.hub && sev >= 0.85) prev.hubDead = true;
    }
    prev.kind = isStrategic || prev.kind === "strategic" ? "strategic" : "tactical";
    this.regionRuin.set(prof.name, prev);
  }

  createNation(name, color) {
    const id = this.nextId++;
    const n = new Nation(id, name || `Colony ${id}`, color || randomNationColor());
    this.ensureRegions();
    n.regionCounts = new Int32Array(REGIONS.length);
    this.nations.set(id, n);
    return n;
  }

  /**
   * Spawn colonies by claiming random unclaimed countries on the world map.
   * @param {number} count how many new colonies to place
   * @returns {Nation[]}
   */
  spawnRandomColonies(count = 8) {
    const want = Math.max(1, Math.min(48, count | 0));
    const freeCountries = new Set();
    const owner = this.owner;
    const land = LAND;
    const cIdx = COUNTRY_IDX;
    for (let i = 0; i < owner.length; i++) {
      if (land[i] !== 1 || owner[i] !== OWNER_EMPTY) continue;
      const c = cIdx[i];
      if (c >= 0) freeCountries.add(c);
    }
    const pool = [...freeCountries];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    const pick = pool.slice(0, Math.min(want, pool.length));
    if (!pick.length) return [];

    const used = new Set([...this.nations.values()].map((n) => String(n.color).toLowerCase()));
    const created = [];
    const wantSet = new Map();
    for (const country of pick) {
      const meta = WORLD_META[country];
      const color = randomNationColor(used);
      used.add(String(color).toLowerCase());
      const name = meta?.name || `Colony ${this.nextId}`;
      const n = this.createNation(name, color);
      wantSet.set(country, n);
    }
    // Single pass over the map paints every picked country at once
    const cells = LAND_CELLS;
    for (let li = 0; li < cells.length; li++) {
      const i = cells[li];
      if (owner[i] !== OWNER_EMPTY) continue;
      const n = wantSet.get(cIdx[i]);
      if (n) this._setOwner(i, n.id);
    }
    for (const n of wantSet.values()) {
      if (!n.cells) {
        this.nations.delete(n.id);
        continue;
      }
      this.refreshNation(n);
      created.push(n);
    }
    return created;
  }

  removeNation(id) {
    const n = this.nations.get(id);
    if (!n) return;
    for (let i = 0; i < this.owner.length; i++) {
      if (this.owner[i] === id) this._setOwner(i, OWNER_EMPTY);
    }
    this.nations.delete(id);
  }

  markDirty(nationId) {
    if (nationId) this.dirtyNations.add(nationId);
  }

  /**
   * The ONE place ownership changes. Keeps per-nation cell / coast / region
   * counts exact so stats never need a full-map rescan.
   */
  _setOwner(i, nationId) {
    const prev = this.owner[i];
    if (prev === nationId) return false;
    if (!this._regionsReady) this.ensureRegions();
    const region = CELL_REGION[i];
    const coast = COAST_FLAG[i];
    if (prev) {
      const old = this.nations.get(prev);
      if (old) {
        old.cells = Math.max(0, old.cells - 1);
        if (coast) old.coastCells = Math.max(0, old.coastCells - 1);
        if (region >= 0 && old.regionCounts[region] > 0) old.regionCounts[region]--;
      }
      this.markDirty(prev);
    }
    this.owner[i] = nationId;
    if (nationId) {
      const n = this.nations.get(nationId);
      if (n) {
        n.cells++;
        if (coast) n.coastCells++;
        if (region >= 0) n.regionCounts[region]++;
      }
      this.markDirty(nationId);
    }
    this.territoryVersion++;
    return true;
  }

  paintCell(x, y, nationId) {
    if (!isLand(x, y)) return false;
    return this._setOwner(idx(x, y), nationId);
  }

  eraseCell(x, y) {
    if (!inBounds(x, y)) return false;
    const i = idx(x, y);
    if (!this.owner[i]) return false;
    return this._setOwner(i, OWNER_EMPTY);
  }

  /**
   * Paint a thin border stroke (outline only). Returns true if any cell changed.
   */
  paintBorderDot(x, y, nationId, radius = 1) {
    let painted = false;
    const r = Math.max(0, radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        if (this.paintCell(x + dx, y + dy, nationId)) painted = true;
      }
    }
    return painted;
  }

  /**
   * Flood-fill unclaimed land from a seed. Stops at water & any claimed cells
   * (so a drawn outline acts as a wall). Aborts if the region looks unclosed.
   * @returns {{filled:number, leaked:boolean}}
   */
  floodFillInside(seedX, seedY, nationId, maxCells = 18000) {
    if (!inBounds(seedX, seedY) || !isLand(seedX, seedY)) {
      return { filled: 0, leaked: false };
    }
    if (this.owner[idx(seedX, seedY)] !== OWNER_EMPTY) {
      return { filled: 0, leaked: false };
    }

    const stack = [seedX, seedY];
    const stamp = this._seenStamp;
    const gen = this._nextSeenGen();
    const collected = [];
    stamp[idx(seedX, seedY)] = gen;

    while (stack.length) {
      const y = stack.pop();
      const x = stack.pop();
      const i = idx(x, y);
      if (this.owner[i] !== OWNER_EMPTY) continue;
      if (!isLand(x, y)) continue;
      collected.push(i);
      if (collected.length > maxCells) {
        return { filled: 0, leaked: true };
      }
      for (let k = 0; k < 4; k++) {
        const nx = x + N4_DX[k];
        const ny = y + N4_DY[k];
        if (!inBounds(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (stamp[ni] === gen) continue;
        if (!isLand(nx, ny)) continue;
        if (this.owner[ni] !== OWNER_EMPTY) continue;
        stamp[ni] = gen;
        stack.push(nx, ny);
      }
    }

    for (let k = 0; k < collected.length; k++) this._setOwner(collected[k], nationId);
    return { filled: collected.length, leaked: false };
  }

  /** Rebuild every nation's cell / coast / region counters from the owner grid. */
  recountCells() {
    this.ensureRegions();
    for (const n of this.nations.values()) {
      n.cells = 0;
      n.coastCells = 0;
      if (!n.regionCounts || n.regionCounts.length !== REGIONS.length) {
        n.regionCounts = new Int32Array(REGIONS.length);
      } else n.regionCounts.fill(0);
    }
    const owner = this.owner;
    const land = LAND_CELLS;
    const cellRegion = CELL_REGION;
    const coast = COAST_FLAG;
    for (let li = 0; li < land.length; li++) {
      const i = land[li];
      const id = owner[i];
      if (!id) continue;
      const n = this.nations.get(id);
      if (!n) continue;
      n.cells++;
      if (coast[i]) n.coastCells++;
      const r = cellRegion[i];
      if (r >= 0) n.regionCounts[r]++;
    }
  }

  /** Blend live region counts into nation stats. */
  refreshNation(n) {
    if (n.cells > 0) {
      n.syncFromBlend(blendRegionCounts(n.regionCounts, this.regionRuin), {
        founding: !n.identitySet,
      });
      n.identitySet = true;
    } else {
      n.techPower = 0;
      n.industryPower = 0;
      n.hubs = [];
      n.regions = [];
      n.navalEff = 0;
      n.airEff = 0;
      n.statsDirty = false;
    }
    this.dirtyNations.delete(n.id);
  }

  recomputeNationStats(nationId) {
    const n = this.nations.get(nationId);
    if (!n) return;
    // Counters are maintained incrementally; a per-nation rescan keeps them honest
    this.ensureRegions();
    n.cells = 0;
    n.coastCells = 0;
    n.regionCounts.fill(0);
    const owner = this.owner;
    const land = LAND_CELLS;
    for (let li = 0; li < land.length; li++) {
      const i = land[li];
      if (owner[i] !== nationId) continue;
      n.cells++;
      if (COAST_FLAG[i]) n.coastCells++;
      const r = CELL_REGION[i];
      if (r >= 0) n.regionCounts[r]++;
    }
    this.refreshNation(n);
  }

  recomputeAllStats() {
    this.recountCells();
    for (const n of this.nations.values()) this.refreshNation(n);
    this.dirtyNations.clear();
  }

  /** Live refresh for nations that gained/lost land this tick — O(regions) each. */
  flushDirtyStats() {
    if (!this.dirtyNations.size) return;
    for (const id of this.dirtyNations) {
      const n = this.nations.get(id);
      if (n) this.refreshNation(n);
    }
    this.dirtyNations.clear();
  }

  pushEvent(type, text) {
    this.events.unshift({ type, text, t: this.tick });
    if (this.events.length > 80) this.events.length = 80;
    this.eventSeq++; // monotonic — the feed can't key off length once the ring is full
  }

  worldTechSummary() {
    const alive = [...this.nations.values()].filter((n) => n.alive && n.cells > 0);
    if (!alive.length) return "Draw colonies on the map — tech hubs stack when you hold several.";
    let tech = 0, power = 0, naval = 0, air = 0, armed = 0, nukes = 0, warheads = 0;
    let top = null;
    for (const n of alive) {
      tech += n.tech;
      power += n.techPower;
      naval += n.navalEff;
      air += n.airEff;
      armed += n.weaponized;
      if (!top || n.techPower > top.techPower) top = n;
      if (n.nuclear >= 50 && n.nukesLeft > 0) {
        nukes++;
        warheads += n.nukesLeft;
      }
    }
    const m = alive.length;
    tech = Math.round(tech / m);
    naval = Math.round(naval / m);
    air = Math.round(air / m);
    armed = Math.round(armed / m);
    const topBit = top
      ? ` Strongest tech base: ${top.name} (${top.techPower}).`
      : "";
    return `Avg local tech ${tech}. Σ tech-power ${Math.round(power)}. Navy ${naval} · Air ${air} · Arms ${armed}. Nuclear states: ${nukes} (${warheads} warheads).${topBit}`;
  }

  /**
   * Sea-gap check: can attacker reach (tx,ty) from some owned cell within naval range,
   * crossing water if needed.
   */
  hasNavalApproach(attackerId, tx, ty, maxWater = 6) {
    const attacker = this.nations.get(attackerId);
    if (!attacker) return false;
    for (let k = 0; k < 4; k++) {
      const nx = tx + N4_DX[k];
      const ny = ty + N4_DY[k];
      if (inBounds(nx, ny) && this.owner[idx(nx, ny)] === attackerId && isLand(nx, ny)) {
        return true;
      }
    }
    if (!attacker.canProjectSea()) return false;

    const range = Math.min(maxWater, 3 + Math.floor(attacker.navalEff / 18));
    const qx = [];
    const qy = [];
    const qd = [];
    const stamp = this._seenStamp;
    const gen = this._nextSeenGen();
    const x0 = Math.max(0, tx - range - 1);
    const x1 = Math.min(MAP_COLS - 1, tx + range + 1);
    const y0 = Math.max(0, ty - range - 1);
    const y1 = Math.min(MAP_ROWS - 1, ty + range + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (this.owner[idx(x, y)] === attackerId && isLand(x, y)) {
          qx.push(x); qy.push(y); qd.push(0);
          stamp[idx(x, y)] = gen;
        }
      }
    }
    let head = 0;
    while (head < qx.length) {
      const x = qx[head];
      const y = qy[head];
      const d = qd[head];
      head++;
      for (let k = 0; k < 4; k++) {
        const nx = x + N4_DX[k];
        const ny = y + N4_DY[k];
        if (!inBounds(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (stamp[ni] === gen) continue;
        if (nx === tx && ny === ty) return true;
        const land = isLand(nx, ny);
        const own = this.owner[ni] === attackerId;
        if (land && !own) continue;
        const nd = land && own ? d : d + 1;
        if (nd > range) continue;
        stamp[ni] = gen;
        qx.push(nx); qy.push(ny); qd.push(nd);
      }
    }
    return false;
  }

  claimCell(x, y, nationId, reason) {
    this.claimIndex(idx(x, y), nationId, reason);
  }

  claimIndex(i, nationId, reason) {
    const prev = this.owner[i];
    if (prev === nationId) return;
    const attacker = this.nations.get(nationId);
    if (!attacker) return;

    if (prev) {
      const defender = this.nations.get(prev);
      if (defender) {
        defender.lostThisTick++;
        defender.lostTo.set(nationId, (defender.lostTo.get(nationId) || 0) + 1);
      }
      this._setOwner(i, nationId);
      if (defender && defender.cells === 0 && defender.alive) {
        defender.alive = false;
        this.pushEvent("fall", `${defender.name} has been wiped from the map by ${attacker.name}.`);
      }
    } else {
      this._setOwner(i, nationId);
    }
    attacker.takenThisTick++;
    this.landMeter[i] = 0;
    this.seaMeter[i] = 0;
    if (reason === "expand" && Math.random() < 0.02) {
      this.pushEvent("tech", `${attacker.name} expands into open land.`);
    } else if (reason === "clash" && Math.random() < 0.045) {
      this.pushEvent("battle", `${attacker.name} pushes the border forward.`);
    }
  }

  step() {
    if (!this.running) return;
    this.tick++;
    this.ensureRegions();
    const powById = this._powById;
    powById.length = this.nextId + 1;
    for (const n of this.nations.values()) {
      n.takenPrev = n.takenThisTick;
      n.lostPrev = n.lostThisTick;
      n.netTrend = n.netTrend * 0.92 + (n.takenThisTick - n.lostThisTick) * 0.08;
      n.takenThisTick = 0;
      n.lostThisTick = 0;
      const swap = n.lostToPrev;
      n.lostToPrev = n.lostTo;
      n.lostTo = swap;
      if (swap.size) swap.clear();
      if (n.alive && n.cells > 0) {
        n._pow = n.power();
        powById[n.id] = n._pow;
      } else powById[n.id] = 0;
    }

    const frontiers = this.collectFrontiers();
    this.chooseFocus(frontiers);
    this.doExpansions(frontiers);
    this.doClashes(frontiers);
    this.doNavalOps();
    if (this.tick % 30 === 0) this.maybeSurrender();
    // Recalculate summed tech / hubs whenever territory moved (O(regions) per nation)
    this.flushDirtyStats();
    this.updateMorale();
    if (this.tick % 12 === 0) this.maybeWeaponize();
    if (this.allowNukes && this.tick % 8 === 0) this.maybeNuke();
    this.ageFlashes();

    if (this.tick % 40 === 0) {
      let lead = null;
      for (const n of this.nations.values()) {
        if (n.alive && n.cells > 0 && (!lead || n.techPower > lead.techPower)) lead = n;
      }
      if (lead) {
        const hubs = (lead.hubs || []).slice(0, 3).map((h) => h.name).join(", ");
        this.pushEvent(
          "tech",
          `${lead.name} leads tech-power ${lead.techPower}${hubs ? ` — ${hubs}` : ""}.`
        );
      }
    }
  }

  /**
   * Frontier scan: for every nation, flat lists of empty neighbour cells and
   * enemy neighbour cells (cell indices; foe = owner[cell]) plus per-foe border
   * length so strategy can weigh who it is actually touching.
   * @returns {Array<{empty:number[], enemy:number[], border:Map<number,number>}|undefined>}
   */
  collectFrontiers() {
    const byId = new Array(this.nextId + 1);
    for (const n of this.nations.values()) {
      if (n.alive && n.cells > 0) byId[n.id] = { empty: [], enemy: [], border: new Map(), n };
    }
    const owner = this.owner;
    const land = LAND;
    const cells = LAND_CELLS;
    const cols = MAP_COLS;
    const total = owner.length;
    for (let li = 0; li < cells.length; li++) {
      const i = cells[li];
      const id = owner[i];
      if (!id) continue;
      const fr = byId[id];
      if (!fr) continue;
      const x = i % cols;
      // right / left / down / up with bounds folded into index math
      if (x + 1 < cols) this._frontierProbe(fr, id, i + 1, owner, land);
      if (x > 0) this._frontierProbe(fr, id, i - 1, owner, land);
      if (i + cols < total) this._frontierProbe(fr, id, i + cols, owner, land);
      if (i >= cols) this._frontierProbe(fr, id, i - cols, owner, land);
    }
    return byId;
  }

  _frontierProbe(fr, id, ni, owner, land) {
    if (land[ni] !== 1) return;
    const oid = owner[ni];
    if (!oid) fr.empty.push(ni);
    else if (oid !== id) {
      fr.enemy.push(ni);
      fr.border.set(oid, (fr.border.get(oid) || 0) + 1);
    }
  }

  /**
   * Strategy: each colony picks a focus foe for the tick — the neighbour it can
   * actually beat, weighted toward whoever is currently taking its land and
   * toward long shared borders. Pacifists prefer the weakest target; hawks
   * also go after rich hubs.
   */
  chooseFocus(frontiers) {
    const powById = this._powById;
    for (let id = 1; id < frontiers.length; id++) {
      const fr = frontiers[id];
      if (!fr) continue;
      const n = fr.n;
      n.focusFoe = 0;
      n.frontierLen = fr.enemy.length;
      n.frontierFoes = fr.border.size;
      if (!fr.border.size) continue;
      let best = 0;
      let bestScore = -Infinity;
      const myPow = Math.max(1, n._pow);
      for (const [foe, len] of fr.border) {
        const foePow = Math.max(1, powById[foe] || 1);
        const foeN = this.nations.get(foe);
        if (!foeN) continue;
        const ratio = myPow / foePow;
        const lostTo = n.lostToPrev.get(foe) || 0; // last tick's pressure from this foe
        const revenge = 1 + Math.min(1.5, lostTo / 6);
        const hubs = foeN.techPower / Math.max(60, n.techPower);
        let score = Math.pow(ratio, 1.2) * revenge * Math.pow(len, 0.35);
        score *= 1 + (n.militarism / 200) * Math.min(1.5, hubs);
        score *= 0.85 + Math.random() * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = foe;
        }
      }
      n.focusFoe = best;
    }
  }

  doExpansions(frontiers) {
    const owner = this.owner;
    const cellRegion = CELL_REGION;
    const regions = REGIONS;
    for (let id = 1; id < frontiers.length; id++) {
      const fr = frontiers[id];
      if (!fr) continue;
      const n = fr.n;
      const empty = fr.empty;
      if (!empty.length) continue;
      const pressure = n.expansionPressure();
      // Colonies on the back foot consolidate instead of sprawling
      const underSiege = n.lostPrev > n.takenPrev * 2 + 3;
      const attempts = Math.min(
        empty.length,
        Math.ceil(pressure * (2 + Math.random() * 2) * (underSiege ? 0.6 : 1))
      );
      const chance = 0.35 + n.techPower / 500 + n.industryPower / 480;
      const greedy = n.tech >= 55 || n.industry >= 55; // developed colonies target valuable land
      for (let a = 0; a < attempts && empty.length; a++) {
        // Tournament pick: compare two frontier cells, grab the richer one
        let pick = (Math.random() * empty.length) | 0;
        if (greedy && empty.length > 1) {
          const alt = (Math.random() * empty.length) | 0;
          const rv = regions[cellRegion[empty[pick]]];
          const av = regions[cellRegion[empty[alt]]];
          if (av && rv && av.value > rv.value) pick = alt;
        }
        const i = empty[pick];
        empty[pick] = empty[empty.length - 1];
        empty.pop();
        if (owner[i] !== OWNER_EMPTY) continue;
        if (Math.random() < chance) this.claimIndex(i, id, "expand");
      }
    }
  }

  doClashes(frontiers) {
    const owner = this.owner;
    const meter = this.landMeter;
    const coast = COAST_FLAG;
    const cellRegion = CELL_REGION;
    const regions = REGIONS;
    const powById = this._powById;
    for (let id = 1; id < frontiers.length; id++) {
      const fr = frontiers[id];
      if (!fr) continue;
      const n = fr.n;
      const enemy = fr.enemy;
      if (!enemy.length) continue;

      // Pacifist colonies hesitate to attack
      const aggression =
        0.25 + n.militarism / 140 - n.pacifism / 180 + n.morale / 300 - n.warWeariness / 250;
      if (aggression < 0.08 && Math.random() > 0.15) continue;

      const pressure = n.expansionPressure();
      const attempts = Math.min(enemy.length, Math.ceil(pressure * (1.2 + Math.random())));
      const focus = n.focusFoe;
      const myPow = Math.max(1, n._pow);
      const industryF = 1.3 - Math.min(1, n.industry / 100) * 0.5; // poor industry → faster air attrition

      for (let a = 0; a < attempts && enemy.length; a++) {
        // Tournament: concentrate force on the focus foe / nearly-captured / valuable cells
        let pick = (Math.random() * enemy.length) | 0;
        if (enemy.length > 2) {
          const alt = (Math.random() * enemy.length) | 0;
          const sA = this._cellAttackScore(enemy[pick], focus, myPow, powById, owner, meter, cellRegion, regions);
          const sB = this._cellAttackScore(enemy[alt], focus, myPow, powById, owner, meter, cellRegion, regions);
          if (sB > sA) pick = alt;
        }
        const i = enemy[pick];
        enemy[pick] = enemy[enemy.length - 1];
        enemy.pop();

        const foe = owner[i];
        if (!foe || foe === id) continue;
        const defender = this.nations.get(foe);
        if (!defender || !defender.alive) continue;

        let atkMul = 1;
        let defMul = 1;
        // Island colonies fight worse on foreign continents without a fleet
        if (n.island) {
          if (!n.canProjectSea()) atkMul *= 0.35;
          else atkMul *= 0.75 + n.navalEff / 400;
        }
        // Coastal defence: a defender with sea control makes shore pushes expensive
        if (coast[i]) {
          if (defender.navalEff > n.navalEff) defMul *= 1 + (defender.navalEff - n.navalEff) / 300;
          if (n.island && !defender.island) defMul *= 1.1;
        }
        // Air superiority is a ratio contest, not a flat difference
        const airA = n.airEff;
        const airD = defender.airEff;
        const airEdge = (airA - airD) / (airA + airD + 25);
        atkMul *= 1 + 0.32 * airEdge;
        defMul *= 1 - 0.12 * airEdge;
        atkMul *= 1 + (n.weaponized - defender.weaponized) / 400;
        // Concentration of force on the chosen front
        if (foe === focus) atkMul *= 1.12;
        // Defender digging in when it is clearly on the defensive
        if (defender.lostPrev > defender.takenPrev * 2 + 2) defMul *= 1.08;

        const atk = myPow * atkMul * (0.85 + Math.random() * 0.3);
        const def =
          Math.max(1, powById[foe] || defender._pow) *
          defMul *
          (0.9 + Math.random() * 0.35) *
          (0.85 + defender.techPower / 700);

        // Soft capture meter → steadier .io border crawl
        let prog = meter[i];
        if (atk > def) {
          prog += (atk / def) * (0.35 + n.techPower / 550 + n.airEff / 600);
        } else {
          prog -= (def / atk) * 0.25;
        }
        // Multi-hub tech edge bites harder
        prog += (n.techPower - defender.techPower) / 900;

        // Sustained fighting wears down both air arms (rebuilt by industry over time)
        if (airA > 15 && airD > 15) {
          n.airAttrition += 0.0012 * industryF;
          defender.airAttrition += 0.0012 * (1.3 - Math.min(1, defender.industry / 100) * 0.5);
        }

        if (prog >= 1) {
          this.claimIndex(i, id, "clash");
          n.warWeariness += 0.15;
          defender.warWeariness += 0.25;
        } else {
          meter[i] = Math.max(0, Math.min(0.98, prog));
        }
      }
    }
  }

  _cellAttackScore(i, focus, myPow, powById, owner, meter, cellRegion, regions) {
    const foe = owner[i];
    if (!foe) return -1;
    let s = myPow / Math.max(1, powById[foe] || 1);
    if (foe === focus) s *= 1.6;
    s += meter[i] * 0.8; // finish captures already in progress
    const R = regions[cellRegion[i]];
    if (R) {
      s += R.value / 300;
      if (R.hub || R.base) s += 0.4;
    }
    return s;
  }

  /**
   * Sea invasions: hop water gaps, land beachheads, then expand inland.
   * Targets are chosen (not just found): weak foes and rich coasts first,
   * and long crossings hurt attack strength (supply lines).
   */
  doNavalOps() {
    // One pass over coast cells buckets every nation's coastline
    const coastBy = new Array(this.nextId + 1);
    let anySea = false;
    for (const n of this.nations.values()) {
      if (n.alive && n.cells > 0 && n.coastCells > 0 && n.canProjectSea()) {
        coastBy[n.id] = [];
        anySea = true;
      }
    }
    if (!anySea) return;
    const owner = this.owner;
    const coastCells = COAST_CELLS;
    for (let ci = 0; ci < coastCells.length; ci++) {
      const i = coastCells[ci];
      const id = owner[i];
      if (id && coastBy[id]) coastBy[id].push(i);
    }
    const powById = this._powById;
    const meter = this.seaMeter;
    const cellRegion = CELL_REGION;
    const regions = REGIONS;

    for (const n of this.nations.values()) {
      const coasts = coastBy[n.id];
      if (!coasts || !coasts.length) continue;

      const range = n.seaRange();
      const attempts = Math.ceil(
        (1.0 + n.navalEff / 35 + n.airEff / 90 + (n.island ? 1.0 : 0.4) + (n.caps.carriers ? 0.8 : 0)) *
          (0.75 + n.morale / 180)
      );
      const myPow = Math.max(1, n._pow);

      // Landing zones persist between ticks: re-validate known ones cheaply,
      // run only a probe or two for new ones, then concentrate the assault.
      const zones = n.seaTargets;
      let w = 0;
      for (let z = 0; z < zones.length; z++) {
        const t = zones[z];
        if (owner[t.from] !== n.id || owner[t.i] === n.id || t.d > range) continue;
        t.foe = owner[t.i];
        zones[w++] = t;
      }
      zones.length = w;
      const probes = zones.length < 2 ? 2 : n.navalEff >= 65 ? 2 : 1;
      for (let s = 0; s < probes; s++) {
        // Launch from a coast that actually faces another shore within range
        let from = -1;
        for (let tries = 0; tries < 4; tries++) {
          const c = coasts[(Math.random() * coasts.length) | 0];
          if (this.seaHint(c) <= range) {
            from = c;
            break;
          }
          // Occasionally probe anyway — foes across a bay share our landmass
          if (tries === 3 && Math.random() < 0.15) from = c;
        }
        if (from < 0) continue;
        const t = this.scanSeaTarget(from, n.id, range);
        if (!t) continue;
        let dup = false;
        for (let z = 0; z < zones.length; z++) if (zones[z].i === t.i) { dup = true; break; }
        if (!dup) zones.push({ i: t.i, foe: t.foe, d: t.d, from, score: 0 });
      }
      if (!zones.length) continue;
      for (let z = 0; z < zones.length; z++) {
        const t = zones[z];
        const R = regions[cellRegion[t.i]];
        let score = (R ? R.value : 40) / 100 - t.d * 0.08 + meter[t.i] * 0.6;
        if (t.foe) {
          const foePow = Math.max(1, powById[t.foe] || 1);
          score += Math.min(3, myPow / foePow) * 0.9 - 0.5;
          if (t.foe === n.focusFoe) score += 0.6;
        } else score += 0.7;
        t.score = score;
      }
      zones.sort((a, b) => b.score - a.score);
      if (zones.length > 8) zones.length = 8;

      for (let a = 0; a < attempts; a++) {
        // Best zone gets the first wave; later waves spread over the next-best
        const target = zones[a % zones.length];
        const { i, foe, d } = target;
        if (owner[i] === n.id) continue; // already taken earlier this tick
        const supply = Math.max(0.45, 1 - d * 0.035);

        if (!foe) {
          if (Math.random() < (0.5 + n.navalEff / 180) * supply) {
            this.claimIndex(i, n.id, "expand");
            this.expandBeachhead(i, n.id, 1 + Math.floor(n.navalEff / 40));
            if (Math.random() < 0.1) {
              this.pushEvent("tech", `${n.name} lands a sea invasion on open coast.`);
            }
          }
          continue;
        }

        const defender = this.nations.get(foe);
        if (!defender || !defender.alive) continue;

        const airEdge = (n.airEff - defender.airEff) / (n.airEff + defender.airEff + 25);
        const atk =
          myPow *
          (0.55 + n.navalEff / 120 + n.airEff / 300) *
          (1 + 0.3 * airEdge) *
          (n.island ? 1.0 : 0.85) *
          (n.caps.subs ? 1.05 : 1) *
          supply *
          (0.85 + Math.random() * 0.35);
        // Sea control: a defender with the stronger fleet contests the landing itself
        const seaControl = defender.navalEff > n.navalEff ? 1 + (defender.navalEff - n.navalEff) / 150 : 1;
        const def =
          Math.max(1, powById[foe] || defender._pow) *
          (0.9 + defender.techPower / 700 + defender.navalEff / 260 + (defender.island ? 0.1 : 0)) *
          seaControl *
          (0.9 + Math.random() * 0.3);

        let prog = meter[i];
        if (atk > def) {
          prog += (atk / def) * (0.4 + n.navalEff / 320);
          n.navalAttrition += 0.01;
        } else {
          prog -= 0.18;
          n.navalAttrition += 0.03; // failed landings cost ships
          defender.navalAttrition += 0.008;
        }
        prog += (n.navalEff - defender.navalEff) / 500;

        if (prog >= 1) {
          this.claimIndex(i, n.id, "clash");
          this.expandBeachhead(i, n.id, 1 + Math.floor(n.navalEff / 35));
          n.warWeariness += 0.35;
          defender.warWeariness += 0.4;
          if (Math.random() < 0.18) {
            this.pushEvent("battle", `${n.name} mounts a sea invasion against ${defender.name}.`);
          }
        } else {
          meter[i] = Math.max(0, Math.min(0.98, prog));
        }
      }
    }
  }

  /** After a landing, grab a few adjacent coastal/empty tiles as a beachhead. */
  expandBeachhead(i, nationId, radius = 1) {
    const x = i % MAP_COLS;
    const y = (i / MAP_COLS) | 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (!dx && !dy) continue;
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(tx, ty) || !isLand(tx, ty)) continue;
        const ti = idx(tx, ty);
        if (this.owner[ti] === OWNER_EMPTY && Math.random() < 0.55) {
          this.claimIndex(ti, nationId, "expand");
        }
      }
    }
  }

  findCoastalCells(nationId) {
    const out = [];
    const owner = this.owner;
    const coast = COAST_CELLS;
    for (let ci = 0; ci < coast.length; ci++) {
      const i = coast[ci];
      if (owner[i] !== nationId) continue;
      out.push([i % MAP_COLS, (i / MAP_COLS) | 0]);
    }
    return out;
  }

  /**
   * BFS from a coastal cell across water only; returns the first foreign/empty
   * land reached as {i, foe, d} where d is the water distance (supply line).
   */
  scanSeaTarget(start, nationId, range) {
    const qx = this._qx;
    const qy = this._qy;
    const qd = this._qd;
    const stamp = this._seenStamp;
    const gen = this._nextSeenGen();
    const owner = this.owner;
    const cols = MAP_COLS;
    const rows = MAP_ROWS;
    let head = 0;
    let tail = 0;
    qx[tail] = start % cols;
    qy[tail] = (start / cols) | 0;
    qd[tail] = 0;
    tail++;
    stamp[start] = gen;
    while (head < tail) {
      const x = qx[head];
      const y = qy[head];
      const d = qd[head];
      head++;
      for (let k = 0; k < 4; k++) {
        const nx = x + N4_DX[k];
        const ny = y + N4_DY[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (stamp[ni] === gen) continue;
        stamp[ni] = gen;
        if (LAND[ni] === 1) {
          const oid = owner[ni];
          if (oid === nationId) continue;
          if (d === 0) continue; // adjacent land handled by normal expand/clash
          return { i: ni, foe: oid || 0, d };
        }
        const nd = d + 1;
        if (nd > range) continue;
        if (tail >= qx.length) return null; // ring buffer full — give up this probe
        qx[tail] = nx;
        qy[tail] = ny;
        qd[tail] = nd;
        tail++;
      }
    }
    return null;
  }

  /**
   * Surrender / cede-region: an overextended empire (many regions, long
   * frontier, weary, demoralised, losing on several fronts) gives up its least
   * valuable, most exposed region — to the neighbour pressuring it most as a
   * peace concession, or releases it as empty land when nobody is pressing it.
   * Evaluated every 20 ticks; per-nation cooldown; never cedes core hubs /
   * bases; never while winning. Uses per-nation region counts + region cell
   * lists only (no full-map rescans).
   */
  maybeSurrender() {
    if (this.tick - this.lastCedeTick < 60) return; // world-wide: treaties are rare news
    const powById = this._powById;
    let ceded = false;
    for (const n of this.nations.values()) {
      if (ceded) break; // at most one concession per pulse keeps the feed readable
      if (!n.alive || n.cells < 400 || n.regionCount < 5) continue;
      if (this.tick < n.cedeCooldownUntil) continue;
      if (n.netTrend > 0.3) continue; // winning → no concessions
      const losingFronts = n.lostToPrev.size;
      const over =
        n.regionCount / 14 +
        n.frontierLen / (Math.sqrt(n.cells) * 6) +
        n.warWeariness / 60 +
        (100 - n.morale) / 70 +
        (n.netTrend < -0.5 ? 0.6 : 0) +
        (losingFronts >= 2 ? 0.45 : 0) +
        (n.pacifism > n.militarism ? 0.25 : 0);
      if (over < 2.8) continue;
      if (Math.random() > (over - 2.8) * 0.22) continue;

      const pick = this.pickCedeRegion(n);
      if (!pick) continue;
      const { R, owned, byFoe, exposure } = pick;

      // Receiver: whoever presses that region hardest and is a real threat —
      // but never hand land straight back to someone who just conceded to us
      let receiver = null;
      let bestLen = 0;
      for (const [foe, len] of byFoe) {
        const fn = this.nations.get(foe);
        if (!fn || !fn.alive) continue;
        if ((n.truceWith.get(foe) || 0) > this.tick) continue;
        if ((powById[foe] || 0) < n._pow * 0.5 && len < owned * 0.25) continue;
        if (len > bestLen) {
          bestLen = len;
          receiver = fn;
        }
      }
      if (!receiver && exposure < 0.05 && R.landmass === this.coreLandmass(n)) continue; // nothing to gain

      // Hand the region over (or abandon it) — one pass over that region's cells
      const list = R.cellList;
      const owner = this.owner;
      const toId = receiver ? receiver.id : OWNER_EMPTY;
      let moved = 0;
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (owner[i] !== n.id) continue;
        this._setOwner(i, toId);
        this.landMeter[i] = 0;
        this.seaMeter[i] = 0;
        moved++;
      }
      if (!moved) continue;

      // Shorter front, tired public relieved; receiver's war goals partly met
      n.warWeariness = Math.max(0, n.warWeariness * 0.6 - 6);
      n.morale = Math.min(100, n.morale + 6 + Math.min(10, moved / 60));
      n.cedeCooldownUntil = this.tick + 150;
      this.lastCedeTick = this.tick;
      n.seaTargets.length = 0;
      if (receiver) {
        receiver.warWeariness = Math.max(0, receiver.warWeariness - 4);
        receiver.morale = Math.min(100, receiver.morale + 3);
        if (receiver.focusFoe === n.id) receiver.focusFoe = 0;
        receiver.truceWith.set(n.id, this.tick + 240); // no concessions back the other way for a while
        this.pushEvent(
          "fall",
          `${n.name} surrenders ${R.name} (${moved} tiles) to ${receiver.name} to shorten its front.`
        );
      } else {
        this.pushEvent(
          "fall",
          `${n.name} abandons ${R.name} (${moved} tiles), pulling back to defensible ground.`
        );
      }
      ceded = true;
    }
  }

  /** Landmass of a nation's core hub region (fallback: its largest held region). */
  coreLandmass(n) {
    const id = REGION_BY_NAME.get(n.coreRegion || n.regions[0]?.name);
    return id === undefined ? -1 : REGIONS[id].landmass;
  }

  /**
   * Least valuable / most exposed region a nation could give up. Cheap first
   * pass over held regions (value, share held, distance from core, cut off by
   * sea); exact border exposure computed only for the few best candidates.
   */
  pickCedeRegion(n) {
    const regions = REGIONS;
    const counts = n.regionCounts;
    const coreId = REGION_BY_NAME.get(n.coreRegion || "");
    const core = coreId !== undefined ? regions[coreId] : null;
    const coreLm = core ? core.landmass : -1;
    const protect = new Set();
    if (n.coreRegion) protect.add(n.coreRegion);
    for (let h = 0; h < Math.min(3, n.hubs.length); h++) protect.add(n.hubs[h].name);
    if (n.regions[0]) protect.add(n.regions[0].name); // homeland = biggest holding
    const diag = Math.hypot(MAP_COLS, MAP_ROWS);

    const cands = [];
    for (let id = 0; id < regions.length; id++) {
      const c = counts[id];
      if (c < 20 || c > 3000) continue; // slivers aren't worth a treaty; never cede a continent wholesale
      const R = regions[id];
      if (R.hub || R.base || protect.has(R.name)) continue;
      if (c > n.cells * 0.35) continue; // too much of us
      const frac = c / R.cells;
      const dist = core ? Math.hypot(R.cx - core.cx, R.cy - core.cy) / diag : 0.3;
      let s = R.value / 100 + frac * 1.2;
      if (coreLm >= 0 && R.landmass !== coreLm) s -= 0.9; // cut off by sea
      s -= dist * 2.0;
      cands.push({ id, s, c });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.s - b.s);
    const owner = this.owner;
    const land = LAND;
    const cols = MAP_COLS;
    const total = owner.length;
    let best = null;
    let bestScore = Infinity;
    for (let k = 0; k < Math.min(4, cands.length); k++) {
      const { id, s, c } = cands[k];
      const R = regions[id];
      const list = R.cellList;
      const byFoe = new Map();
      let enemyEdges = 0;
      let ownEdges = 0;
      for (let t = 0; t < list.length; t++) {
        const i = list[t];
        if (owner[i] !== n.id) continue;
        const x = i % cols;
        const nb = [x + 1 < cols ? i + 1 : -1, x > 0 ? i - 1 : -1, i + cols < total ? i + cols : -1, i >= cols ? i - cols : -1];
        for (let q = 0; q < 4; q++) {
          const ni = nb[q];
          if (ni < 0 || land[ni] !== 1) continue;
          const oid = owner[ni];
          if (oid === n.id) ownEdges++;
          else if (oid) {
            enemyEdges++;
            byFoe.set(oid, (byFoe.get(oid) || 0) + 1);
          }
        }
      }
      const exposure = enemyEdges / Math.max(1, c);
      const score = s - exposure * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = { R, owned: c, byFoe, exposure, ownEdges };
      }
    }
    return best;
  }

  /**
   * Dual-use industry → fielded weapons under wartime pressure.
   * Pacifist / low-militarism colonies convert slowly; militarized ones arm up.
   */
  maybeWeaponize() {
    for (const n of this.nations.values()) {
      if (!n.alive || n.cells <= 0) continue;
      // Established programs slowly rebuild toward what their complex supports:
      // needs an intact enrichment / nuclear track and industry to pay for it.
      if (n.nuclear >= 60 && n.nukesLeft < stockpileFor(n.arsenalNow)) {
        const track =
          (n.weapons || []).some((w) => /nuke|nuclear/.test(String(w))) ||
          (n.dualUse || []).some((d) => /enrichment|nuclear-power|uranium/.test(String(d)));
        if (track && Math.random() < n.industry / 650 + (n.militarism > 60 ? 0.03 : 0)) {
          n.nukesLeft += 1;
          if (Math.random() < 0.3) this.pushEvent("nuke", `${n.name} assembles a new warhead (${n.nukesLeft} in stock).`);
        }
      }
      if (n.weaponizable <= n.weaponized + 5) continue;
      const pressure =
        n.warWeariness / 40 +
        n.militarism / 120 -
        n.pacifism / 180 +
        (n.lostThisTick > 0 ? 0.25 : 0);
      if (pressure < 0.15 || Math.random() > pressure * 0.35) continue;
      const gain = 1 + Math.floor(n.weaponizable / 40);
      const before = n.weaponized;
      n.weaponized = Math.min(100, n.weaponized + gain);
      n.weaponizable = Math.max(0, n.weaponizable - Math.ceil(gain * 0.4));
      // Promote a dual-use tag into weapons when crossing thresholds
      if (n.dualUse?.length && n.weaponized >= before + 1) {
        const tag = n.dualUse[Math.floor(Math.random() * n.dualUse.length)];
        const armedTag = tag === "enrichment" || tag === "nuclear-power" || tag === "uranium"
          ? "weaponized-nuclear-track"
          : tag === "rocketry" || tag === "space-launch"
            ? "ballistic-missiles"
            : tag === "semiconductors" || tag === "AI"
              ? "precision-munitions"
              : tag === "shipyards"
                ? "submarines"
                : `${tag}-arms`;
        if (!n.weapons.includes(armedTag)) {
          n.weapons = [...n.weapons, armedTag].slice(0, 10);
          n.caps = armsCapabilities(n.weapons);
        }
      }
      // Proliferation: an enrichment track + hardened industry breeds a bomb program
      const nuclearTrack = (n.weapons || []).some((w) => String(w).includes("nuclear"));
      if (n.weaponized >= 55 && nuclearTrack && n.nuclear < 75) {
        const wasArmed = n.nuclear >= 50;
        n.nuclearBonus = Math.min(60, n.nuclearBonus + 8);
        n.nuclear = Math.min(100, n.nuclear + 8);
        if (!wasArmed && n.nuclear >= 50) {
          n.nukesLeft += 1 + (n.industry >= 60 ? 1 : 0);
          this.pushEvent("nuke", `${n.name} tests its first nuclear device (${n.nukesLeft} warheads).`);
        }
      }
      this.pushEvent(
        "tech",
        `${n.name} militarizes dual-use tech (${weaponLabel(n.weaponized, n.weaponizable)}).`
      );
    }
  }

  updateMorale() {
    for (const n of this.nations.values()) {
      if (!n.alive || n.cells <= 0) {
        n.alive = false;
        continue;
      }
      const net = n.militarism - n.pacifism;
      // Wins raise morale; losses + pacifism crush it
      n.morale += n.takenThisTick * (0.35 + Math.max(0, net) / 200);
      n.morale -= n.lostThisTick * (0.55 + Math.max(0, -net) / 120 + n.pacifism / 250);
      // Long wars tire pacifists more
      if (n.warWeariness > 20) {
        n.morale -= (n.pacifism / 80) * (n.warWeariness / 60);
      }
      n.warWeariness = Math.max(0, n.warWeariness * 0.992 - 0.02);
      n.morale = Math.max(8, Math.min(100, n.morale));

      // Combat attrition on air / naval arms (territory drift rebuilds them)
      if (n.airAttrition > 0) {
        n.airforce = Math.max(5, n.airforce - Math.min(0.6, n.airAttrition));
        n.airAttrition = 0;
      }
      if (n.navalAttrition > 0) {
        n.naval = Math.max(5, n.naval - Math.min(0.4, n.navalAttrition));
        n.navalAttrition = 0;
      }
      // Nuke-imposed ceilings heal slowly as bases are rebuilt (no permanent ratchet)
      if (n.airforceCap != null && (n.airforceCap += 0.1) >= 100) n.airforceCap = null;
      if (n.navalCap != null && (n.navalCap += 0.1) >= 100) n.navalCap = null;
      if (n.weaponizedCap != null && (n.weaponizedCap += 0.1) >= 100) n.weaponizedCap = null;
      n.computeEffective();

      if (n.morale < 18 && n.pacifism > 55 && Math.random() < 0.02) {
        this.pushEvent("battle", `${n.name}'s public resists further offensive war.`);
      }
    }
  }

  /**
   * Desperate nuclear use: tactical (bases / local hubs) and strategic (deep tech hubs).
   * Factors warhead stockpile, deterrence (second-strike credibility), layered
   * missile defence vs penetration aids, and retaliation.
   */
  maybeNuke() {
    const armed = [];
    for (const n of this.nations.values()) {
      if (n.alive && n.cells > 0 && n.nuclear >= 50 && n.nukesLeft > 0) armed.push(n);
    }
    if (!armed.length) return;

    for (const n of armed) {
      const losing =
        n.lostThisTick > n.takenThisTick + 2 ||
        n.morale < 38 ||
        n.cells < Math.max(25, n.peakTech) ||
        n.warWeariness > 35;
      const desperate =
        n.morale < 28 ||
        n.lostThisTick > n.takenThisTick + 8 ||
        n.cells < 20 ||
        (n.warWeariness > 55 && n.lostThisTick > 0);
      if (!losing && !desperate) continue;

      const will =
        (n.militarism / 95) *
        (n.nuclear / 100) *
        (desperate ? 2.2 : 1.15) *
        (n.pacifism > 55 ? 0.35 : 1) *
        Math.min(1.4, 0.55 + n.nukesLeft / 10);
      if (Math.random() > will * 0.09) continue;

      const foe = this.pickNukeFoe(n);
      if (!foe) continue;

      // Deterrence: credible second strike stays the hand (less when desperate,
      // less when the launcher trusts its own missile shield)
      if (foe.nuclear >= 50 && foe.nukesLeft > 0) {
        const credibility = foe.nukesLeft * (foe.caps.secondStrike ? 1.6 : 1);
        let hold = 0.2 + Math.min(0.55, credibility / 18) - n.nukeDefense / 300;
        if (desperate) hold -= 0.3;
        if (Math.random() < Math.max(0, Math.min(0.85, hold))) {
          this.pushEvent(
            "nuke",
            `${n.name} holds fire — ${foe.name} keeps a credible deterrent (${foe.nukesLeft} warheads${foe.caps.secondStrike ? ", second-strike subs" : ""}).`
          );
          continue;
        }
      }

      const tacticalOnly = !desperate || n.nukesLeft < 3 || n.nuclear < 70;
      const kind = tacticalOnly ? "tactical" : Math.random() < 0.55 ? "strategic" : "tactical";
      const launched = this.launchNuke(n, foe, kind, false);
      if (launched) {
        this.maybeRetaliate(foe, n, kind);
        break; // one launch sequence resolved per pulse
      }
    }
  }

  /** Whom to nuke: whoever is actually taking our land, then the biggest tech threat. */
  pickNukeFoe(n) {
    let best = null;
    let bestScore = -Infinity;
    for (const o of this.nations.values()) {
      if (!o.alive || o.cells <= 0 || o.id === n.id) continue;
      const lostTo = n.lostTo.get(o.id) || 0;
      let score = o.techPower / 120 + o.cells / 800 + lostTo * 2.5;
      if (o.id === n.focusFoe) score += 3;
      if (o.nuclear >= 50 && o.nukesLeft > 0) score -= 1.5; // prefer non-nuclear victims
      score *= 0.8 + Math.random() * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  /**
   * Fire a salvo at foe. Returns true when warheads were expended (hit or intercepted).
   */
  launchNuke(n, foe, kind, retaliation) {
    const target = this.pickNukeTarget(foe, kind, n.id);
    if (!target) return false;
    const isStrategic = kind === "strategic";
    const cost = isStrategic ? Math.min(n.nukesLeft, 2 + Math.floor(n.nuclear / 50)) : 1;
    if (n.nukesLeft < cost || cost <= 0) return false;

    // Layered defence: national ABM, local site, vs penetration aids per warhead
    const localDef = (target.prof && target.prof.nukeDef) || 0;
    const defense = Math.max(foe.nukeDefense || 0, localDef) * (retaliation ? 0.85 : 1);
    const penetrator =
      n.nuclear * 0.5 + n.tech * 0.2 + n.caps.penetration + (isStrategic ? 12 : 4);
    const interceptChance = Math.min(0.85, Math.max(0.03, (defense - penetrator * 0.4) / 110));
    let penetrated = 0;
    for (let w = 0; w < cost; w++) if (Math.random() >= interceptChance) penetrated++;
    n.nukesLeft -= cost;

    if (!penetrated) {
      this.pushEvent(
        "nuke",
        `${foe.name}'s missile defense intercepts ${cost > 1 ? `all ${cost} warheads of` : ""} a ${kind} strike from ${n.name} (def ${Math.round(defense)} vs pen ${Math.round(penetrator)}).`
      );
      this.flashes.push({ x: target.x, y: target.y, life: 14, r: 4, color: "#9ecbff", kind: "intercept" });
      return true;
    }
    const yieldF = penetrated / cost;
    this.resolveNukeStrike(n, foe, target, kind, yieldF, retaliation, cost - penetrated);
    return true;
  }

  /** Second strike: a nuclear state hit by a nuke usually answers in kind. */
  maybeRetaliate(victim, attacker, kind) {
    if (!this.allowNukes) return;
    if (!victim.alive || victim.cells <= 0 || victim.nuclear < 50 || victim.nukesLeft <= 0) return;
    if (!attacker.alive || attacker.cells <= 0) return;
    let chance = 0.45 + victim.militarism / 250 - victim.pacifism / 300;
    if (kind === "strategic") chance += 0.3;
    if (victim.caps.secondStrike) chance += 0.15;
    if (Math.random() > chance) return;
    const rkind =
      victim.nuclear >= 70 && victim.nukesLeft >= 3 && (kind === "strategic" || victim.morale < 30)
        ? "strategic"
        : "tactical";
    if (this.launchNuke(victim, attacker, rkind, true)) {
      this.pushEvent("nuke", `${victim.name} retaliates against ${attacker.name} with a ${rkind} strike.`);
    }
  }

  /**
   * Pick a target cell inside foe territory. Scores regions the foe holds (value,
   * presence, not-yet-ruined), then samples cells from the chosen region's list —
   * works for tiny foes too (no blind map-wide sampling).
   */
  pickNukeTarget(foe, kind, attackerId = 0) {
    const counts = foe.regionCounts;
    if (!counts) return null;
    const regions = REGIONS;
    const tactical = kind === "tactical";
    // Region shortlist
    let r1 = -1, r2 = -1, r3 = -1;
    let s1 = -Infinity, s2 = -Infinity, s3 = -Infinity;
    for (let id = 0; id < regions.length; id++) {
      const c = counts[id];
      if (!c) continue;
      const R = regions[id];
      const prof = R.prof;
      let score = R.value;
      if (tactical) {
        if (R.base) score += 60;
        else if (R.hub) score += 15;
        else score *= 0.55;
      } else {
        if (R.hub) score += 50;
        if (R.base) score += 25;
        score += (prof.tech || 0) * 0.4;
      }
      score *= 0.5 + 0.5 * regionPresence(c, R.cells);
      const ruin = this.regionRuin.get(R.name);
      if (ruin) score *= Math.min(ruin.techMul, ruin.milMul) * 0.35; // already glassed
      score *= 0.85 + Math.random() * 0.3;
      if (score > s1) { r3 = r2; s3 = s2; r2 = r1; s2 = s1; r1 = id; s1 = score; }
      else if (score > s2) { r3 = r2; s3 = s2; r2 = id; s2 = score; }
      else if (score > s3) { r3 = id; s3 = score; }
    }
    if (r1 < 0) return null;
    const choices = [r1, r2, r3].filter((r) => r >= 0);
    const owner = this.owner;
    const cols = MAP_COLS;
    for (const rid of choices) {
      const R = regions[rid];
      const list = R.cellList;
      const held = counts[rid];
      // Expected tries to hit a foe-owned cell = total / held; cap the search
      const tries = Math.min(list.length, Math.max(24, Math.ceil((list.length / held) * 6)));
      let best = -1;
      let bestScore = -1;
      for (let t = 0; t < tries; t++) {
        const i = list[(Math.random() * list.length) | 0];
        if (owner[i] !== foe.id) continue;
        let score = 1;
        if (tactical && attackerId) {
          // Tactical strikes hit the front: prefer cells touching attacker land
          const x = i % cols;
          if ((x + 1 < cols && owner[i + 1] === attackerId) ||
              (x > 0 && owner[i - 1] === attackerId) ||
              (i + cols < owner.length && owner[i + cols] === attackerId) ||
              (i >= cols && owner[i - cols] === attackerId)) score += 2;
        }
        score += Math.random() * 0.5;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
        if (bestScore >= 3) break;
      }
      if (best >= 0) {
        const x = best % cols;
        const y = (best / cols) | 0;
        return { x, y, prof: profileAtCell(x, y, cols, MAP_ROWS), score: bestScore };
      }
    }
    return null;
  }

  resolveNukeStrike(attacker, foe, target, kind, yieldF = 1, retaliation = false, intercepted = 0) {
    const t = target;
    const label = t.prof?.name || "enemy territory";
    const isStrategic = kind === "strategic";
    const baseRadius = isStrategic
      ? 5 + Math.floor(attacker.nuclear / 28)
      : 2 + Math.floor(attacker.nuclear / 55);
    const radius = Math.max(1, Math.round(baseRadius * (0.6 + 0.4 * yieldF)));
    const coreR = isStrategic ? (yieldF >= 0.5 ? 3 : 2) : 1;
    const ruinedCities = [];

    // Ruin city benefits under the whole blast (center hardest), then crater / seize land
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist2 = dx * dx + dy * dy;
        if (dist2 > radius * radius) continue;
        const x = t.x + dx;
        const y = t.y + dy;
        if (!inBounds(x, y) || !isLand(x, y)) continue;
        const prof = profileAtCell(x, y, MAP_COLS, MAP_ROWS);
        if (prof?.name) {
          const severity = (1 - Math.sqrt(dist2) / Math.max(1, radius)) * (0.7 + 0.3 * yieldF);
          this.devastateRegion(prof, kind, severity);
          if ((prof.hub || prof.base || (prof.tech || 0) >= 70) && !ruinedCities.includes(prof.name)) {
            ruinedCities.push(prof.name);
          }
        }

        const i = idx(x, y);
        if (dist2 <= coreR * coreR) {
          // Blast core: scorched crater
          this._setOwner(i, OWNER_EMPTY);
          this.landMeter[i] = 0;
          this.seaMeter[i] = 0;
        } else {
          // Fallout ring: seize / devastate enemy land
          const oid = this.owner[i];
          if (oid && oid !== attacker.id) {
            if (isStrategic || Math.random() < 0.65) this.claimIndex(i, attacker.id, "clash");
          }
        }
      }
    }

    // Ground zero city always fully devastated for this bomb type
    if (t.prof) this.devastateRegion(t.prof, kind, yieldF);

    this.markDirty(attacker.id);
    this.markDirty(foe.id);
    this.flushDirtyStats();

    // Soft-maxed national military / tech also take a hit (depends on bomb + target)
    this.applyNationBlastDamage(foe, kind, t.prof, yieldF);

    // Large yellow strike marker (strategic bigger / longer)
    this.flashes.push({
      x: t.x,
      y: t.y,
      life: isStrategic ? 36 : 26,
      r: isStrategic ? radius + 8 : radius + 5,
      color: "#ffe566",
      kind,
      big: true,
    });

    attacker.warWeariness += isStrategic ? 14 : 7;
    foe.warWeariness += isStrategic ? 18 : 10;
    foe.morale = Math.max(5, foe.morale - (isStrategic ? 24 : 14) * (0.6 + 0.4 * yieldF));
    attacker.morale = Math.max(8, attacker.morale - (isStrategic ? 10 : 5));

    const kindLabel = isStrategic ? "STRATEGIC nuclear strike" : "tactical nuclear strike";
    const ruinBit = ruinedCities.length
      ? ` Ruined: ${ruinedCities.slice(0, 4).join(", ")}${ruinedCities.length > 4 ? "…" : ""}.`
      : "";
    const shieldBit = intercepted > 0 ? ` ${intercepted} warhead${intercepted === 1 ? "" : "s"} intercepted.` : "";
    const left = attacker.nukesLeft;
    this.pushEvent(
      "nuke",
      `${attacker.name} hits ${foe.name}'s ${label} with a ${kindLabel}!${ruinBit}${shieldBit} (${left} warhead${left === 1 ? "" : "s"} left)`
    );
  }

  /** Immediate national stat loss after a city strike (on top of lasting region ruins). */
  applyNationBlastDamage(foe, kind, prof, yieldF = 1) {
    const hub = !!prof?.hub;
    const base = !!prof?.base;
    const isStrategic = kind === "strategic";
    // Scale a multiplier toward 1 for partially-intercepted salvos
    const m = (k) => 1 - (1 - k) * (0.5 + 0.5 * yieldF);
    if (isStrategic) {
      foe.airforce = Math.max(5, Math.round(foe.airforce * m(hub || base ? 0.58 : 0.78)));
      foe.weaponized = Math.max(5, Math.round(foe.weaponized * m(hub || base ? 0.5 : 0.72)));
      foe.naval = Math.max(5, Math.round(foe.naval * m(base ? 0.75 : 0.88)));
      foe.nuclear = Math.max(0, Math.round(foe.nuclear * m(base ? 0.65 : 0.85)));
      foe.nuclearBonus = Math.round(foe.nuclearBonus * 0.6);
      foe.industry = Math.max(5, Math.round(foe.industry * m(hub ? 0.55 : 0.78)));
      foe.tech = Math.max(5, Math.round(foe.tech * m(hub ? 0.5 : 0.72)));
      foe.peakTech = Math.max(12, Math.round(foe.peakTech * m(hub ? 0.45 : 0.68)));
      foe.weaponizable = Math.max(0, Math.round(foe.weaponizable * m(hub ? 0.4 : 0.65)));
      foe.nukeDefense = Math.max(0, Math.round(foe.nukeDefense * m(0.35)));
      if (hub || base) foe.techPower = Math.max(0, Math.round(foe.techPower * m(0.72)));
      if (base) foe.industryPower = Math.max(0, Math.round(foe.industryPower * m(0.7)));
      // Command disruption: part of the arsenal is lost in silos / on bases
      if (base && foe.nukesLeft > 0) foe.nukesLeft = Math.max(0, foe.nukesLeft - Math.ceil(foe.nukesLeft * 0.25 * yieldF));
    } else {
      foe.airforce = Math.max(5, Math.round(foe.airforce * m(base ? 0.68 : 0.9)));
      foe.weaponized = Math.max(5, Math.round(foe.weaponized * m(base ? 0.6 : 0.88)));
      foe.naval = Math.max(5, Math.round(foe.naval * m(base ? 0.8 : 0.95)));
      foe.nukeDefense = Math.max(0, foe.nukeDefense - (base ? 14 : 5) * yieldF);
      foe.tech = Math.max(5, Math.round(foe.tech * m(hub ? 0.8 : 0.95)));
      foe.peakTech = Math.max(12, foe.peakTech - (hub ? 7 : 2));
      foe.techPower = Math.max(0, Math.round(foe.techPower * m(hub ? 0.82 : base ? 0.9 : 0.96)));
      if (base) foe.industryPower = Math.max(0, Math.round(foe.industryPower * m(0.88)));
      if (base && foe.nukesLeft > 1 && Math.random() < 0.5 * yieldF) foe.nukesLeft -= 1;
    }
    // Lock military ceilings so soft-max sync can't restore glassed force structure
    foe.airforceCap =
      foe.airforceCap == null ? foe.airforce : Math.min(foe.airforceCap, foe.airforce);
    foe.weaponizedCap =
      foe.weaponizedCap == null ? foe.weaponized : Math.min(foe.weaponizedCap, foe.weaponized);
    foe.navalCap = foe.navalCap == null ? foe.naval : Math.min(foe.navalCap, foe.naval);
    foe.computeEffective();
  }

  ageFlashes() {
    if (!this.flashes.length) return;
    for (const f of this.flashes) f.life--;
    this.flashes = this.flashes.filter((f) => f.life > 0);
  }

  nationAt(x, y) {
    if (!inBounds(x, y)) return null;
    const id = this.owner[idx(x, y)];
    return id ? this.nations.get(id) : null;
  }
}

/** 24 distinct district colors for colonies. */
const NATION_COLORS = [
  "#c45c26", "#2f6f7e", "#b33b4a", "#4a7c59", "#8b6aad",
  "#c4a035", "#3d7ea6", "#a65d3f", "#5c8a4d", "#9c4d6f",
  "#2f8f7a", "#d17a2a", "#5b6ea0", "#7a5c3a", "#d44d6a",
  "#3a9e6f", "#6b5cff", "#e08a3c", "#1f9bb0", "#c23d8f",
  "#7d9b3a", "#b07040", "#4d7fd4", "#9a3d3d",
];

function randomNationColor(used = null) {
  const palette = NATION_COLORS;
  if (used && used.size) {
    const free = palette.filter((c) => !used.has(c.toLowerCase()));
    if (free.length) return free[Math.floor(Math.random() * free.length)];
  }
  return palette[Math.floor(Math.random() * palette.length)];
}
