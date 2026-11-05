/**
 * Legacy stub — HD land mask + every-country borders now come from world.js
 * (Natural Earth 50m rasterized at MAP_COLS × MAP_ROWS).
 */
/* world.js defines: MAP_COLS, MAP_ROWS, LAND, COUNTRY_BORDER, COUNTRY_IDX,
   WORLD_META, WORLD_STROKES, idx, inBounds, isLand, neighbors4, neighbors8,
   countryMetaAt, lonLatToCell, cellToLonLat */

/** Precomputed land / coast cell indices — skip ocean in hot loops. */
var LAND_CELLS = null;
var COAST_CELLS = null;
var COAST_FLAG = null; // Uint8Array: 1 when a land cell touches in-bounds water
var N4_DX = [1, -1, 0, 0];
var N4_DY = [0, 0, 1, -1];

function ensureMapCaches() {
  if (LAND_CELLS) return;
  const land = [];
  const coast = [];
  const cols = MAP_COLS;
  const rows = MAP_ROWS;
  const flag = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (LAND[i] !== 1) continue;
      land.push(i);
      // Match isLand-neighbor check: only in-bounds water counts as coast
      let isCoast = false;
      for (let k = 0; k < 4; k++) {
        const nx = x + N4_DX[k];
        const ny = y + N4_DY[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (LAND[ny * cols + nx] !== 1) {
          isCoast = true;
          break;
        }
      }
      if (isCoast) {
        coast.push(i);
        flag[i] = 1;
      }
    }
  }
  LAND_CELLS = Int32Array.from(land);
  COAST_CELLS = Int32Array.from(coast);
  COAST_FLAG = flag;
  LANDMASS = buildLandmasses(cols, rows);
}

/** Connected land components (4-neighbour) — sea invasions care about *other* landmasses. */
var LANDMASS = null;
function buildLandmasses(cols, rows) {
  const total = cols * rows;
  const comp = new Int32Array(total).fill(-1);
  const stack = new Int32Array(total);
  let next = 0;
  for (let s = 0; s < total; s++) {
    if (LAND[s] !== 1 || comp[s] >= 0) continue;
    const id = next++;
    let top = 0;
    stack[top++] = s;
    comp[s] = id;
    while (top) {
      const i = stack[--top];
      const x = i % cols;
      if (x + 1 < cols && LAND[i + 1] === 1 && comp[i + 1] < 0) { comp[i + 1] = id; stack[top++] = i + 1; }
      if (x > 0 && LAND[i - 1] === 1 && comp[i - 1] < 0) { comp[i - 1] = id; stack[top++] = i - 1; }
      if (i + cols < total && LAND[i + cols] === 1 && comp[i + cols] < 0) { comp[i + cols] = id; stack[top++] = i + cols; }
      if (i >= cols && LAND[i - cols] === 1 && comp[i - cols] < 0) { comp[i - cols] = id; stack[top++] = i - cols; }
    }
  }
  return comp;
}