/**
 * gridRef.js — FFG grid coordinate utilities.
 * Pure JS. No React. No DOM.
 */

// B-24: the canon atlas grid our planet data references spans columns A–V
// (22) × rows 1–21 (observed refs: C–V, 1–21).
var GRID_COLS = 22;
var GRID_ROWS = 21;

function parseGridRef(s) {
  var m = /^([A-Z])-(\d{1,2})$/.exec(String(s || '').trim().toUpperCase());
  if (!m) return null;
  return { col: m[1].charCodeAt(0) - 65, row: parseInt(m[2], 10) - 1 };
}

function deriveGridBounds(planets) {
  // B-24: anchor the frame to the planets' CANON grid_refs — a least-squares
  // fit of x on column center and y on row center. The old extent-derived
  // frame sat ~1.5 cells off canon (0/1962 planets exact; fitted: 95.4% exact,
  // 99.7% within one cell — the rest are per-planet data errors).
  var n = 0, sc = 0, sx = 0, scc = 0, scx = 0, sr = 0, sy = 0, srr = 0, sry = 0;
  planets.forEach(function (p) {
    if (p.x == null || p.y == null) return;
    var ref = parseGridRef(p.grid_ref);
    if (!ref) return;
    var c = ref.col + 0.5, r = ref.row + 0.5;
    n++;
    sc += c; sx += p.x; scc += c * c; scx += c * p.x;
    sr += r; sy += p.y; srr += r * r; sry += r * p.y;
  });

  if (n >= 2) {
    var cellW = (n * scx - sc * sx) / (n * scc - sc * sc);
    var slopeY = (n * sry - sr * sy) / (n * srr - sr * sr); // negative: y falls as rows grow
    var minX = (sx - cellW * sc) / n;
    var maxY = (sy - slopeY * sr) / n;
    var cellH = -slopeY;
    if (cellW > 0 && cellH > 0) {
      return {
        minX: minX, maxX: minX + GRID_COLS * cellW,
        minY: maxY - GRID_ROWS * cellH, maxY: maxY,
        cellW: cellW, cellH: cellH,
        cols: GRID_COLS, rows: GRID_ROWS
      };
    }
  }

  // Fallback (no usable grid_refs): the extent-derived frame.
  var minX2 = Infinity, maxX2 = -Infinity;
  var minY2 = Infinity, maxY2 = -Infinity;

  planets.forEach(function(p) {
    if (p.x != null && p.y != null) {
      if (p.x < minX2) minX2 = p.x;
      if (p.x > maxX2) maxX2 = p.x;
      if (p.y < minY2) minY2 = p.y;
      if (p.y > maxY2) maxY2 = p.y;
    }
  });

  var marginX = (maxX2 - minX2) * 0.05;
  var marginY = (maxY2 - minY2) * 0.05;

  return {
    minX: minX2 - marginX,
    maxX: maxX2 + marginX,
    minY: minY2 - marginY,
    maxY: maxY2 + marginY,
    cellW: (maxX2 - minX2 + marginX * 2) / GRID_COLS,
    cellH: (maxY2 - minY2 + marginY * 2) / GRID_ROWS,
    cols: GRID_COLS, rows: GRID_ROWS
  };
}

function coordToGridRef(x, y, bounds) {
  var cols = bounds.cols || GRID_COLS;
  var rows = bounds.rows || GRID_ROWS;
  var col = Math.floor((x - bounds.minX) / bounds.cellW);
  var row = Math.floor((bounds.maxY - y) / bounds.cellH);
  col = Math.max(0, Math.min(cols - 1, col));
  row = Math.max(0, Math.min(rows - 1, row));
  return String.fromCharCode(65 + col) + '-' + (row + 1);
}

if (typeof window !== 'undefined') {
  window.GmGridRef = { deriveGridBounds: deriveGridBounds, coordToGridRef: coordToGridRef, parseGridRef: parseGridRef };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { deriveGridBounds: deriveGridBounds, coordToGridRef: coordToGridRef, parseGridRef: parseGridRef };
}
