/* Minimal front-end bootstrap for the landing page + initial canvas scaffolding.
   Next iterations will implement full infinite whiteboard features.
*/

const yearEl = document.getElementById('year');
yearEl && (yearEl.textContent = new Date().getFullYear());

// Theme
const themeToggle = document.getElementById('themeToggle');
const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
const stored = localStorage.getItem('theme');
if (stored) document.documentElement.setAttribute('data-theme', stored);
else if (prefersLight) document.documentElement.setAttribute('data-theme', 'light');

themeToggle && themeToggle.addEventListener('click', () => {
  const curr = document.documentElement.getAttribute('data-theme');
  const next = curr === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

// Scroll open whiteboard
const openWhiteboard = document.getElementById('openWhiteboard');
openWhiteboard && openWhiteboard.addEventListener('click', () => {
  document.getElementById('whiteboard').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Canvas scaffolding: zoom/pan placeholders, drawing a simple stroke with mouse/touch
const canvas = document.getElementById('board');
const frame = document.getElementById('canvasFrame');
if (canvas && frame) {
  const ctx = canvas.getContext('2d');
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  const state = {
    tool: 'select',
    ruler: {
      isDragging: false,
      visible: false,
      worldStart: { x: 80, y: 120 },
      worldEnd: { x: 80 + 20 * 37.795, y: 120 },
      lengthCm: 20,
      pxPerCm: 37.795,
      width: 54
    },
    strokeColor: document.getElementById('strokeColor')?.value || '#3B82F6',
    strokeWidth: Number(document.getElementById('strokeWidth')?.value || 3),
    strokeOpacity: Number(document.getElementById('strokeOpacity')?.value || 1),
    cornerRadius: Number(document.getElementById('cornerRadius')?.value || 12),
    shadowMode: document.getElementById('shadowMode')?.value || 'none',

    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    lastX: 0,
    lastY: 0,

    drawing: false,
    lastPt: null,
    currentShape: null,

    // history
    pages: [],
    activePageIndex: 0,
    strokes: [],
    attachments: [],
    selectedAttachment: null,
    dragAttachment: null,
    editingDoc: false,
    redoStack: []
  };

  const zoomVal = document.getElementById('zoomVal');
  const toolVal = document.getElementById('toolVal');
  const pageStatus = document.getElementById('pageStatus');
  const pageButtons = {
    prev: document.getElementById('prevPageBtn'),
    next: document.getElementById('nextPageBtn'),
    add: document.getElementById('addPageBtn'),
    delete: document.getElementById('deletePageBtn'),
    up: document.getElementById('movePageUpBtn'),
    down: document.getElementById('movePageDownBtn')
  };

  const isSmallScreen = window.matchMedia && window.matchMedia('(max-width: 700px)').matches;
  state.pages = [createPage({
    view: {
      zoom: isSmallScreen ? 0.82 : 1,
      panX: isSmallScreen ? 18 : 0,
      panY: isSmallScreen ? 18 : 0
    }
  })];
  bindActivePage(0);

  function createPage(seed = {}) {
    return {
      id: seed.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
      strokes: Array.isArray(seed.strokes) ? seed.strokes : [],
      attachments: Array.isArray(seed.attachments) ? seed.attachments : [],
      redoStack: Array.isArray(seed.redoStack) ? seed.redoStack : [],
      view: {
        zoom: seed.view?.zoom || 1,
        panX: seed.view?.panX || 0,
        panY: seed.view?.panY || 0
      }
    };
  }

  function saveActivePage() {
    const page = state.pages[state.activePageIndex];
    if (!page) return;

    page.strokes = state.strokes;
    page.attachments = state.attachments;
    page.redoStack = state.redoStack;
    page.view = {
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY
    };
  }

  function bindActivePage(index) {
    state.activePageIndex = Math.max(0, Math.min(index, state.pages.length - 1));
    const page = state.pages[state.activePageIndex];

    state.strokes = page.strokes;
    state.attachments = page.attachments;
    state.redoStack = page.redoStack;
    state.zoom = page.view.zoom;
    state.panX = page.view.panX;
    state.panY = page.view.panY;
    state.selectedAttachment = null;
    state.dragAttachment = null;
    state.drawing = false;
    state.currentStroke = null;
    state.currentShape = null;
  }

  function updatePageStatus() {
    if (pageStatus) {
      pageStatus.textContent = `صفحة ${state.activePageIndex + 1} من ${state.pages.length}`;
    }

    if (pageButtons.prev) pageButtons.prev.disabled = state.activePageIndex === 0;
    if (pageButtons.next) pageButtons.next.disabled = state.activePageIndex === state.pages.length - 1;
    if (pageButtons.delete) pageButtons.delete.disabled = state.pages.length === 1;
    if (pageButtons.up) pageButtons.up.disabled = state.activePageIndex === 0;
    if (pageButtons.down) pageButtons.down.disabled = state.activePageIndex === state.pages.length - 1;
  }

  function switchPage(index) {
    saveActivePage();
    bindActivePage(index);
    render();
  }

  function resize() {
    const r = frame.getBoundingClientRect();
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(r.width * dpr);
    canvas.height = Math.floor(r.height * dpr);
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function worldToScreen(x, y) {
    return { x: x * state.zoom + state.panX, y: y * state.zoom + state.panY };
  }
  function screenToWorld(x, y) {
    return { x: (x - state.panX) / state.zoom, y: (y - state.panY) / state.zoom };
  } 

  function ellipsePath(cx, cy, rx, ry, start = 0, end = Math.PI * 2, steps = 48) {
    const pts = [];
    const span = end - start;
    for (let i = 0; i <= steps; i++) {
      const t = start + (span * i) / steps;
      pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
    }
    return pts;
  }

  function buildAdvancedShapePaths(tool, a, b) {
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    const width = Math.max(2, right - left);
    const height = Math.max(2, bottom - top);
    const cx = left + width / 2;
    const cy = top + height / 2;
    const rx = width / 2;
    const ry = height / 2;
    const paths = [];

    if (tool === 'shape_cube') {
      const depth = Math.min(width, height) * 0.28;
      const x1 = left;
      const y1 = top + depth;
      const x2 = right - depth;
      const y2 = bottom;
      const x3 = left + depth;
      const y3 = top;
      const x4 = right;
      const y4 = bottom - depth;

      paths.push([
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
        { x: x1, y: y1 }
      ]);
      paths.push([
        { x: x3, y: y3 },
        { x: x4, y: y3 },
        { x: x4, y: y4 },
        { x: x2, y: y2 }
      ]);
      paths.push([{ x: x1, y: y1 }, { x: x3, y: y3 }]);
      paths.push([{ x: x2, y: y1 }, { x: x4, y: y3 }]);
      paths.push([{ x: x2, y: y2 }, { x: x4, y: y4 }]);
      return paths;
    }

    if (tool === 'shape_cylinder') {
      const capRy = Math.max(8, Math.min(height * 0.16, 34));
      paths.push(ellipsePath(cx, top + capRy, rx, capRy, 0, Math.PI * 2, 56));
      paths.push([{ x: left, y: top + capRy }, { x: left, y: bottom - capRy }]);
      paths.push([{ x: right, y: top + capRy }, { x: right, y: bottom - capRy }]);
      paths.push(ellipsePath(cx, bottom - capRy, rx, capRy, 0, Math.PI, 34));
      paths.push(ellipsePath(cx, bottom - capRy, rx, capRy, Math.PI, Math.PI * 2, 34));
      return paths;
    }

    if (tool === 'shape_cone') {
      const capRy = Math.max(8, Math.min(height * 0.16, 34));
      const apex = { x: cx, y: top };
      paths.push([apex, { x: left, y: bottom - capRy }]);
      paths.push([apex, { x: right, y: bottom - capRy }]);
      paths.push(ellipsePath(cx, bottom - capRy, rx, capRy, 0, Math.PI, 34));
      paths.push(ellipsePath(cx, bottom - capRy, rx, capRy, Math.PI, Math.PI * 2, 34));
      return paths;
    }

    if (tool === 'shape_sphere') {
      paths.push(ellipsePath(cx, cy, rx, ry, 0, Math.PI * 2, 64));
      paths.push(ellipsePath(cx, cy, rx, ry * 0.30, 0, Math.PI * 2, 54));
      paths.push(ellipsePath(cx, cy, rx * 0.36, ry, 0, Math.PI * 2, 54));
      return paths;
    }

    if (tool === 'shape_arc' || tool === 'shape_sector') {
      const startAng = -Math.PI * 0.82;
      const endAng = Math.PI * 0.12;
      const arc = ellipsePath(cx, cy, rx, ry, startAng, endAng, 56);
      if (tool === 'shape_sector') {
        paths.push([{ x: cx, y: cy }, ...arc, { x: cx, y: cy }]);
      } else {
        paths.push(arc);
      }
      return paths;
    }

    return paths;
  }

  function drawShapePaths(ctx2, paths) {
    for (const path of paths) {
      if (!path || path.length < 2) continue;
      ctx2.beginPath();
      ctx2.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx2.lineTo(path[i].x, path[i].y);
      ctx2.stroke();
    }
  }

  function hitTestAttachment(worldPt) {
  for (let i = state.attachments.length - 1; i >= 0; i--) {
    const item = state.attachments[i];
    const width = item.width || 820;
    const height = item.height || 520;

    if (
      worldPt.x >= item.x &&
      worldPt.x <= item.x + width &&
      worldPt.y >= item.y &&
      worldPt.y <= item.y + height
    ) {
      return { item, index: i };
    }
  }

  return null;
}
  function ensureAttachmentLayer() {
  let layer = frame.querySelector('.attachment-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'attachment-layer';
    frame.insertBefore(layer, canvas);
  }
  return layer;
}

function renderAttachments() {
  const layer = ensureAttachmentLayer();
  layer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  layer.innerHTML = '';

  for (const item of state.attachments) {
    const wrap = document.createElement('div');
    wrap.className = 'board-attachment';
    if (item.id === state.selectedAttachment) wrap.classList.add('selected');
wrap.dataset.attachmentId = item.id;
    wrap.style.left = item.x + 'px';
    wrap.style.top = item.y + 'px';

    if (item.type === 'image') {
      const img = document.createElement('img');
      img.src = item.src;
      img.style.width = item.width + 'px';
      wrap.appendChild(img);
    }

    if (item.type === 'docx') {
      wrap.classList.add('doc-attachment');
      wrap.style.width = item.width + 'px';
      wrap.innerHTML = item.html;
    }

    layer.appendChild(wrap);
  }
}
  function snapToRulerEdge(worldPt) {
  const r = state.ruler;
  if (!r || !r.visible) return worldPt;

  const ax = r.worldStart.x;
  const ay = r.worldStart.y;
  const bx = r.worldEnd.x;
  const by = r.worldEnd.y;

  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const px = worldPt.x - ax;
  const py = worldPt.y - ay;

  const along = px * ux + py * uy;
  const side = px * nx + py * ny;
  const half = r.width / 2;
  const snapDistance = 18 / state.zoom;

  if (along < 0 || along > len) return worldPt;
  if (Math.abs(Math.abs(side) - half) > snapDistance && Math.abs(side) > half + snapDistance) {
    return worldPt;
  }

  const edge = side < 0 ? -half : half;

  return {
    x: ax + ux * along + nx * edge,
    y: ay + uy * along + ny * edge
  };
}

  function drawGrid() {
    const w = frame.clientWidth;
    const h = frame.clientHeight;

    const base = 42;
    const step = Math.max(18, Math.min(70, base * state.zoom));

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(96,165,250,.35)';
    ctx.lineWidth = 1;

    const tl = screenToWorld(0, 0);
    const br = screenToWorld(w, h);

    const startX = Math.floor(tl.x / (step / state.zoom)) * (step / state.zoom);
    const startY = Math.floor(tl.y / (step / state.zoom)) * (step / state.zoom);

    for (let x = startX; x < br.x; x += step / state.zoom) {
      const p = worldToScreen(x, 0);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, h);
      ctx.stroke();
    }
    for (let y = startY; y < br.y; y += step / state.zoom) {
      const p = worldToScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(w, p.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function roundRect(ctx2, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx2.beginPath();
    ctx2.moveTo(x + rr, y);
    ctx2.arcTo(x + w, y, x + w, y + h, rr);
    ctx2.arcTo(x + w, y + h, x, y + h, rr);
    ctx2.arcTo(x, y + h, x, y, rr);
    ctx2.arcTo(x, y, x + w, y, rr);
    ctx2.closePath();
  }

  function render() {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawGrid();
    renderAttachments();
    // Draw ruler if active
    // Draw 20 cm ruler
if (state.ruler && state.ruler.visible) {
  const r = state.ruler;
  const a = r.worldStart;
  const b = r.worldEnd;
  const A = worldToScreen(a.x, a.y);
  const B = worldToScreen(b.x, b.y);

  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const rulerW = r.width * state.zoom;
  const half = rulerW / 2;

  ctx.save();
  ctx.globalAlpha = 0.92;

  ctx.beginPath();
  ctx.moveTo(A.x + nx * half, A.y + ny * half);
  ctx.lineTo(B.x + nx * half, B.y + ny * half);
  ctx.lineTo(B.x - nx * half, B.y - ny * half);
  ctx.lineTo(A.x - nx * half, A.y - ny * half);
  ctx.closePath();
  ctx.fillStyle = 'rgba(245, 220, 130, .72)';
  ctx.strokeStyle = 'rgba(80, 60, 20, .75)';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  const totalMm = r.lengthCm * 10;
  for (let mm = 0; mm <= totalMm; mm++) {
    const t = mm / totalMm;
    const x = A.x + dx * t;
    const y = A.y + dy * t;

    let tick = rulerW * 0.22;
    if (mm % 10 === 0) tick = rulerW * 0.75;
    else if (mm % 5 === 0) tick = rulerW * 0.48;

    ctx.beginPath();
    ctx.moveTo(x - nx * half, y - ny * half);
    ctx.lineTo(x - nx * (half - tick), y - ny * (half - tick));
    ctx.stroke();

    if (mm % 10 === 0) {
      ctx.save();
      ctx.translate(x - nx * (half - tick - 12), y - ny * (half - tick - 12));
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = 'rgba(30,25,15,.9)';
      ctx.font = '800 11px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(mm / 10), 0, 4);
      ctx.restore();
    }
  }

  ctx.restore();

  const rulerVal = document.getElementById('rulerVal');
  if (rulerVal) rulerVal.textContent = 'Ruler: 20 cm';
}

    // Preview shape during drawing
    if (state.drawing && state.currentShape) {
      const sh = state.currentShape;
      const a = sh.start;
      const b = sh.end;

      const color = state.strokeColor;
      const width = state.strokeWidth;
      const opacity = state.tool === 'highlighter' ? 0.35 : state.strokeOpacity;

      ctx.save();
      ctx.translate(state.panX, state.panY);
      ctx.scale(state.zoom, state.zoom);
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Helper functions for drawing shapes
      function drawEllipseRect(x1, y1, x2, y2) {
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      function polygonPoints(cx, cy, rx, ry, sides, rotate = -Math.PI / 2) {
        const pts = [];
        for (let i = 0; i < sides; i++) {
          const t = rotate + (i * Math.PI * 2) / sides;
          pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
        }
        return pts;
      }

      function drawPolylinePts(pts, closed = false) {
        if (!pts.length) return;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (closed) ctx.closePath();
        ctx.stroke();
      }

      function drawArrowLine(A, B, headSize) {
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();

        const ang = Math.atan2(B.y - A.y, B.x - A.x);
        const hs = headSize;
        const p1 = { x: B.x - Math.cos(ang - Math.PI / 6) * hs, y: B.y - Math.sin(ang - Math.PI / 6) * hs };
        const p2 = { x: B.x - Math.cos(ang + Math.PI / 6) * hs, y: B.y - Math.sin(ang + Math.PI / 6) * hs };

        ctx.beginPath();
        ctx.moveTo(B.x, B.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.fill();
        ctx.globalAlpha = opacity;
      }

      // Draw the preview shape based on tool
      if (sh.tool === 'shape_circle') {
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (
        sh.tool === 'shape_line' ||
        sh.tool === 'shape_arrow' ||
        sh.tool === 'shape_double_arrow' ||
        sh.tool === 'shape_dashed_line' ||
        sh.tool === 'shape_curved_arrow' ||
        sh.tool === 'shape_connector'
      ) {
        const A = a;
        const B = b;
        const head = Math.max(6, Math.min(24, state.strokeWidth * 2.2));

        if (sh.tool === 'shape_dashed_line') ctx.setLineDash([10, 8]);
        else ctx.setLineDash([]);

        if (sh.tool === 'shape_line' || sh.tool === 'shape_dashed_line') {
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(B.x, B.y);
          ctx.stroke();
        } else if (sh.tool === 'shape_arrow') {
          drawArrowLine(A, B, head);
        } else if (sh.tool === 'shape_double_arrow') {
          drawArrowLine(A, B, head);
          drawArrowLine(B, A, head);
        } else if (sh.tool === 'shape_connector') {
          const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
          drawPolylinePts([{ x: A.x, y: A.y }, { x: mid.x, y: A.y }, { x: mid.x, y: B.y }, { x: B.x, y: B.y }], false);
        } else if (sh.tool === 'shape_curved_arrow') {
          const mx = (A.x + B.x) / 2;
          const my = (A.y + B.y) / 2;
          const nx = -(B.y - A.y);
          const ny = (B.x - A.x);
          const len = Math.hypot(nx, ny) || 1;
          const off = 0.25 * Math.min(200, Math.hypot(B.x - A.x, B.y - A.y));
          const cx = mx + (nx / len) * off;
          const cy = my + (ny / len) * off;

          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.quadraticCurveTo(cx, cy, B.x, B.y);
          ctx.stroke();

          drawArrowLine(A, B, head);
        }
      } else if (sh.tool === 'shape_rectangle' || sh.tool === 'shape_rounded_rectangle') {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const ww = Math.abs(b.x - a.x);
        const hh = Math.abs(b.y - a.y);
        if (sh.tool === 'shape_rounded_rectangle') {
          const rr = Math.min(state.cornerRadius / state.zoom, ww / 2, hh / 2);
          ctx.beginPath();
          ctx.moveTo(x + rr, y);
          ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
          ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
          ctx.arcTo(x, y + hh, x, y, rr);
          ctx.arcTo(x, y, x + ww, y, rr);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.strokeRect(x, y, ww, hh);
        }
      } else if (sh.tool === 'shape_ellipse') {
        drawEllipseRect(a.x, a.y, b.x, b.y);
      } else if (sh.tool === 'shape_triangle') {
        const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
        const top = Math.min(a.y, b.y), bot = Math.max(a.y, b.y);
        const pts = [
          { x: (left + right) / 2, y: top },
          { x: left, y: bot },
          { x: right, y: bot }
        ];
        drawPolylinePts([...pts, pts[0]], true);
      } else if (
        sh.tool === 'shape_diamond' ||
        sh.tool === 'shape_polygon' ||
        sh.tool === 'shape_star' ||
        sh.tool === 'shape_hexagon' ||
        sh.tool === 'shape_pentagon'
      ) {
        const left = Math.min(a.x, b.x);
        const right = Math.max(a.x, b.x);
        const top = Math.min(a.y, b.y);
        const bot = Math.max(a.y, b.y);
        const cx = (left + right) / 2;
        const cy = (top + bot) / 2;
        const rx = Math.abs(right - left) / 2;
        const ry = Math.abs(bot - top) / 2;

        if (sh.tool === 'shape_diamond') {
          const pts = [
            { x: cx, y: top },
            { x: right, y: cy },
            { x: cx, y: bot },
            { x: left, y: cy },
            { x: cx, y: top }
          ];
          drawPolylinePts(pts, true);
        } else if (sh.tool === 'shape_hexagon') {
          drawPolylinePts(polygonPoints(cx, cy, rx, ry, 6), true);
        } else if (sh.tool === 'shape_pentagon') {
          drawPolylinePts(polygonPoints(cx, cy, rx, ry, 5), true);
        } else if (sh.tool === 'shape_polygon') {
          drawPolylinePts(polygonPoints(cx, cy, rx, ry, 7), true);
        } else if (sh.tool === 'shape_star') {
          const outer = Math.min(rx, ry);
          const inner = outer * 0.48;
          const pts = [];
          const rotate = -Math.PI / 2;
          for (let i = 0; i < 10; i++) {
            const t = rotate + (i * Math.PI) / 5;
            const rr = i % 2 === 0 ? outer : inner;
            pts.push({ x: cx + Math.cos(t) * rr, y: cy + Math.sin(t) * rr });
          }
          drawPolylinePts(pts, true);
        }
      } else if (sh.tool === 'shape_arc' || sh.tool === 'shape_sector') {
        drawShapePaths(ctx, buildAdvancedShapePaths(sh.tool, a, b));
      } else if (
        sh.tool === 'shape_cube' ||
        sh.tool === 'shape_cylinder' ||
        sh.tool === 'shape_cone' ||
        sh.tool === 'shape_sphere'
      ) {
        drawShapePaths(ctx, buildAdvancedShapePaths(sh.tool, a, b));
      }

      ctx.restore();
    }

    // Draw committed strokes
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);

    const renderShapeLike = (s) => {
      const pts = s.points || [];
      ctx.save();
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (s.shadowMode && s.shadowMode !== 'none') {
        if (s.shadowMode === 'soft') {
          ctx.shadowColor = 'rgba(0,0,0,.35)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 6;
        } else {
          ctx.shadowColor = 'rgba(96,165,250,.55)';
          ctx.shadowBlur = 16;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }
      }

      const isVectorTool = (
        s.tool === 'shape_line' ||
        s.tool === 'shape_dashed_line' ||
        s.tool === 'shape_arrow' ||
        s.tool === 'shape_double_arrow' ||
        s.tool === 'shape_curved_arrow' ||
        s.tool === 'shape_connector' ||
        s.tool === 'shape_polyline' ||
        s.tool === 'shape_bezier' ||
        s.tool === 'shape_spline'
      );

      if (!isVectorTool) {
        ctx.restore();
        return;
      }

      if (pts.length >= 2) {
        if (s.tool === 'shape_dashed_line') ctx.setLineDash([10, 8]);
        else ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        if (s.tool === 'shape_arrow' || s.tool === 'shape_curved_arrow') {
          const A = pts[pts.length - 2];
          const B = pts[pts.length - 1];
          const ang = Math.atan2(B.y - A.y, B.x - A.x);
          const head = Math.max(6, Math.min(24, s.width * 2.2));
          const p1 = { x: B.x - Math.cos(ang - Math.PI / 6) * head, y: B.y - Math.sin(ang - Math.PI / 6) * head };
          const p2 = { x: B.x - Math.cos(ang + Math.PI / 6) * head, y: B.y - Math.sin(ang + Math.PI / 6) * head };
          ctx.beginPath();
          ctx.moveTo(B.x, B.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.closePath();
          ctx.fillStyle = s.color;
          ctx.globalAlpha = s.opacity;
          ctx.fill();
        }

        if (s.tool === 'shape_double_arrow') {
          // end->head and start->head
          const P0 = pts[0];
          const P1 = pts[1] || pts[0];
          // head at start
          {
            const A = pts[1] || pts[0];
            const B = pts[0];
            const ang = Math.atan2(B.y - A.y, B.x - A.x);
            const head = Math.max(6, Math.min(24, s.width * 2.2));
            const p1 = { x: B.x - Math.cos(ang - Math.PI / 6) * head, y: B.y - Math.sin(ang - Math.PI / 6) * head };
            const p2 = { x: B.x - Math.cos(ang + Math.PI / 6) * head, y: B.y - Math.sin(ang + Math.PI / 6) * head };
            ctx.beginPath();
            ctx.moveTo(B.x, B.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.closePath();
            ctx.fillStyle = s.color;
            ctx.fill();
          }
          // head at end
          {
            const A = pts[pts.length - 2];
            const B = pts[pts.length - 1];
            const ang = Math.atan2(B.y - A.y, B.x - A.x);
            const head = Math.max(6, Math.min(24, s.width * 2.2));
            const p1 = { x: B.x - Math.cos(ang - Math.PI / 6) * head, y: B.y - Math.sin(ang - Math.PI / 6) * head };
            const p2 = { x: B.x - Math.cos(ang + Math.PI / 6) * head, y: B.y - Math.sin(ang + Math.PI / 6) * head };
            ctx.beginPath();
            ctx.moveTo(B.x, B.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.closePath();
            ctx.fillStyle = s.color;
            ctx.fill();
          }
        }
      }

      ctx.restore();
    };

    // Render all strokes
    for (const s of state.strokes) {
      if (s.tool === 'text') {
        ctx.save();
        ctx.globalAlpha = s.opacity ?? 1;
        ctx.fillStyle = s.color || state.strokeColor;
        ctx.font = `${s.size || 28}px Arial, "Noto Sans Arabic", sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(s.text || '', s.x, s.y);
        ctx.restore();
        continue;
      }

      if (Array.isArray(s.paths)) {
        ctx.save();
        ctx.globalAlpha = s.opacity;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (s.shadowMode && s.shadowMode !== 'none') {
          if (s.shadowMode === 'soft') {
            ctx.shadowColor = 'rgba(0,0,0,.35)';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 6;
          } else {
            ctx.shadowColor = 'rgba(96,165,250,.55)';
            ctx.shadowBlur = 16;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
          }
        }

        drawShapePaths(ctx, s.paths);
        ctx.restore();
        continue;
      }

      if (s.tool && (
        s.tool === 'shape_line' ||
        s.tool === 'shape_dashed_line' ||
        s.tool === 'shape_arrow' ||
        s.tool === 'shape_double_arrow' ||
        s.tool === 'shape_curved_arrow' ||
        s.tool === 'shape_connector' ||
        s.tool === 'shape_polyline' ||
        s.tool === 'shape_bezier' ||
        s.tool === 'shape_spline'
      )) {
        renderShapeLike(s);
        continue;
      }

      // Freehand or fallback
      ctx.save();
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (s.shadowMode && s.shadowMode !== 'none') {
        if (s.shadowMode === 'soft') {
          ctx.shadowColor = 'rgba(0,0,0,.35)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 6;
        } else {
          ctx.shadowColor = 'rgba(96,165,250,.55)';
          ctx.shadowBlur = 16;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }
      }

      ctx.beginPath();
      for (let i = 0; i < s.points.length; i++) {
        const pt = s.points[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    if (zoomVal) zoomVal.textContent = `${Math.round(state.zoom * 100)}%`;
    if (toolVal) toolVal.textContent = state.tool;
    updatePageStatus();
  }

  function getCanvasPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left);
    const y = (evt.clientY - rect.top);
    return { x, y };
  }

  function startStroke(pt) {
    state.drawing = true;
    state.lastPt = pt;
    const baseOpacity = state.tool === 'highlighter' ? 0.35 : state.strokeOpacity;
    const opacity = Math.max(0.05, baseOpacity);

    state.currentStroke = {
      tool: state.tool,
      color: state.strokeColor,
      width: state.tool === 'highlighter' ? Math.max(6, state.strokeWidth * 1.6) : state.strokeWidth,
      opacity,
      shadowMode: state.shadowMode,
      points: [snapToRulerEdge(screenToWorld(pt.x, pt.y))]
    };
  }

  function extendStroke(pt) {
    if (!state.drawing || !state.currentStroke) return;

    state.currentStroke.points.push(snapToRulerEdge(screenToWorld(pt.x, pt.y)));
    state.lastPt = pt;

    // Draw current stroke dynamically
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);

    ctx.globalAlpha = state.currentStroke.opacity;
    ctx.strokeStyle = state.currentStroke.color;
    ctx.lineWidth = state.currentStroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (state.currentStroke.shadowMode && state.currentStroke.shadowMode !== 'none') {
      if (state.currentStroke.shadowMode === 'soft') {
        ctx.shadowColor = 'rgba(0,0,0,.35)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;
      } else {
        ctx.shadowColor = 'rgba(96,165,250,.55)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    }

    const lastPts = state.currentStroke.points;
    const a = lastPts[lastPts.length - 2];
    const b = lastPts[lastPts.length - 1];

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.restore();
  }

  function endStroke() {
    // Commit shape or freehand stroke
    if (state.drawing && state.currentShape) {
      const sh = state.currentShape;
      const a = sh.start;
      const b = sh.end;

      let committed = null;
      const color = state.strokeColor;
      const width = state.tool === 'highlighter' ? Math.max(6, state.strokeWidth * 1.6) : state.strokeWidth;
      const opacity = state.tool === 'highlighter' ? 0.35 : state.strokeOpacity;

      // Serialize shape based on tool
      if (sh.tool === 'shape_circle') {
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(16, Math.floor(40 * (r / 120 + 1)));
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          pts.push({ x: a.x + Math.cos(t) * r, y: a.y + Math.sin(t) * r });
        }
        committed = { tool: sh.tool, color, width, opacity, shadowMode: state.shadowMode, points: pts };
      } else if (sh.tool === 'shape_rectangle' || sh.tool === 'shape_rounded_rectangle') {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const ww = Math.abs(b.x - a.x);
        const hh = Math.abs(b.y - a.y);
        const pts = [
          { x, y },
          { x: x + ww, y },
          { x: x + ww, y: y + hh },
          { x, y: y + hh },
          { x, y }
        ];
        committed = { tool: sh.tool, color, width, opacity, shadowMode: state.shadowMode, points: pts };
      } else if (sh.tool === 'shape_ellipse') {
        const rx = Math.abs(b.x - a.x) / 2;
        const ry = Math.abs(b.y - a.y) / 2;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const steps = Math.max(16, Math.floor(40 * (rx / 120 + 1)));
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
        }
        committed = { tool: sh.tool, color, width, opacity, shadowMode: state.shadowMode, points: pts };
      } else if (sh.tool === 'shape_triangle') {
        const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
        const top = Math.min(a.y, b.y), bot = Math.max(a.y, b.y);
        const p1 = { x: (left + right) / 2, y: top };
        const p2 = { x: left, y: bot };
        const p3 = { x: right, y: bot };
        committed = { tool: sh.tool, color, width, opacity, shadowMode: state.shadowMode, points: [p1, p2, p3, p1] };
      } else if (
        sh.tool === 'shape_diamond' ||
        sh.tool === 'shape_polygon' ||
        sh.tool === 'shape_star' ||
        sh.tool === 'shape_hexagon' ||
        sh.tool === 'shape_pentagon'
      ) {
        const left = Math.min(a.x, b.x);
        const right = Math.max(a.x, b.x);
        const top = Math.min(a.y, b.y);
        const bot = Math.max(a.y, b.y);
        const cx = (left + right) / 2;
        const cy = (top + bot) / 2;
        const rx = Math.abs(right - left) / 2;
        const ry = Math.abs(bot - top) / 2;

        const polygonPoints = (sides, rotate = -Math.PI / 2) => {
          const pts = [];
          for (let i = 0; i < sides; i++) {
            const t = rotate + (i * Math.PI * 2) / sides;
            pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
          }
          return pts;
        };

        if (sh.tool === 'shape_diamond') {
          const pts = [
            { x: cx, y: top },
            { x: right, y: cy },
            { x: cx, y: bot },
            { x: left, y: cy },
            { x: cx, y: top }
          ];
          committed = { tool: sh.tool, color, width, opacity, shadowMode: state.shadowMode, points: pts };
        } else if (sh.tool === 'shape_hexagon') {
          const pts = polygonPoints(6);
          committed = { tool: sh.tool, color, width, opacity, shadowMode: state.shadowMode, points: [...pts, pts[0]] };
        } else if (sh.tool === 'shape_pentagon') {
          const pts = polygonPoints(5);
          committed = { tool: sh.tool, color, width, opacity, shadowMode: state.shadowMode, points: [...pts, pts[0]] };
        } else if (sh.tool === 'shape_polygon') {
          const pts = polygonPoints(7);
          committed = { tool: sh.tool, color, width, opacity, shadowMode: state.shadowMode, points: [...pts, pts[0]] };
        } else if (sh.tool === 'shape_star') {
          const outer = Math.min(rx, ry);
          const inner = outer * 0.48;
          const rotate = -Math.PI / 2;
          const pts = [];
          for (let i = 0; i < 10; i++) {
            const t = rotate + (i * Math.PI) / 5;
            const rr = i % 2 === 0 ? outer : inner;
            pts.push({ x: cx + Math.cos(t) * rr, y: cy + Math.sin(t) * rr });
          }
          committed = { tool: sh.tool, color, width, opacity, shadowMode: state.shadowMode, points: [...pts, pts[0]] };
        }
      } else if (
        sh.tool === 'shape_arc' ||
        sh.tool === 'shape_sector' ||
        sh.tool === 'shape_cube' ||
        sh.tool === 'shape_cylinder' ||
        sh.tool === 'shape_cone' ||
        sh.tool === 'shape_sphere'
      ) {
        const paths = buildAdvancedShapePaths(sh.tool, a, b);
        committed = { tool: sh.tool, color, width, opacity, shadowMode: state.shadowMode, paths };
      } else if (
        sh.tool === 'shape_line' ||
        sh.tool === 'shape_dashed_line' ||
        sh.tool === 'shape_arrow' ||
        sh.tool === 'shape_double_arrow' ||
        sh.tool === 'shape_curved_arrow' ||
        sh.tool === 'shape_connector' ||
        sh.tool === 'shape_polyline' ||
        sh.tool === 'shape_bezier' ||
        sh.tool === 'shape_spline'
      ) {
        let pts = [a, b];

        if (sh.tool === 'shape_connector') {
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          pts = [
            { x: a.x, y: a.y },
            { x: mid.x, y: a.y },
            { x: mid.x, y: b.y },
            { x: b.x, y: b.y }
          ];
        } else if (sh.tool === 'shape_polyline') {
          pts = [
            { x: a.x, y: a.y },
            { x: (a.x + b.x) / 2, y: a.y },
            { x: b.x, y: b.y }
          ];
        } else if (
          sh.tool === 'shape_curved_arrow' ||
          sh.tool === 'shape_bezier' ||
          sh.tool === 'shape_spline'
        ) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const nx = -(b.y - a.y);
          const ny = b.x - a.x;
          const len = Math.hypot(nx, ny) || 1;
          const off = 0.25 * Math.min(200, Math.hypot(b.x - a.x, b.y - a.y));
          const c = { x: mx + (nx / len) * off, y: my + (ny / len) * off };
          const samples = sh.tool === 'shape_spline' ? 36 : 28;

          pts = [];
          for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const mt = 1 - t;
            pts.push({
              x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
              y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y
            });
          }
        }

        committed = { tool: sh.tool, color, width, opacity, shadowMode: state.shadowMode, points: pts };
      }

      // Only add if shape has enough points
      if (
        committed &&
        (
          (committed.points && committed.points.length >= 2) ||
          (committed.paths && committed.paths.some(path => path.length >= 2))
        )
      ){
        state.strokes.push(committed);
        state.redoStack = [];
      }
    } else if (state.drawing && state.currentStroke) {
      if (state.currentStroke.points.length > 1) {
        // For freehand strokes
        state.strokes.push(state.currentStroke);
        state.redoStack = [];
      }
    }

    state.drawing = false;
    state.currentStroke = null;
    state.currentShape = null;
    state.lastPt = null;
    render();
  }

  function undo() {
    const s = state.strokes.pop();
    if (s) state.redoStack.push(s);
    render();
  }
  function redo() {
    const s = state.redoStack.pop();
    if (s) state.strokes.push(s);
    render();
  }

  function exportJSON() {
    saveActivePage();
    const payload = {
      version: 2,
      activePageIndex: state.activePageIndex,
      pages: state.pages.map((page) => ({
        id: page.id,
        strokes: page.strokes,
        attachments: page.attachments,
        view: page.view
      }))
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'whiteboard-project.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (obj && Array.isArray(obj.pages)) {
          state.pages = obj.pages.length ? obj.pages.map(createPage) : [createPage()];
          bindActivePage(obj.activePageIndex || 0);
          render();
        } else if (obj && Array.isArray(obj.strokes)) {
          state.pages = [createPage({
            strokes: obj.strokes,
            attachments: Array.isArray(obj.attachments) ? obj.attachments : [],
            view: obj.view || {}
          })];
          bindActivePage(0);
          render();
        }
      } catch (e) {
        alert('Import failed');
      }
    };
    reader.readAsText(file);
  }

  const calculatorInput = document.getElementById('calculatorInput');
  const calculatorResult = document.getElementById('calculatorResult');
  let calculatorLastResult = '';

  function evaluateCalculator() {
    const expr = (calculatorInput?.value || '').trim();
    if (!expr) {
      calculatorLastResult = '';
      if (calculatorResult) calculatorResult.textContent = 'الناتج: —';
      return null;
    }

    const normalized = expr
      .replace(/[×xX]/g, '*')
      .replace(/[÷]/g, '/')
      .replace(/,/g, '.');

    if (!/^[0-9+\-*/().%\s]+$/.test(normalized)) {
      if (calculatorResult) calculatorResult.textContent = 'الناتج: صيغة غير مدعومة';
      return null;
    }

    try {
      const value = Function(`"use strict"; return (${normalized});`)();
      if (!Number.isFinite(value)) throw new Error('Invalid result');
      calculatorLastResult = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(8)));
      if (calculatorResult) calculatorResult.textContent = `الناتج: ${calculatorLastResult}`;
      return calculatorLastResult;
    } catch (error) {
      calculatorLastResult = '';
      if (calculatorResult) calculatorResult.textContent = 'الناتج: خطأ في العملية';
      return null;
    }
  }

  function insertCalculatorResult() {
    const result = calculatorLastResult || evaluateCalculator();
    if (!result) return;

    const center = screenToWorld(frame.clientWidth / 2, frame.clientHeight / 2);
    state.strokes.push({
      tool: 'text',
      text: result,
      x: center.x,
      y: center.y,
      color: state.strokeColor,
      opacity: state.strokeOpacity,
      size: Math.max(22, state.strokeWidth * 8)
    });
    state.redoStack = [];
    render();
  }

  // Toolbar events
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextTool = btn.dataset.tool;
      state.tool = nextTool;
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      document.querySelectorAll('.sidebar-item[data-tool]').forEach(x => x.classList.remove('active'));
      const left = document.querySelector(`.sidebar-item[data-tool="${nextTool}"]`);
      left && left.classList.add('active');
      if (nextTool === 'calculator') {
        rightSidebar?.classList.remove('panel-closed');
        leftSidebar?.classList.add('panel-closed');
        calculatorInput?.focus();
      }
      render();
    });
  });

  // Left sidebar tool items
  document.querySelectorAll('.left-sidebar .sidebar-item[data-tool]').forEach(item => {
    item.addEventListener('click', () => {
      const nextTool = item.dataset.tool;
      state.tool = nextTool;
      document.querySelectorAll('.sidebar-item[data-tool]').forEach(x => x.classList.remove('active'));
      item.classList.add('active');

      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('is-active'));
      const top = document.querySelector(`.tool-btn[data-tool="${nextTool}"]`);
      top && top.classList.add('is-active');
      if (nextTool === 'calculator') {
        rightSidebar?.classList.remove('panel-closed');
        leftSidebar?.classList.add('panel-closed');
        calculatorInput?.focus();
      }
      render();
    });
  });

  // Buttons
  document.getElementById('undoBtn')?.addEventListener('click', undo);
  document.getElementById('redoBtn')?.addEventListener('click', redo);
  document.getElementById('exportBtn')?.addEventListener('click', exportJSON);
  document.getElementById('importBtn')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      if (input.files && input.files[0]) importJSON(input.files[0]);
    };
    input.click();
  });

  pageButtons.prev?.addEventListener('click', () => {
    if (state.activePageIndex > 0) switchPage(state.activePageIndex - 1);
  });

  pageButtons.next?.addEventListener('click', () => {
    if (state.activePageIndex < state.pages.length - 1) switchPage(state.activePageIndex + 1);
  });

  pageButtons.add?.addEventListener('click', () => {
    saveActivePage();
    state.pages.splice(state.activePageIndex + 1, 0, createPage());
    bindActivePage(state.activePageIndex + 1);
    render();
  });

  pageButtons.delete?.addEventListener('click', () => {
    if (state.pages.length === 1) return;
    state.pages.splice(state.activePageIndex, 1);
    bindActivePage(Math.min(state.activePageIndex, state.pages.length - 1));
    render();
  });

  pageButtons.up?.addEventListener('click', () => {
    if (state.activePageIndex === 0) return;
    saveActivePage();
    const page = state.pages.splice(state.activePageIndex, 1)[0];
    state.pages.splice(state.activePageIndex - 1, 0, page);
    bindActivePage(state.activePageIndex - 1);
    render();
  });

  pageButtons.down?.addEventListener('click', () => {
    if (state.activePageIndex >= state.pages.length - 1) return;
    saveActivePage();
    const page = state.pages.splice(state.activePageIndex, 1)[0];
    state.pages.splice(state.activePageIndex + 1, 0, page);
    bindActivePage(state.activePageIndex + 1);
    render();
  });

  document.getElementById('calculatorEvalBtn')?.addEventListener('click', evaluateCalculator);
  document.getElementById('calculatorInsertBtn')?.addEventListener('click', insertCalculatorResult);
  calculatorInput?.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') evaluateCalculator();
  });

  // Inspector bindings
  document.getElementById('strokeColor')?.addEventListener('input', (e) => { state.strokeColor = e.target.value; });
  document.getElementById('strokeWidth')?.addEventListener('input', (e) => { state.strokeWidth = Number(e.target.value); });
  document.getElementById('strokeOpacity')?.addEventListener('input', (e) => { state.strokeOpacity = Number(e.target.value); });
  document.getElementById('cornerRadius')?.addEventListener('input', (e) => { state.cornerRadius = Number(e.target.value); });
  document.getElementById('shadowMode')?.addEventListener('change', (e) => { state.shadowMode = e.target.value; });

  // Pan/zoom
  canvas.addEventListener('wheel', (evt) => {
    evt.preventDefault();
    const zoomFactor = Math.exp(-evt.deltaY / 500);
    const prevZoom = state.zoom;
    const nextZoom = Math.min(4, Math.max(0.25, prevZoom * zoomFactor));
    if (nextZoom === prevZoom) return;

    const rect = canvas.getBoundingClientRect();
    const sx = evt.clientX - rect.left;
    const sy = evt.clientY - rect.top;

    const worldBefore = screenToWorld(sx, sy);
    state.zoom = nextZoom;
    const worldAfter = screenToWorld(sx, sy);

    state.panX += (worldAfter.x - worldBefore.x) * state.zoom;
    state.panY += (worldAfter.y - worldBefore.y) * state.zoom;

    render();
  }, { passive: false });

  // Pointer events for drawing/panning
  canvas.addEventListener('pointerdown', (evt) => {
    canvas.setPointerCapture(evt.pointerId);
    const pt = getCanvasPoint(evt);

    const isMiddle = evt.button === 1;
    const shouldPan = isMiddle || (evt.altKey && state.tool === 'select');

    if (shouldPan) {
      state.isPanning = true;
      state.lastX = pt.x;
      state.lastY = pt.y;
      return;
    }

    if (state.tool === 'select') {
  const world = screenToWorld(pt.x, pt.y);
  const hit = hitTestAttachment(world);

  if (hit) {
    state.selectedAttachment = hit.item.id;
    state.dragAttachment = {
      id: hit.item.id,
      offsetX: world.x - hit.item.x,
      offsetY: world.y - hit.item.y
    };
    render();
  } else {
    state.selectedAttachment = null;
    render();
  }

  return;
}

    if (state.tool && state.tool.startsWith('shape_')) {
      state.drawing = true;
      const a = screenToWorld(pt.x, pt.y);
      state.currentShape = {
        tool: state.tool,
        start: a,
        end: a
      };
      render();
      return;
    }

    if (state.tool === 'calculator') {
      rightSidebar?.classList.remove('panel-closed');
      calculatorInput?.focus();
      return;
    }

    if (state.tool === 'ruler') {
  const start = screenToWorld(pt.x, pt.y);
  state.ruler.isDragging = true;
  state.ruler.visible = true;
  state.ruler.worldStart = start;
  state.ruler.worldEnd = {
    x: start.x + state.ruler.lengthCm * state.ruler.pxPerCm,
    y: start.y
  };
  render();
  return;
}

    if (state.tool === 'eraser') {
      state.drawing = true;
      state.lastPt = pt;
      state.currentStroke = {
        tool: 'eraser',
        width: state.strokeWidth * 2,
        points: [screenToWorld(pt.x, pt.y)]
      };
      return;
    }

    startStroke(pt);
  });

  canvas.addEventListener('pointermove', (evt) => {
    const pt = getCanvasPoint(evt);
    if (state.dragAttachment) {
  const world = screenToWorld(pt.x, pt.y);
  const item = state.attachments.find(a => a.id === state.dragAttachment.id);

  if (item) {
    item.x = world.x - state.dragAttachment.offsetX;
    item.y = world.y - state.dragAttachment.offsetY;
    render();
  }

  return;
}
    if (state.isPanning) {
      state.panX += pt.x - state.lastX;
      state.panY += pt.y - state.lastY;
      state.lastX = pt.x;
      state.lastY = pt.y;
      render();
      return;
    }

    if (state.tool === 'select') return;

    if (state.drawing && state.tool === 'eraser') {
      const eraserWorld = screenToWorld(pt.x, pt.y);
      const r = state.currentStroke.width / state.zoom;
      const r2 = r * r;

      state.strokes = state.strokes.filter(st => {
        for (const p of st.points) {
          const dx = p.x - eraserWorld.x;
          const dy = p.y - eraserWorld.y;
          if (dx * dx + dy * dy <= r2) return false;
        }
        return true;
      });

      render();
      return;
    }

    if (state.tool === 'ruler' && state.ruler.isDragging) {
  const ptWorld = screenToWorld(pt.x, pt.y);
  const a = state.ruler.worldStart;
  const angle = Math.atan2(ptWorld.y - a.y, ptWorld.x - a.x);
  const len = state.ruler.lengthCm * state.ruler.pxPerCm;

  state.ruler.worldEnd = {
    x: a.x + Math.cos(angle) * len,
    y: a.y + Math.sin(angle) * len
  };

  render();
  return;
}

    if (state.drawing && state.currentShape) {
      state.currentShape.end = screenToWorld(pt.x, pt.y);
      render();
      return;
    }

    if (state.drawing) {
      extendStroke(pt);
    }
  });

  function handlePointerUp() {
    if (state.dragAttachment) {
  state.dragAttachment = null;
  return;
}
    if (state.isPanning) {
      state.isPanning = false;
      return;
    }

    if (state.tool === 'ruler') {
      state.ruler.isDragging = false;
      render();
      return;
    }

    if (state.drawing) endStroke();
  }

  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerUp);
  const addFileBtn = document.getElementById('addFileBtn');
const boardFileInput = document.getElementById('boardFileInput');

addFileBtn?.addEventListener('click', () => {
  boardFileInput?.click();
});

boardFileInput?.addEventListener('change', async () => {
  const file = boardFileInput.files?.[0];
  if (!file) return;

  const start = screenToWorld(80, 80);

  if (file.type.startsWith('image/')) {
    const src = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    const img = new Image();
    img.onload = () => {
      const width = Math.min(900, img.naturalWidth);
      const height = width * (img.naturalHeight / img.naturalWidth);

      state.attachments.push({
        id: crypto.randomUUID(),
        type: 'image',
        src,
        x: start.x,
        y: start.y,
        width,
        height
});
      render();
    };
    img.src = src;
  } else if (file.name.toLowerCase().endsWith('.docx')) {
    if (!window.mammoth) {
      alert('Word support library is not loaded.');
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });

    state.attachments.push({
      id: crypto.randomUUID(),
      type: 'docx',
      html: result.value,
      x: start.x,
      y: start.y,
      width: 820,
      height: 520
});

    render();
  } else {
    alert('Please choose an image or .docx file.');
  }

  boardFileInput.value = '';
});
  window.addEventListener('resize', resize);
  resize();

const toggleLeft = document.getElementById('toggleLeft');
const toggleRight = document.getElementById('toggleRight');
const leftSidebar = document.querySelector('.left-sidebar');
const rightSidebar = document.querySelector('.right-sidebar');

toggleLeft?.addEventListener('click', () => {
  leftSidebar?.classList.toggle('panel-closed');
  rightSidebar?.classList.add('panel-closed');
});

toggleRight?.addEventListener('click', () => {
  rightSidebar?.classList.toggle('panel-closed');
  leftSidebar?.classList.add('panel-closed');
});
canvas.addEventListener('dblclick', (evt) => {
  const pt = getCanvasPoint(evt);
  const world = screenToWorld(pt.x, pt.y);
  const hit = hitTestAttachment(world);

  if (!hit || hit.item.type !== 'docx') return;

  state.selectedAttachment = hit.item.id;
  render();

  const layer = ensureAttachmentLayer();
  const el = layer.querySelector(`[data-attachment-id="${hit.item.id}"]`);
  if (!el) return;

  layer.classList.add('editing-doc');
  canvas.style.pointerEvents = 'none';

  el.contentEditable = 'true';
  el.focus();

  el.addEventListener('blur', () => {
    hit.item.html = el.innerHTML;
    el.contentEditable = 'false';
    layer.classList.remove('editing-doc');
    canvas.style.pointerEvents = '';
    render();
  }, { once: true });
});
async function captureBoard() {
  const frameEl = document.getElementById('canvasFrame');
  return await html2canvas(frameEl, {
    backgroundColor: null,
    scale: 2,
    useCORS: true
  });
}

function waitForPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

document.getElementById('exportPngBtn')?.addEventListener('click', async () => {
  const shot = await captureBoard();
  const a = document.createElement('a');
  a.href = shot.toDataURL('image/png');
  a.download = 'whiteboard.png';
  a.click();
});

document.getElementById('exportPdfBtn')?.addEventListener('click', async () => {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    alert('PDF support library is not loaded.');
    return;
  }

  saveActivePage();
  const originalPageIndex = state.activePageIndex;
  let pdf = null;

  for (let i = 0; i < state.pages.length; i++) {
    bindActivePage(i);
    render();
    await waitForPaint();

    const shot = await captureBoard();
    const img = shot.toDataURL('image/png');
    const orientation = shot.width > shot.height ? 'landscape' : 'portrait';

    if (!pdf) {
      pdf = new jsPDF({
        orientation,
        unit: 'px',
        format: [shot.width, shot.height]
      });
    } else {
      pdf.addPage([shot.width, shot.height], orientation);
    }

    pdf.addImage(img, 'PNG', 0, 0, shot.width, shot.height);
  }

  bindActivePage(originalPageIndex);
  render();

  pdf.save('whiteboard.pdf');
});
// fullscreen
document.getElementById('fullscreenBtn')?.addEventListener('click', () => {
  const el = document.getElementById('whiteboard');
  if (!document.fullscreenElement) {
    el.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
});

}





