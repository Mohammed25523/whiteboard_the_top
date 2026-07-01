/* Minimal front-end bootstrap for the landing page + initial canvas scaffolding.
   Next iterations will implement full infinite whiteboard features
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

    audioDevices: [],
    selectedMicId: '',
    recording: false,
    mediaStream: null,
    mediaRecorder: null,
    audioChunks: [],
    audioBlob: null,
    audioUrl: null,
    recordingStart: null,

    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    lastX: 0,
    lastY: 0,

    drawing: false,
    lastPt: null,
    currentShape: null,
    backgroundMode: 'grid',
    showCalculatorWidget: false,

    // history
    pages: [],
    activePageIndex: 0,
    strokes: [],
    attachments: [],
    selectedAttachment: null,
    dragAttachment: null,
    resizingAttachment: null,
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
  const backgroundButtons = document.querySelectorAll('.bg-btn[data-bg]');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomResetBtn = document.getElementById('zoomResetBtn');

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
      backgroundMode: seed.backgroundMode || 'grid',
      ruler: seed.ruler ? {
        isDragging: false,
        visible: Boolean(seed.ruler.visible),
        worldStart: seed.ruler.worldStart || { x: 0, y: 0 },
        worldEnd: seed.ruler.worldEnd || { x: 0, y: 0 },
        lengthCm: seed.ruler.lengthCm || 20,
        pxPerCm: seed.ruler.pxPerCm || 37.795,
        width: seed.ruler.width || 54
      } : {
        isDragging: false,
        visible: false,
        worldStart: { x: 0, y: 0 },
        worldEnd: { x: 0, y: 0 },
        lengthCm: 20,
        pxPerCm: 37.795,
        width: 54
      },
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
    page.backgroundMode = state.backgroundMode;
    page.ruler = { ...state.ruler };
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
    state.backgroundMode = page.backgroundMode || 'grid';
    state.ruler = page.ruler ? { ...page.ruler, isDragging: false } : {
      isDragging: false,
      visible: false,
      worldStart: { x: 0, y: 0 },
      worldEnd: { x: 0, y: 0 },
      lengthCm: 20,
      pxPerCm: 37.795,
      width: 54
    };
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
    backgroundButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.bg === state.backgroundMode);
    });
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

  function setZoom(nextZoom, anchorX = frame.clientWidth / 2, anchorY = frame.clientHeight / 2) {
    const prevZoom = state.zoom;
    nextZoom = Math.min(4, Math.max(0.25, nextZoom));
    if (nextZoom === prevZoom) return;
    const worldBefore = screenToWorld(anchorX, anchorY);
    state.zoom = nextZoom;
    const worldAfter = screenToWorld(anchorX, anchorY);
    state.panX += (worldAfter.x - worldBefore.x) * state.zoom;
    state.panY += (worldAfter.y - worldBefore.y) * state.zoom;
    render();
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

  function drawCalculatorWidget(ctx2, x, y, width, height) {
    const radius = 18;
    ctx2.save();
    ctx2.fillStyle = 'rgba(20, 29, 52, 0.96)';
    ctx2.strokeStyle = 'rgba(96, 165, 250, 0.55)';
    ctx2.lineWidth = 2;
    ctx2.beginPath();
    ctx2.moveTo(x + radius, y);
    ctx2.lineTo(x + width - radius, y);
    ctx2.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx2.lineTo(x + width, y + height - radius);
    ctx2.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx2.lineTo(x + radius, y + height);
    ctx2.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx2.lineTo(x, y + radius);
    ctx2.quadraticCurveTo(x, y, x + radius, y);
    ctx2.closePath();
    ctx2.fill();
    ctx2.stroke();

    const screenHeight = Math.round(height * 0.24);
    ctx2.fillStyle = '#0f172a';
    ctx2.fillRect(x + 16, y + 16, width - 32, screenHeight);
    ctx2.strokeStyle = 'rgba(96, 165, 250, 0.35)';
    ctx2.strokeRect(x + 16, y + 16, width - 32, screenHeight);

    ctx2.fillStyle = '#f8fafc';
    ctx2.font = '500 20px Inter, Arial, sans-serif';
    ctx2.textAlign = 'right';
    ctx2.fillText(calculatorState || '0', x + width - 28, y + 16 + screenHeight - 18);

    const label = 'CASIO fx';
    ctx2.font = '700 14px Inter, Arial, sans-serif';
    ctx2.fillStyle = '#93c5fd';
    ctx2.fillText(label, x + width - 28, y + 26);

    const keys = [
      ['7', '8', '9', '÷'],
      ['4', '5', '6', '×'],
      ['1', '2', '3', '−'],
      ['0', '.', '=', '+']
    ];
    const keySize = Math.min(64, Math.floor((width - 48) / 4));
    const keyGap = 10;
    const startY = y + 32 + screenHeight;
    const startX = x + 16;

    ctx2.font = `${Math.max(18, Math.floor(keySize * 0.45))}px Inter, Arial, sans-serif`;
    for (let row = 0; row < keys.length; row++) {
      for (let col = 0; col < keys[row].length; col++) {
        const keyX = startX + col * (keySize + keyGap);
        const keyY = startY + row * (keySize + keyGap);
        ctx2.fillStyle = 'rgba(30, 41, 59, 0.94)';
        ctx2.fillRect(keyX, keyY, keySize, keySize);
        ctx2.strokeStyle = 'rgba(96, 165, 250, 0.14)';
        ctx2.strokeRect(keyX, keyY, keySize, keySize);
        ctx2.fillStyle = '#f8fafc';
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillText(keys[row][col], keyX + keySize / 2, keyY + keySize / 2);
      }
    }

    ctx2.restore();
  }

  function hitTestAttachment(worldPt) {
  for (let i = state.attachments.length - 1; i >= 0; i--) {
    const item = state.attachments[i];
    if (item.background) continue;
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
    if (item.background) continue;
    const wrap = document.createElement('div');
    wrap.className = 'board-attachment';
    if (item.id === state.selectedAttachment) wrap.classList.add('selected');
wrap.dataset.attachmentId = item.id;
    wrap.style.left = item.x + 'px';
    wrap.style.top = item.y + 'px';

    if (item.type === 'image') {
      wrap.style.width = item.width + 'px';
      wrap.style.height = item.height + 'px';
      if (item.background) {
        wrap.classList.add('background-attachment');
        wrap.style.zIndex = '0';
        wrap.style.pointerEvents = 'none';
      }
      const img = document.createElement('img');
      img.src = item.src;
      img.style.width = item.width + 'px';
      img.style.height = item.height + 'px';
      wrap.appendChild(img);
    }

    if (item.pinned) wrap.classList.add('pinned');

    if (item.type === 'docx') {
      wrap.classList.add('doc-attachment');
      wrap.style.width = item.width + 'px';
      wrap.innerHTML = item.html;
    }

    if (item.type === 'calculator') {
      wrap.classList.add('calculator-attachment');
      wrap.style.width = (item.width || 460) + 'px';
      wrap.style.height = (item.height || 360) + 'px';

      const card = document.createElement('div');
      card.className = 'calculator-attachment-card';

      const header = document.createElement('div');
      header.className = 'calculator-attachment-header';
      const title = document.createElement('div');
      title.textContent = 'CASIO fx-991ES PLUS C';
      const status = document.createElement('div');
      status.className = 'calculator-attachment-status';
      status.textContent = `Mode: ${calculatorAngleMode}`;
      header.appendChild(title);
      header.appendChild(status);
      card.appendChild(header);

      const screen = document.createElement('div');
      screen.className = 'calculator-attachment-screen';
      screen.textContent = item.expression ? item.expression : '...';
      card.appendChild(screen);

      const keyGrid = document.createElement('div');
      keyGrid.className = 'calculator-attachment-key-grid';
      const calculatorKeys = [
        ['MC','MR','M+','M-','STO(','RCL('],
        ['7','8','9','÷','sin(','cos('],
        ['4','5','6','×','tan(','ln('],
        ['1','2','3','−','log(','√('],
        ['0','.','=','+','^','('],
        [')','π','e','Ans','EXP','DEL']
      ];
      for (const row of calculatorKeys) {
        for (const label of row) {
          const keyEl = document.createElement('button');
          keyEl.type = 'button';
          keyEl.className = 'calculator-attachment-key-btn';
          if (['÷','×','−','+','^','=','DEL'].includes(label)) keyEl.classList.add('operator');
          if (['MC','MR','M+','M-','STO(','RCL(','Ans','EXP','DEL'].includes(label)) keyEl.classList.add('special');
          keyEl.textContent = label;
          keyEl.addEventListener('pointerdown', (evt) => {
            evt.stopPropagation();
          });
          keyEl.addEventListener('click', (evt) => {
            evt.stopPropagation();
            appendCalculatorAttachmentKey(item, label);
            if (label === '=' ) {
              evaluateCalculatorAttachment(item);
            }
            render();
          });
          keyGrid.appendChild(keyEl);
        }
      }
      card.appendChild(keyGrid);

      const footer = document.createElement('div');
      footer.className = 'calculator-attachment-keyrow';
      footer.textContent = `Result: ${item.result || '—'}`;
      card.appendChild(footer);

      wrap.appendChild(card);

      wrap.addEventListener('pointerdown', (evt) => {
        if (evt.target.closest('.calculator-attachment-key-btn')) return;
        evt.stopPropagation();
        if (state.tool !== 'select') return;
        const pt = getCanvasPoint(evt);
        const world = screenToWorld(pt.x, pt.y);
        state.selectedAttachment = item.id;
        if (!item.pinned) {
          state.dragAttachment = { id: item.id, offsetX: world.x - item.x, offsetY: world.y - item.y };
          try { evt.currentTarget.setPointerCapture(evt.pointerId); } catch (e) {}
        }
        render();
      });

      wrap.addEventListener('pointerup', (evt) => {
        try { evt.currentTarget.releasePointerCapture(evt.pointerId); } catch (e) {}
        if (state.dragAttachment && state.dragAttachment.id === item.id) state.dragAttachment = null;
      });
    }

    if (item.type === 'textbox') {
      wrap.classList.add('textbox-attachment');
      wrap.style.width = (item.width || 320) + 'px';
      wrap.style.height = item.folded ? '96px' : (item.height || 180) + 'px';

      // container box (cream background, right accent bar handled by CSS)
      const box = document.createElement('div');
      box.className = 'textbox-content' + (item.folded ? ' folded' : '');
      box.style.background = item.fillColor || '#FBF7EE';
      box.style.color = item.textColor || '#111827';
      box.style.borderRadius = (item.cornerRadius || 12) + 'px';
      box.style.fontSize = (item.fontSize || 18) + 'px';
      box.style.opacity = item.visible ? '1' : '0.5';
      box.style.boxShadow = `0 10px 30px ${item.shadowColor || 'rgba(0,0,0,.12)'}`;

      // header
      const header = document.createElement('div');
      header.className = 'textbox-header';
      const title = document.createElement('div');
      title.className = 'textbox-title';
      title.textContent = 'ملاحظة';
      const icon = document.createElement('div');
      icon.className = 'textbox-header-icon';
      icon.textContent = '📝';
      header.appendChild(title);
      header.appendChild(icon);
      box.appendChild(header);

      if (item.folded) {
        const summary = document.createElement('div');
        summary.className = 'textbox-folded-summary';
        const preview = item.text ? item.text.trim().split('\n')[0].slice(0, 80) : 'ملاحظة مخفية';
        summary.textContent = preview || 'ملاحظة مخفية';
        box.appendChild(summary);
      } else {
        const input = document.createElement('div');
        input.className = 'textbox-input';
        input.contentEditable = false;
        input.style.minHeight = '60px';
        if (item.text && item.text.trim()) {
          input.textContent = item.text;
        } else {
          const ph = document.createElement('div');
          ph.className = 'textbox-placeholder';
          ph.textContent = 'Write your note here...';
          input.appendChild(ph);
        }
        box.appendChild(input);
      }

      // bottom toolbar with seven square icons (right-to-left)
      const bottom = document.createElement('div');
      bottom.className = 'textbox-bottom-toolbar';
      const actions = [
        { icon: '🎨', action: 'palette', title: 'Fill color' },
        { icon: '✏️', action: 'edit', title: 'Edit note' },
        { icon: '🟦', action: 'attach', title: 'Attach file' },
        { icon: '📏', action: 'toggle-ruler', title: 'Toggle ruler' },
        { icon: '📌', action: 'toggle-pin', title: 'Pin/unpin' },
        { icon: '🗑️', action: 'delete', title: 'Delete textbox' },
        { icon: item.folded ? '📄' : '📄', action: 'toggle-fold', title: item.folded ? 'Unfold note' : 'Fold note' }
      ];
      for (const config of actions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'textbox-toolicon';
        b.textContent = config.icon;
        b.dataset.action = config.action;
        b.title = config.title;
        bottom.appendChild(b);
      }
      box.appendChild(bottom);

      // accent bar on right
      const accent = document.createElement('div');
      accent.className = 'textbox-accent';
      box.appendChild(accent);

      // image handling (if any)
      if (!item.folded && item.imageSrc && item.visible) {
        const img = document.createElement('img');
        img.src = item.imageSrc;
        img.style.maxWidth = '100%';
        img.style.marginTop = '8px';
        box.appendChild(img);
      }

      // hidden overlay
      if (!item.visible) {
        const hiddenOverlay = document.createElement('div');
        hiddenOverlay.className = 'textbox-hidden-overlay';
        hiddenOverlay.textContent = 'Hidden';
        box.appendChild(hiddenOverlay);
      }

      wrap.appendChild(box);

      // selection & drag (respect pinned state)
      wrap.addEventListener('pointerdown', (evt) => {
        evt.stopPropagation();
        if (state.tool !== 'select') return;
        // If the user clicked an interactive control inside the textbox, don't start a drag — just select.
        if (evt.target.closest('.textbox-toolicon, .textbox-bottom-toolbar, .textbox-accent, .textbox-resize-handle')) {
          state.selectedAttachment = item.id;
          updateTextboxInspector(item);
          render();
          return;
        }
        const pt = getCanvasPoint(evt);
        const world = screenToWorld(pt.x, pt.y);
        state.selectedAttachment = item.id;
        updateTextboxInspector(item);
        if (!item.pinned) {
          state.dragAttachment = { id: item.id, offsetX: world.x - item.x, offsetY: world.y - item.y };
          try { evt.currentTarget.setPointerCapture(evt.pointerId); } catch (e) {}
        }
        render();
      });

      // ensure pointerup on the attachment clears pointer capture and drag state
      wrap.addEventListener('pointerup', (evt) => {
        try { evt.currentTarget.releasePointerCapture(evt.pointerId); } catch (e) {}
        if (state.dragAttachment && state.dragAttachment.id === item.id) state.dragAttachment = null;
      });

      // double-click to edit
      wrap.addEventListener('dblclick', (evt) => {
        evt.stopPropagation();
        focusTextboxAttachment(item.id);
      });

      // resize handle
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'textbox-resize-handle';
      resizeHandle.addEventListener('pointerdown', (evt) => {
        evt.stopPropagation();
        if (item.pinned) return;
        state.resizingAttachment = { id: item.id, startClientX: evt.clientX, startClientY: evt.clientY, startW: item.width || 320, startH: item.height || 180 };
      });
      wrap.appendChild(resizeHandle);

      // (Removed inline three-dot options menu — options moved to inspector)

      // bottom toolbar action hooks (palette, pen/edit, file, ruler, pin)
      const bt = box.querySelector('.textbox-bottom-toolbar');
      if (bt) {
        const boardFileInput = document.getElementById('boardFileInput');
        const paletteBtn = bt.querySelector('[data-action="palette"]');
        const editBtn = bt.querySelector('[data-action="edit"]');
        const attachBtn = bt.querySelector('[data-action="attach"]');
        const rulerBtn = bt.querySelector('[data-action="toggle-ruler"]');
        const pinBtn = bt.querySelector('[data-action="toggle-pin"]');
        const deleteBtn = bt.querySelector('[data-action="delete"]');
        const foldBtn = bt.querySelector('[data-action="toggle-fold"]');

        if (paletteBtn) {
          paletteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = item.fillColor || '#FBF7EE';
            colorInput.style.visibility = 'hidden';
            document.body.appendChild(colorInput);
            colorInput.addEventListener('input', (ev) => {
              item.fillColor = ev.target.value;
              render();
              updateTextboxInspector(item);
              document.body.removeChild(colorInput);
            });
            colorInput.click();
          });
        }
        if (editBtn) {
          editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            focusTextboxAttachment(item.id);
          });
        }
        if (attachBtn) {
          attachBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (boardFileInput) boardFileInput.click();
          });
        }
        if (rulerBtn) {
          rulerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.ruler.visible = !state.ruler.visible;
            render();
          });
        }
        if (pinBtn) {
          pinBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            item.pinned = !item.pinned;
            if (item.pinned) wrap.classList.add('pinned'); else wrap.classList.remove('pinned');
            updateTextboxInspector(item);
            render();
          });
        }
        if (deleteBtn) {
          deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            state.attachments = state.attachments.filter((a) => a.id !== item.id);
            if (state.selectedAttachment === item.id) {
              state.selectedAttachment = null;
              updateTextboxInspector(null);
            }
            render();
          });
        }
        if (foldBtn) {
          foldBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            item.folded = !item.folded;
            if (!item.folded) item.visible = true;
            render();
            updateTextboxInspector(item);
          });
        }
      }
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

  function isPointNearRuler(worldPt) {
    const r = state.ruler;
    if (!r || !r.visible) return false;

    const ax = r.worldStart.x;
    const ay = r.worldStart.y;
    const bx = r.worldEnd.x;
    const by = r.worldEnd.y;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const threshold = (r.width / 2) + (14 / state.zoom);

    if (!len2) {
      return Math.hypot(worldPt.x - ax, worldPt.y - ay) <= threshold;
    }

    const t = Math.max(0, Math.min(1, ((worldPt.x - ax) * dx + (worldPt.y - ay) * dy) / len2));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const dist = Math.hypot(worldPt.x - projX, worldPt.y - projY);
    return dist <= threshold;
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

  function drawRuled() {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
    ctx.fillRect(0, 0, w, h);

    const lineSpacing = 38;
    const tl = screenToWorld(0, 0);
    const br = screenToWorld(w, h);
    const startY = Math.floor(tl.y / lineSpacing) * lineSpacing;

    ctx.strokeStyle = 'rgba(96, 165, 250, 0.22)';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;

    for (let y = startY; y < br.y; y += lineSpacing) {
      const p = worldToScreen(0, y);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(w, p.y);
      ctx.stroke();
    }

    const marginX = 80;
    const margin = worldToScreen(marginX, 0).x;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, 0);
    ctx.lineTo(margin, h);
    ctx.stroke();
    ctx.restore();
  }

  function drawBlank() {
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(248, 250, 252, 1)';
    ctx.fillRect(0, 0, w, h);
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

    if (state.backgroundMode === 'ruled') {
      drawRuled();
    } else if (state.backgroundMode === 'blank') {
      drawBlank();
    } else {
      drawGrid();
    }

    // Draw background PDF/Word page images behind ink and textboxes
    for (const item of state.attachments) {
      if (item.type !== 'image' || !item.background) continue;
      const img = item.imageEl || new Image();
      if (!item.imageEl) {
        img.src = item.src;
        item.imageEl = img;
      }
      if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) continue;
      const screen = worldToScreen(item.x, item.y);
      ctx.drawImage(img, screen.x, screen.y, (item.width || img.naturalWidth) * state.zoom, (item.height || img.naturalHeight) * state.zoom);
    }

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
        backgroundMode: page.backgroundMode,
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

  const calculatorExpressionInput = document.getElementById('calcExpression');
  const calculatorPreview = document.getElementById('calcPreview');
  const calculatorResult = document.getElementById('calcResult');
  const calculatorHistoryList = document.getElementById('calcHistory');
  const calculatorVariablesList = document.getElementById('calcVariables');
  const calculatorModeButtons = Array.from(document.querySelectorAll('.calc-mode-btn'));
  const calculatorButtonKeys = Array.from(document.querySelectorAll('#calculatorPanel .calc-key'));
  const calculatorAddBoardBtn = document.getElementById('calcAddCalculatorBtn');

  let calculatorState = '';
  let calculatorLastResult = '';
  let calculatorAnswer = '';
  let calculatorHistory = [];
  let calculatorHistoryIndex = -1;
  let calculatorUndoStack = [];
  let calculatorRedoStack = [];
  let calculatorAngleMode = 'DEG';
  const calculatorMemory = { M: 0 };

  function pushUndoState() {
    calculatorUndoStack.push(calculatorState);
    if (calculatorUndoStack.length > 40) calculatorUndoStack.shift();
    calculatorRedoStack = [];
  }

  function updateCalculatorDisplay() {
    if (calculatorExpressionInput) calculatorExpressionInput.value = calculatorState;
    updateCalculatorPreview();
    updateCalculatorResultLabel();
  }

  function updateCalculatorPreview() {
    if (!calculatorPreview) return;
    const expression = calculatorState.trim();
    const content = expression ? `\\(${expression}\\)` : '\\(\\mathrm{Type\\ text\\ here}\\)';
    calculatorPreview.textContent = content;
    if (window.MathJax && window.MathJax.typesetPromise) {
      MathJax.typesetPromise([calculatorPreview]).catch(() => {});
    }
  }

  function updateCalculatorResultLabel(message) {
    if (!calculatorResult) return;
    if (message) {
      calculatorResult.textContent = message;
      return;
    }
    if (!calculatorState.trim()) {
      calculatorResult.textContent = '—';
      return;
    }
    calculatorResult.textContent = calculatorLastResult ? calculatorLastResult : '—';
  }

  function renderCalculatorHistory() {
    if (!calculatorHistoryList) return;
    if (!calculatorHistory.length) {
      calculatorHistoryList.innerHTML = '<div>لا يوجد تاريخ حتى الآن.</div>';
      return;
    }
    calculatorHistoryList.innerHTML = calculatorHistory
      .slice().reverse().map(entry => {
        const expr = entry.expression.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<div class="calc-history-item" data-idx="${entry.index}"><span>${expr}</span><strong>${entry.result}</strong></div>`;
      }).join('');
    calculatorHistoryList.querySelectorAll('.calc-history-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = Number(item.dataset.idx);
        const history = calculatorHistory.find((entry) => entry.index === index);
        if (history) {
          calculatorState = history.expression;
          calculatorAnswer = history.result;
          updateCalculatorDisplay();
          updateCalculatorResultLabel();
        }
      });
    });
  }

  function renderCalculatorVariables() {
    if (!calculatorVariablesList) return;
    const items = Object.keys(calculatorMemory).map((name) => {
      const value = calculatorMemory[name];
      return `<div class="calc-var-item"><span>${name}</span><strong>${value}</strong></div>`;
    });
    calculatorVariablesList.innerHTML = items.length ? items.join('') : '<div>No stored variables.</div>';
  }

  function normalizeExpression(expression) {
    return expression
      .replace(/[×]/g, '*')
      .replace(/[÷]/g, '/')
      .replace(/[−]/g, '-')
      .replace(/,/g, '.')
      .replace(/Ans/g, calculatorAnswer || '0')
      .replace(/π/g, 'pi')
      .replace(/φ/g, 'phi')
      .replace(/×/g, '*')
      .replace(/÷/g, '/');
  }

  function safeFormat(value) {
    try {
      if (value === undefined || value === null) return '—';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' && !Number.isFinite(value)) return '∞';
      return math.format(value, { precision: 12 });
    } catch (err) {
      return String(value);
    }
  }

  function createAngleConverter(fn) {
    return function (x) {
      if (calculatorAngleMode === 'DEG') {
        return fn(math.unit(x, 'deg'));
      }
      if (calculatorAngleMode === 'GRAD') {
        return fn(math.unit(x * 0.9, 'deg'));
      }
      return fn(x);
    };
  }

  const calcScope = {
    pi: Math.PI,
    e: Math.E,
    phi: (1 + Math.sqrt(5)) / 2,
    G: 6.67430e-11,
    i: math.complex(0, 1),
    sin: createAngleConverter((x) => math.sin(x)),
    cos: createAngleConverter((x) => math.cos(x)),
    tan: createAngleConverter((x) => math.tan(x)),
    asin: (x) => {
      const value = math.asin(x);
      if (calculatorAngleMode === 'DEG') return math.unit(value, 'rad').toNumber('deg');
      if (calculatorAngleMode === 'GRAD') return math.unit(value, 'rad').toNumber('deg') / 0.9;
      return value;
    },
    acos: (x) => {
      const value = math.acos(x);
      if (calculatorAngleMode === 'DEG') return math.unit(value, 'rad').toNumber('deg');
      if (calculatorAngleMode === 'GRAD') return math.unit(value, 'rad').toNumber('deg') / 0.9;
      return value;
    },
    atan: (x) => {
      const value = math.atan(x);
      if (calculatorAngleMode === 'DEG') return math.unit(value, 'rad').toNumber('deg');
      if (calculatorAngleMode === 'GRAD') return math.unit(value, 'rad').toNumber('deg') / 0.9;
      return value;
    },
    sinh: (x) => math.sinh(x),
    cosh: (x) => math.cosh(x),
    tanh: (x) => math.tanh(x),
    asinh: (x) => math.asinh(x),
    acosh: (x) => math.acosh(x),
    atanh: (x) => math.atanh(x),
    ln: (x) => math.log(x),
    log: (x) => math.log10(x),
    log2: (x) => math.log(x, 2),
    exp: (x) => math.exp(x),
    sqrt: (x) => math.sqrt(x),
    cbrt: (x) => math.cbrt(x),
    nthRoot: (x, n) => math.nthRoot(x, n),
    abs: (x) => math.abs(x),
    gcd: (a, b) => math.gcd(a, b),
    lcm: (a, b) => math.lcm(a, b),
    frac: (a, b) => math.fraction(a, b),
    simplify: (expr) => math.simplify(expr).toString(),
    det: (m) => math.det(m),
    inv: (m) => math.inv(m),
    transpose: (m) => math.transpose(m),
    mean: (arr) => math.mean(arr),
    median: (arr) => math.median(arr),
    std: (arr) => math.std(arr),
    sum: (arr) => math.sum(arr),
    var: (arr) => math.variance(arr),
    norm: (v) => math.norm(v),
    dot: (a, b) => math.dot(a, b),
    cross: (a, b) => math.cross(a, b),
    arg: (z) => math.arg(z),
    re: (z) => math.re(z),
    im: (z) => math.im(z),
    matrix: (arr) => math.matrix(arr),
    vector: (arr) => math.matrix(arr),
    rand: () => math.random(),
    randomInt: (min, max) => math.randomInt(min, max),
    convert: (value, from, to) => {
      try { return math.unit(value, from).toNumber(to); } catch (err) { return `convert(${value},${from},${to})`; }
    },
    solve: (equation, variable) => {
      try {
        if (typeof equation === 'string') {
          return math.solve(equation, variable || 'x');
        }
        return math.solve(equation, variable || 'x');
      } catch (err) {
        return `solve(${equation},${variable || 'x'})`;
      }
    },
    derivative: (expression, variable) => {
      try {
        return math.derivative(expression, variable || 'x').toString();
      } catch (err) {
        return `derivative(${expression},${variable || 'x'})`;
      }
    },
    integrate: (expression, variable) => {
      try {
        if (typeof math.integral === 'function') {
          return math.integral(expression, variable || 'x').toString();
        }
      } catch (err) {
        // fall through
      }
      return `integrate(${expression},${variable || 'x'})`;
    },
    diff: (expression, variable) => {
      try {
        return math.derivative(expression, variable || 'x').toString();
      } catch (err) {
        return `diff(${expression},${variable || 'x'})`;
      }
    },
    bin: (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num.toString(2) : `bin(${value})`;
    },
    oct: (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num.toString(8) : `oct(${value})`;
    },
    hex: (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num.toString(16).toUpperCase() : `hex(${value})`;
    },
    dec: (value) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^0b/i.test(trimmed)) return parseInt(trimmed, 2);
        if (/^0o/i.test(trimmed)) return parseInt(trimmed, 8);
        if (/^0x/i.test(trimmed)) return parseInt(trimmed, 16);
        if (/^[0-9]+$/i.test(trimmed)) return parseInt(trimmed, 10);
      }
      const num = Number(value);
      return Number.isFinite(num) ? num : `dec(${value})`;
    },
    Ans: () => parseFloat(calculatorAnswer) || 0,
    M: () => calculatorMemory.M
  };

  function evaluateExpression() {
    const expr = calculatorState.trim();
    if (!expr) {
      updateCalculatorResultLabel();
      return null;
    }

    const normalized = normalizeExpression(expr);
    try {
      const value = math.evaluate(normalized, calcScope);
      const formatted = safeFormat(value);
      calculatorLastResult = formatted;
      calculatorAnswer = formatted;
      calculatorHistory.push({ index: calculatorHistory.length, expression: expr, result: formatted, time: Date.now() });
      calculatorHistoryIndex = calculatorHistory.length - 1;
      renderCalculatorHistory();
      updateCalculatorVariables();
      updateCalculatorResultLabel();
      return formatted;
    } catch (error) {
      calculatorLastResult = '';
      updateCalculatorResultLabel('خطأ في العملية');
      return null;
    }
  }

  function updateCalculatorVariables() {
    renderCalculatorVariables();
  }

  function appendCalculatorKey(key) {
    if (key === 'C' || key === 'AC') {
      pushUndoState();
      calculatorState = '';
      calculatorLastResult = '';
      updateCalculatorDisplay();
      updateCalculatorResultLabel('—');
      return;
    }

    if (key === 'DEL') {
      pushUndoState();
      calculatorState = calculatorState.slice(0, -1);
      updateCalculatorDisplay();
      return;
    }

    if (key === '=') {
      evaluateExpression();
      return;
    }

    if (key === 'Ans') {
      pushUndoState();
      calculatorState += calculatorAnswer || '0';
      updateCalculatorDisplay();
      return;
    }

    if (key === 'MC') {
      calculatorMemory.M = 0;
      updateCalculatorVariables();
      return;
    }

    if (key === 'MR') {
      pushUndoState();
      calculatorState += String(calculatorMemory.M);
      updateCalculatorDisplay();
      return;
    }

    if (key === 'M+') {
      const value = parseFloat(calculatorAnswer) || 0;
      calculatorMemory.M += value;
      updateCalculatorVariables();
      return;
    }

    if (key === 'M-') {
      const value = parseFloat(calculatorAnswer) || 0;
      calculatorMemory.M -= value;
      updateCalculatorVariables();
      return;
    }

    if (key === 'STO(' || key === 'RCL(') {
      pushUndoState();
      calculatorState += key;
      updateCalculatorDisplay();
      return;
    }

    if (key === 'HIST') {
      if (calculatorHistoryList) {
        calculatorHistoryList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }

    if (key === '↑') {
      if (calculatorHistoryIndex > 0) {
        calculatorHistoryIndex -= 1;
        const entry = calculatorHistory[calculatorHistoryIndex];
        if (entry) {
          calculatorState = entry.expression;
          updateCalculatorDisplay();
        }
      }
      return;
    }

    if (key === '↓') {
      if (calculatorHistoryIndex < calculatorHistory.length - 1) {
        calculatorHistoryIndex += 1;
        const entry = calculatorHistory[calculatorHistoryIndex];
        if (entry) {
          calculatorState = entry.expression;
          updateCalculatorDisplay();
        }
      }
      return;
    }

    pushUndoState();
    calculatorState += key;
    updateCalculatorDisplay();
  }

  function calculatorUndo() {
    if (!calculatorUndoStack.length) return;
    calculatorRedoStack.push(calculatorState);
    calculatorState = calculatorUndoStack.pop();
    updateCalculatorDisplay();
  }

  function calculatorRedo() {
    if (!calculatorRedoStack.length) return;
    calculatorUndoStack.push(calculatorState);
    calculatorState = calculatorRedoStack.pop();
    updateCalculatorDisplay();
  }

  function insertCalculatorResult() {
    const result = calculatorLastResult || evaluateExpression();
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

  function createCalculatorAttachment(world) {
    const item = {
      id: crypto.randomUUID(),
      type: 'calculator',
      x: world.x - 230,
      y: world.y - 180,
      width: 460,
      height: 360,
      expression: calculatorState || '',
      result: calculatorLastResult || '—',
      pinned: false,
      visible: true
    };
    state.attachments.push(item);
    state.selectedAttachment = item.id;
    state.redoStack = [];
    render();
  }

  function normalizeExpressionFor(expression, ansValue) {
    return expression
      .replace(/[×]/g, '*')
      .replace(/[÷]/g, '/')
      .replace(/[−]/g, '-')
      .replace(/,/g, '.')
      .replace(/Ans/g, ansValue || '0')
      .replace(/π/g, 'pi')
      .replace(/φ/g, 'phi')
      .replace(/×/g, '*')
      .replace(/÷/g, '/');
  }

  function evaluateCalculatorAttachment(item) {
    const expr = item.expression.trim();
    if (!expr) {
      item.result = '—';
      return null;
    }
    const normalized = normalizeExpressionFor(expr, item.result || '0');
    try {
      const value = math.evaluate(normalized, calcScope);
      item.result = safeFormat(value);
      return item.result;
    } catch (error) {
      item.result = 'خطأ';
      return null;
    }
  }

  function appendCalculatorAttachmentKey(item, key) {
    if (key === 'C' || key === 'AC') {
      item.expression = '';
      item.result = '—';
      return;
    }

    if (key === 'DEL') {
      item.expression = item.expression.slice(0, -1);
      return;
    }

    if (key === '=') {
      evaluateCalculatorAttachment(item);
      return;
    }

    if (key === 'Ans') {
      item.expression += item.result && item.result !== '—' ? item.result : '0';
      return;
    }

    item.expression += key;
  }

  function setCalculatorMode(mode) {
    calculatorAngleMode = mode;
    calculatorModeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    if (calculatorState.trim()) {
      evaluateExpression();
    }
  }

  if (calculatorExpressionInput) {
    calculatorExpressionInput.addEventListener('input', () => {
      calculatorState = calculatorExpressionInput.value;
      updateCalculatorPreview();
    });
    calculatorExpressionInput.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' && !evt.shiftKey) {
        evt.preventDefault();
        evaluateExpression();
      }
    });
  }

  calculatorModeButtons.forEach((btn) => {
    btn.addEventListener('click', () => setCalculatorMode(btn.dataset.mode));
  });

  calculatorButtonKeys.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      appendCalculatorKey(key);
    });
  });

  renderCalculatorHistory();
  renderCalculatorVariables();
  updateCalculatorDisplay();

  function createTextboxAttachment(world) {
    const text = '';
    const textColor = '#111827';
    const fillColor = textboxFillColor?.value || '#ffffff';
    const cornerRadius = Number(document.getElementById('cornerRadius')?.value || 18);
    const item = {
      id: crypto.randomUUID(),
      type: 'textbox',
      width: 360,
      height: 180,
      x: world.x - 360 / 2,
      y: world.y - 180 / 2,
      text,
      textColor,
      fillColor,
      cornerRadius,
      fontSize: 20,
      visible: true,
      shadowColor: 'rgba(0,0,0,.18)',
      pinned: false,
      folded: false,
      imageSrc: ''
    };
    state.attachments.push(item);
    state.selectedAttachment = item.id;
    updateTextboxInspector(item);
    state.redoStack = [];
    render();
    setTimeout(() => focusTextboxAttachment(item.id), 10);
  }

  function focusTextboxAttachment(id) {
    const item = state.attachments.find((a) => a.id === id && a.type === 'textbox');
    if (item && item.folded) {
      item.folded = false;
      render();
    }
    const layer = ensureAttachmentLayer();
    const input = layer.querySelector(`[data-attachment-id="${id}"] .textbox-input`);
    if (!input) return;
    layer.classList.add('editing-doc');
    canvas.style.pointerEvents = 'none';
    input.contentEditable = 'true';
    // remove placeholder element if present
    const ph = input.querySelector('.textbox-placeholder');
    if (ph) ph.remove();
    input.focus();
    // place caret at end
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    input.addEventListener('blur', () => {
      const item = state.attachments.find((a) => a.id === id && a.type === 'textbox');
      if (item) {
        item.text = input.textContent || '';
      }
      input.contentEditable = 'false';
      layer.classList.remove('editing-doc');
      canvas.style.pointerEvents = '';
      updateTextboxInspector(item);
      render();
    }, { once: true });
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
        calculatorExpressionInput?.focus();
      }
      render();
    });
  });

  backgroundButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.backgroundMode = btn.dataset.bg || 'grid';
      const page = state.pages[state.activePageIndex];
      if (page) page.backgroundMode = state.backgroundMode;
      state.redoStack = [];
      updatePageStatus();
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
        calculatorExpressionInput?.focus();
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

  document.getElementById('calcClearBtn')?.addEventListener('click', () => appendCalculatorKey('C'));
  document.getElementById('calcDeleteBtn')?.addEventListener('click', () => appendCalculatorKey('DEL'));
  document.getElementById('calcUndoBtn')?.addEventListener('click', calculatorUndo);
  document.getElementById('calcRedoBtn')?.addEventListener('click', calculatorRedo);
  document.getElementById('calcEvaluateBtn')?.addEventListener('click', () => appendCalculatorKey('='));
  document.getElementById('calcInsertBtn')?.addEventListener('click', insertCalculatorResult);
  calculatorAddBoardBtn?.addEventListener('click', () => {
    const center = screenToWorld(frame.clientWidth / 2, frame.clientHeight / 2);
    createCalculatorAttachment(center);
  });

  // Inspector bindings
  document.getElementById('strokeColor')?.addEventListener('input', (e) => { state.strokeColor = e.target.value; });
  document.getElementById('strokeWidth')?.addEventListener('input', (e) => { state.strokeWidth = Number(e.target.value); });
  document.getElementById('strokeOpacity')?.addEventListener('input', (e) => { state.strokeOpacity = Number(e.target.value); });
  document.getElementById('cornerRadius')?.addEventListener('input', (e) => { state.cornerRadius = Number(e.target.value); });
  document.getElementById('shadowMode')?.addEventListener('change', (e) => { state.shadowMode = e.target.value; });

  const textboxFillColor = document.getElementById('textboxFillColor');
  const textboxFontSize = document.getElementById('textboxFontSize');
  const textboxVisible = document.getElementById('textboxVisible');
  const textboxShadowColor = document.getElementById('textboxShadowColor');
  const textboxLocked = document.getElementById('textboxLocked');

  const micSelect = document.getElementById('micSelect');
  const recordBtn = document.getElementById('recordBtn');
  const downloadRecordingBtn = document.getElementById('downloadRecordingBtn');
  const audioStatus = document.getElementById('audioStatus');
  const videoPlayback = document.getElementById('videoPlayback');
  let recordingTimer = null;

  function updateTextboxInspector(item) {
    if (!textboxFillColor) return;
    if (item && item.type === 'textbox') {
      textboxFillColor.value = item.fillColor || '#ffffff';
      if (textboxFontSize) textboxFontSize.value = item.fontSize || 20;
      if (textboxVisible) textboxVisible.checked = item.visible !== false;
      if (textboxShadowColor) textboxShadowColor.value = item.shadowColor || 'rgba(0,0,0,.18)';
      if (textboxLocked) textboxLocked.checked = !!item.pinned;
    } else {
      textboxFillColor.value = '#ffffff';
      if (textboxFontSize) textboxFontSize.value = 20;
      if (textboxVisible) textboxVisible.checked = true;
      if (textboxShadowColor) textboxShadowColor.value = 'rgba(0,0,0,.18)';
      if (textboxLocked) textboxLocked.checked = false;
    }
  }

  // Global handlers for resizing textbox attachments
  window.addEventListener('pointermove', (evt) => {
    if (!state.resizingAttachment) return;
    evt.preventDefault();
    const r = state.resizingAttachment;
    const item = state.attachments.find(a => a.id === r.id);
    if (!item) return;
    const dx = (evt.clientX - r.startClientX) / state.zoom;
    const dy = (evt.clientY - r.startClientY) / state.zoom;
    item.width = Math.max(120, r.startW + dx);
    item.height = Math.max(80, r.startH + dy);
    render();
  });

  window.addEventListener('pointerup', () => {
    if (state.resizingAttachment) state.resizingAttachment = null;
  });

  // Text content is now edited inline; text color is managed per-attachment via toolbar/menu
  if (textboxFillColor) {
    textboxFillColor.addEventListener('input', () => {
      const item = state.attachments.find((a) => a.id === state.selectedAttachment && a.type === 'textbox');
      if (item) {
        item.fillColor = textboxFillColor.value;
        render();
      }
    });
  }
    if (textboxShadowColor) {
      textboxShadowColor.addEventListener('input', () => {
        const item = state.attachments.find((a) => a.id === state.selectedAttachment && a.type === 'textbox');
        if (item) {
          item.shadowColor = textboxShadowColor.value;
          render();
        }
      });
    }
  if (textboxFontSize) {
    textboxFontSize.addEventListener('input', () => {
      const item = state.attachments.find((a) => a.id === state.selectedAttachment && a.type === 'textbox');
      if (item) {
        item.fontSize = Number(textboxFontSize.value);
        render();
      }
    });
  }
  if (textboxVisible) {
    textboxVisible.addEventListener('change', () => {
      const item = state.attachments.find((a) => a.id === state.selectedAttachment && a.type === 'textbox');
      if (item) {
        item.visible = textboxVisible.checked;
        render();
      }
    });
  }
  if (textboxLocked) {
    textboxLocked.addEventListener('change', () => {
      const item = state.attachments.find((a) => a.id === state.selectedAttachment && a.type === 'textbox');
      if (item) {
        item.pinned = textboxLocked.checked;
        render();
      }
    });
  }

  function setAudioStatus(text) {
    if (audioStatus) audioStatus.textContent = `حالة: ${text}`;
  }

  function formatDuration(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function updateMicList(devices) {
    if (!micSelect) return;
    micSelect.innerHTML = '';

    if (!devices.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'لا يوجد مايك متاح';
      micSelect.appendChild(option);
      micSelect.disabled = true;
      state.selectedMicId = '';
      return;
    }

    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `مايك ${index + 1}`;
      micSelect.appendChild(option);
    });

    micSelect.disabled = false;
    if (!state.selectedMicId || !devices.some((d) => d.deviceId === state.selectedMicId)) {
      state.selectedMicId = devices[0].deviceId;
      micSelect.value = state.selectedMicId;
    }
  }

  async function refreshAudioDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      updateMicList([]);
      setAudioStatus('لم يتم دعم المتصفح');
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === 'audioinput');
      state.audioDevices = inputs;
      updateMicList(inputs);
      setAudioStatus(inputs.length ? 'جاهز للتسجيل' : 'لا يوجد مايك');
    } catch (err) {
      updateMicList([]);
      setAudioStatus('خطأ في الوصول إلى الأجهزة');
    }
  }

  function stopAudioStreams() {
    if (!state.mediaStream) return;
    state.mediaStream.getTracks().forEach((track) => track.stop());
    state.mediaStream = null;
  }

  function stopRecordingStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
  }

  async function startCapture() {
    if (!canvas.captureStream) {
      setAudioStatus('المتصفح لا يدعم تسجيل الفيديو');
      return;
    }

    const canvasStream = canvas.captureStream(60);
    const finalStream = new MediaStream(canvasStream.getVideoTracks());
    let micStream = null;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const constraints = state.selectedMicId
          ? { audio: { deviceId: { exact: state.selectedMicId } } }
          : { audio: true };
        micStream = await navigator.mediaDevices.getUserMedia(constraints);
        state.mediaStream = micStream;
        micStream.getAudioTracks().forEach((track) => finalStream.addTrack(track));
      } catch (err) {
        setAudioStatus('تم التسجيل بدون صوت');
      }
    }

    state.audioChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp8,opus')
      ? 'video/webm; codecs=vp8,opus'
      : MediaRecorder.isTypeSupported('video/webm; codecs=vp9,opus')
        ? 'video/webm; codecs=vp9,opus'
        : 'video/webm';

    const recorderOptions = {
      mimeType,
      videoBitsPerSecond: 6000000,
      audioBitsPerSecond: 192000
    };

    state.mediaRecorder = new MediaRecorder(finalStream, recorderOptions);
    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) state.audioChunks.push(event.data);
    };
    state.mediaRecorder.onstop = () => {
      state.audioBlob = new Blob(state.audioChunks, { type: mimeType });
      if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
      state.audioUrl = URL.createObjectURL(state.audioBlob);
      if (videoPlayback) {
        videoPlayback.src = state.audioUrl;
        videoPlayback.hidden = false;
      }
      if (downloadRecordingBtn) downloadRecordingBtn.disabled = false;
      const hasAudio = finalStream.getAudioTracks().length > 0;
      setAudioStatus(hasAudio ? 'انتهى التسجيل' : 'انتهى التسجيل (بدون صوت)');
      stopRecordingStream(finalStream);
      stopAudioStreams();
    };

    state.mediaRecorder.start();
    state.recording = true;
    state.recordingStart = Date.now();
    if (recordBtn) {
      recordBtn.textContent = 'إيقاف التسجيل';
      recordBtn.classList.add('recording');
    }
    setAudioStatus('تسجيل... 00:00');
    recordingTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.recordingStart) / 1000);
      setAudioStatus(`تسجيل... ${formatDuration(elapsed)}`);
    }, 500);
  }

  function stopAudioRecording() {
    if (!state.recording) return;
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
    }
    state.recording = false;
    if (recordBtn) {
      recordBtn.textContent = 'ابدأ التسجيل';
      recordBtn.classList.remove('recording');
    }
    clearInterval(recordingTimer);
    recordingTimer = null;
  }

  function resetAudioOutput() {
    if (videoPlayback) {
      videoPlayback.pause();
      videoPlayback.currentTime = 0;
    }
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
      state.audioUrl = null;
    }
  }

  micSelect?.addEventListener('change', (event) => {
    state.selectedMicId = event.target.value;
  });

  recordBtn?.addEventListener('click', async () => {
    if (state.recording) {
      stopAudioRecording();
      return;
    }
    if (downloadRecordingBtn) downloadRecordingBtn.disabled = true;
    resetAudioOutput();
    await startCapture();
  });

  downloadRecordingBtn?.addEventListener('click', () => {
    if (!state.audioBlob || !state.audioUrl) return;
    const a = document.createElement('a');
    a.href = state.audioUrl;
    a.download = 'شرح.webm';
    a.click();
  });

  refreshAudioDevices();

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
    evt.preventDefault();
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

    if (state.tool === 'textbox') {
      const world = screenToWorld(pt.x, pt.y);
      createTextboxAttachment(world);
      return;
    }

    if (state.tool === 'select') {
  const world = screenToWorld(pt.x, pt.y);
  const hit = hitTestAttachment(world);

  if (hit) {
    state.selectedAttachment = hit.item.id;
    updateTextboxInspector(hit.item);
    state.dragAttachment = {
      id: hit.item.id,
      offsetX: world.x - hit.item.x,
      offsetY: world.y - hit.item.y
    };
    render();
  } else {
    state.selectedAttachment = null;
    updateTextboxInspector(null);
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
      const world = screenToWorld(pt.x, pt.y);
      if (isPointNearRuler(world)) {
        state.ruler.visible = false;
        render();
        return;
      }

      state.drawing = true;
      state.lastPt = pt;
      state.currentStroke = {
        tool: 'eraser',
        width: state.strokeWidth * 2,
        points: [world]
      };
      return;
    }

    startStroke(pt);
  });

  canvas.addEventListener('pointermove', (evt) => {
    if (state.drawing || state.isPanning || state.dragAttachment || state.tool !== 'select') {
      evt.preventDefault();
    }
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

      if (state.ruler.visible && isPointNearRuler(eraserWorld)) {
        state.ruler.visible = false;
      }

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
  canvas.addEventListener('pointercancel', (evt) => {
    if (state.drawing || state.isPanning || state.dragAttachment) {
      evt.preventDefault();
    }
    handlePointerUp();
  });

  // Also listen on the window so releasing the pointer outside the canvas clears drags.
  window.addEventListener('pointerup', handlePointerUp);

  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((eventName) => {
    canvas.addEventListener(eventName, (evt) => {
      if (state.tool !== 'select' || state.drawing || state.isPanning || state.dragAttachment) {
        evt.preventDefault();
      }
    }, { passive: false });
  });

  const addFileBtn = document.getElementById('addFileBtn');
const boardFileInput = document.getElementById('boardFileInput');

async function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function ensurePdfJs() {
  if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') return;
  const urls = [
    'assets/pdfjs/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js',
    'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.min.js'
  ];
  const localWorker = 'assets/pdfjs/pdf.worker.min.js';
  const remoteWorker = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

  async function supportsUrl(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  for (const url of urls) {
    try {
      await loadScript(url);
      if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') {
        if (window.pdfjsLib.GlobalWorkerOptions) {
          const workerSrc = await supportsUrl(localWorker) ? localWorker : remoteWorker;
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        }
        return;
      }
    } catch (error) {
      console.warn(error);
    }
  }
  throw new Error('PDF support library is not loaded. Place pdf.min.js and pdf.worker.min.js into assets/pdfjs, or serve the app over HTTP (not file://) so external script loading is allowed.');
}

addFileBtn?.addEventListener('click', () => {
  boardFileInput?.click();
});

boardFileInput?.addEventListener('change', async () => {
  const file = boardFileInput.files?.[0];
  if (!file) return;

  const start = screenToWorld(80, 80);

  // helper to add an image attachment to the current active page (centered)
  async function addImageToCurrentPage(src, options = {}) {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = src; });
    const center = screenToWorld(frame.clientWidth / 2, frame.clientHeight / 2);
    const width = Math.min(900, img.naturalWidth);
    const height = width * (img.naturalHeight / img.naturalWidth);
    state.attachments.push({
      id: crypto.randomUUID(),
      type: 'image',
      src,
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
      pinned: options.pinned || false,
      background: options.background || false,
      imageEl: img
    });
  }

  const selected = state.attachments.find((a) => a.id === state.selectedAttachment);
  if (selected && selected.type === 'textbox') {
    selected.imageSrc = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    render();
  } else if (file.type.startsWith('image/')) {
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
        height,
        imageEl: img
      });
      render();
    };
    img.src = src;
  } else if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf' || file.type === 'application/x-pdf' || file.type === 'application/vnd.adobe.pdf') {
    try {
      await ensurePdfJs();
    } catch (error) {
      alert(error.message);
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    pdfjsLib.disableWorker = true;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // For each PDF page, create a new whiteboard page and add the page image as an attachment
    const firstNewIndex = state.pages.length;
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.5 });
      const cvs = document.createElement('canvas');
      cvs.width = Math.floor(viewport.width);
      cvs.height = Math.floor(viewport.height);
      const ctx = cvs.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const src = cvs.toDataURL();

      state.pages.push(createPage());
      bindActivePage(state.pages.length - 1);
      await addImageToCurrentPage(src, { pinned: true, background: true });
    }
    // focus on the first newly added page
    bindActivePage(firstNewIndex);
    render();

  } else if (file.name.toLowerCase().endsWith('.docx')) {
    if (!window.mammoth) {
      alert('Word support library is not loaded.');
      return;
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });

    // Render the converted HTML to a canvas using html2canvas, then split into pages
    const off = document.createElement('div');
    off.style.position = 'absolute';
    off.style.left = '-9999px';
    off.style.top = '0';
    off.style.width = '820px';
    off.innerHTML = result.value;
    document.body.appendChild(off);

    const canvas = await html2canvas(off, { backgroundColor: null, scale: 1 });
    document.body.removeChild(off);

    const ratio = canvas.width / 820;
    const pageH = Math.round(520 * ratio);
    const pageCount = Math.ceil(canvas.height / pageH);
    const firstNewIndex = state.pages.length;

    for (let i = 0; i < pageCount; i++) {
      const sub = document.createElement('canvas');
      sub.width = canvas.width;
      sub.height = Math.min(pageH, canvas.height - i * pageH);
      const sctx = sub.getContext('2d');
      sctx.drawImage(canvas, 0, i * pageH, canvas.width, sub.height, 0, 0, canvas.width, sub.height);
      const src = sub.toDataURL();
      state.pages.push(createPage());
      bindActivePage(state.pages.length - 1);
      await addImageToCurrentPage(src);
    }
    bindActivePage(firstNewIndex);
    render();
  } else {
    alert('Please choose an image, .docx, or .pdf file.');
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

document.addEventListener('fullscreenchange', () => {
  const whiteboardEl = document.getElementById('whiteboard');
  if (document.fullscreenElement === whiteboardEl) {
    whiteboardEl.scrollTop = 0;
  }
  setTimeout(resize, 120);
});

}





