"""
Build HD world grids + simplified country outline strokes for Border Wars.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "ne_50m_admin_0_countries.geojson"
OUT = ROOT / "js" / "world.js"

COLS = 960
ROWS = 480

# Natural Earth leaves ISO_A2 as -99 for some sovereigns; map ADM0_A3 → ISO2
A3_TO_A2 = {
    "FRA": "FR",
    "NOR": "NO",
    "NOR": "NO",
    "KOS": "XK",
    "SOL": "SOL",
    "CYN": "CYN",
    "TWN": "TW",
    "IOA": "IO",
    "ATC": "ATC",
    "KAS": "KAS",
}


def dist2(a, b):
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    return dx * dx + dy * dy


def simplify_ring(ring, tol=0.04):
    if len(ring) < 4:
        return ring
    pts = list(ring)
    if pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < 3:
        return ring
    tol2 = tol * tol
    keep = [pts[0]]
    last = pts[0]
    for p in pts[1:]:
        if dist2(p, last) >= tol2:
            keep.append(p)
            last = p
    if keep[0] != keep[-1]:
        keep.append(keep[0])
    return keep if len(keep) >= 4 else list(ring)


def iter_polys(geom):
    t = geom["type"]
    coords = geom["coordinates"]
    if t == "Polygon":
        yield coords
    elif t == "MultiPolygon":
        for poly in coords:
            yield poly


def lonlat_to_xy(lon, lat):
    x = (lon + 180.0) / 360.0 * COLS
    y = (90.0 - lat) / 180.0 * ROWS
    return x, y


def fill_poly(land, country, cid, rings):
    if not rings:
        return
    for hole, ring in enumerate(rings):
        value_land = 0 if hole else 1
        value_cid = -1 if hole else cid
        pts = [lonlat_to_xy(lon, lat) for lon, lat in ring]
        if len(pts) < 3:
            continue
        ys = [p[1] for p in pts]
        y0 = max(0, int(math.floor(min(ys))))
        y1 = min(ROWS - 1, int(math.ceil(max(ys))))
        for y in range(y0, y1 + 1):
            xs = []
            for i in range(len(pts) - 1):
                x1, y1_ = pts[i]
                x2, y2_ = pts[i + 1]
                if (y1_ > y) != (y2_ > y):
                    xs.append(x1 + (y - y1_) * (x2 - x1) / ((y2_ - y1_) or 1e-15))
            xs.sort()
            for k in range(0, len(xs) - 1, 2):
                xa = max(0, int(math.floor(xs[k])))
                xb = min(COLS - 1, int(math.ceil(xs[k + 1])))
                base = y * COLS
                for x in range(xa, xb + 1):
                    i = base + x
                    if value_land:
                        land[i] = 1
                        country[i] = value_cid
                    else:
                        land[i] = 0
                        country[i] = -1


def mark_borders(country):
    border = bytearray(COLS * ROWS)
    for y in range(ROWS):
        row = y * COLS
        for x in range(COLS):
            i = row + x
            c = country[i]
            if c < 0:
                continue
            if x + 1 < COLS:
                r = country[i + 1]
                if r >= 0 and r != c:
                    border[i] = 1
            if y + 1 < ROWS:
                r = country[i + COLS]
                if r >= 0 and r != c:
                    border[i] = 1
    return border


def rle_u8(data: bytes | bytearray):
    """Run-length encode bytes as [value, count_lo, count_hi] * n (count 1..65535)."""
    out = []
    i = 0
    n = len(data)
    while i < n:
        v = data[i]
        j = i + 1
        while j < n and data[j] == v and (j - i) < 65535:
            j += 1
        c = j - i
        out.append(v)
        out.append(c & 255)
        out.append((c >> 8) & 255)
        i = j
    return out


def rle_i16(data):
    """RLE for int16 values as JSON list of [value, count]."""
    out = []
    i = 0
    n = len(data)
    while i < n:
        v = data[i]
        j = i + 1
        while j < n and data[j] == v and (j - i) < 1_000_000:
            j += 1
        out.append(v)
        out.append(j - i)
        i = j
    return out


def main():
    gj = json.loads(SRC.read_text(encoding="utf-8"))
    features = gj["features"]
    meta = []
    land = bytearray(COLS * ROWS)
    country = [-1] * (COLS * ROWS)
    strokes = []

    for cid, ft in enumerate(features):
        pr = ft["properties"]
        name = pr.get("NAME") or pr.get("ADMIN") or f"Country {cid}"
        iso2 = pr.get("ISO_A2") or ""
        adm0 = pr.get("ADM0_A3") or ""
        iso3 = pr.get("ISO_A3") or adm0 or ""
        if iso2 in ("-99", "", None) or len(str(iso2)) != 2:
            if iso2 == "CN-TW":
                iso2 = "TW"
            else:
                iso2 = A3_TO_A2.get(adm0) or A3_TO_A2.get(iso3) or (adm0[:2] if adm0 else f"X{cid}")
        if iso3 in ("-99", "", None):
            iso3 = adm0 or iso2
        continent = pr.get("CONTINENT") or ""
        meta.append({"name": name, "iso": iso2, "iso3": iso3, "continent": continent})

        geom = ft["geometry"]
        outers = []
        if geom:
            for rings in iter_polys(geom):
                simp = [simplify_ring(r, tol=0.04) for r in rings]
                simp = [r for r in simp if len(r) >= 4]
                if not simp:
                    continue
                fill_poly(land, country, cid, simp)
                # outer ring only for HD stroke render; thin coords
                outer = [[round(lon, 2), round(lat, 2)] for lon, lat in simp[0]]
                outers.append(outer)
        strokes.append(outers)

    border = mark_borders(country)
    print(f"countries={len(meta)} land={sum(land)} borders={sum(border)}")

    land_rle = rle_u8(land)
    border_rle = rle_u8(border)
    country_rle = rle_i16(country)

    # strokes as compact JSON
    strokes_json = json.dumps(strokes, separators=(",", ":"))

    js = []
    js.append("/* Auto-generated HD world — Natural Earth 50m countries. */")
    js.append(f"const MAP_COLS = {COLS};")
    js.append(f"const MAP_ROWS = {ROWS};")
    js.append(f"const WORLD_META = {json.dumps(meta, ensure_ascii=False)};")
    js.append(f"const LAND_RLE = {json.dumps(land_rle, separators=(',', ':'))};")
    js.append(f"const BORDER_RLE = {json.dumps(border_rle, separators=(',', ':'))};")
    js.append(f"const COUNTRY_RLE = {json.dumps(country_rle, separators=(',', ':'))};")
    js.append(f"const WORLD_STROKES = {strokes_json};")
    js.append(
        """
function decodeRleU8(rle, size) {
  const out = new Uint8Array(size);
  let p = 0;
  for (let i = 0; i < rle.length; i += 3) {
    const v = rle[i];
    const c = rle[i + 1] | (rle[i + 2] << 8);
    out.fill(v, p, p + c);
    p += c;
  }
  return out;
}
function decodeRleI16(rle, size) {
  const out = new Int16Array(size);
  let p = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const v = rle[i];
    const c = rle[i + 1];
    out.fill(v, p, p + c);
    p += c;
  }
  return out;
}
const LAND = decodeRleU8(LAND_RLE, MAP_COLS * MAP_ROWS);
const COUNTRY_BORDER = decodeRleU8(BORDER_RLE, MAP_COLS * MAP_ROWS);
const COUNTRY_IDX = decodeRleI16(COUNTRY_RLE, MAP_COLS * MAP_ROWS);

function idx(x, y) { return y * MAP_COLS + x; }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < MAP_COLS && y < MAP_ROWS; }
function isLand(x, y) { return inBounds(x, y) && LAND[idx(x, y)] === 1; }
function neighbors4(x, y) {
  return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
}
function neighbors8(x, y) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) out.push([x + dx, y + dy]);
    }
  }
  return out;
}
function countryMetaAt(x, y) {
  if (!inBounds(x, y)) return null;
  const c = COUNTRY_IDX[idx(x, y)];
  return c >= 0 ? WORLD_META[c] : null;
}
function lonLatToCell(lon, lat) {
  const x = Math.floor(((lon + 180) / 360) * MAP_COLS);
  const y = Math.floor(((90 - lat) / 180) * MAP_ROWS);
  return { x, y };
}
function cellToLonLat(x, y) {
  return {
    lon: (x / MAP_COLS) * 360 - 180,
    lat: 90 - (y / MAP_ROWS) * 180,
  };
}
"""
    )
    OUT.write_text("\n".join(js), encoding="utf-8")
    print("wrote", OUT, "MB", round(OUT.stat().st_size / 1e6, 2))


if __name__ == "__main__":
    main()
