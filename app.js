const INITIAL_APPS = [
  { id: 'app-desk', name: 'Desk App', description: '', url: 'https://desk-app-inky.vercel.app/' },
  { id: 'app-white-maker', name: 'White Maker', description: '', url: 'https://white-maker.vercel.app/' },
  { id: 'app-hangul-papa', name: 'Hangul Papa', description: '', url: 'https://hangul-papa.vercel.app/' },
  { id: 'app-saju-grap', name: 'Saju Grap', description: '', url: 'https://saju-grap.vercel.app/' },
  { id: 'app-bloom-rag', name: 'Bloom RAG Chat', description: '', url: 'https://bloom-rag-chat.vercel.app/' },
  { id: 'app-shuttle-mate', name: 'Shuttle Mate', description: '', url: 'https://shuttle-mate.vercel.app/' },
  { id: 'app-campingsite', name: 'Camping Site', description: '', url: 'https://hey24blanket.github.io/campingsite/' },
  { id: 'app-camping-menu', name: 'Camping Menu', description: '', url: 'https://hey24blanket.github.io/camping-menu/' }
];

const STORAGE_KEY = 'blanket-dashboard-state-v1';
const WORLD_WIDTH = 5000;
const WORLD_HEIGHT = 3200;

const makeInitialState = () => ({
  version: 1,
  apps: INITIAL_APPS,
  graph: {
    nodes: INITIAL_APPS.map((app, index) => ({
      id: `node-${app.id}`,
      type: 'app',
      appId: app.id,
      title: app.name,
      description: app.description,
      x: 260 + (index % 4) * 360,
      y: 220 + Math.floor(index / 4) * 230
    })),
    edges: [],
    viewport: { x: 0, y: 0, scale: 1 }
  },
  updatedAt: new Date().toISOString()
});

let state = loadLocalState();
let searchTerm = '';
let selectedEdgeId = null;
let toastTimer = null;
let graphInteraction = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function loadLocalState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || !Array.isArray(parsed.apps) || !parsed.graph) return makeInitialState();
    return normalizeState(parsed);
  } catch {
    return makeInitialState();
  }
}

function normalizeState(input) {
  const clean = {
    version: 1,
    apps: Array.isArray(input.apps) ? input.apps : [],
    graph: {
      nodes: Array.isArray(input.graph?.nodes) ? input.graph.nodes : [],
      edges: Array.isArray(input.graph?.edges) ? input.graph.edges : [],
      viewport: input.graph?.viewport || { x: 0, y: 0, scale: 1 }
    },
    updatedAt: input.updatedAt || new Date().toISOString()
  };
  clean.graph.viewport.scale = clamp(Number(clean.graph.viewport.scale) || 1, .35, 1.6);
  clean.graph.viewport.x = Number(clean.graph.viewport.x) || 0;
  clean.graph.viewport.y = Number(clean.graph.viewport.y) || 0;
  return clean;
}

function saveLocalState() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderStats();
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.href;
  } catch { return null; }
}

function displayName(app) {
  if (app.name?.trim()) return app.name.trim();
  try {
    return new URL(app.url).hostname.replace(/^www\./, '').split('.')[0].replace(/[-_]/g, ' ');
  } catch { return 'Untitled App'; }
}

function domainOf(url) {
  try { return new URL(url).host + new URL(url).pathname.replace(/\/$/, ''); }
  catch { return url; }
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'A';
}

function renderAll() {
  syncAppNodes();
  renderApps();
  renderGraph();
  renderStats();
}

function renderStats() {
  $('#appCount').textContent = state.apps.length;
  $('#projectCount').textContent = state.graph.nodes.filter(n => n.type === 'project').length;
  $('#connectionCount').textContent = state.graph.edges.length;
}

function renderApps() {
  const grid = $('#appGrid');
  const filtered = state.apps.filter(app => {
    const hay = `${displayName(app)} ${app.description || ''} ${app.url}`.toLowerCase();
    return hay.includes(searchTerm.toLowerCase());
  });

  grid.innerHTML = filtered.map(app => {
    const name = displayName(app);
    const description = app.description?.trim() || '설명이 아직 없습니다.';
    const url = safeUrl(app.url) || '#';
    return `
      <article class="app-card" data-app-id="${escapeHtml(app.id)}">
        <div class="preview-shell">
          <div class="preview-browserbar"><i></i><i></i><i></i><span>${escapeHtml(domainOf(app.url))}</span></div>
          <div class="iframe-viewport">
            <iframe class="app-iframe" src="${escapeHtml(url)}" loading="lazy" title="${escapeHtml(name)} 미리보기" referrerpolicy="no-referrer-when-downgrade"></iframe>
          </div>
          <div class="live-pill">LIVE</div>
          <a class="preview-overlay" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span>앱 열기 ↗</span></a>
        </div>
        <div class="card-body">
          <div class="card-title-row">
            <div class="card-favicon">${escapeHtml(initials(name))}</div>
            <div class="card-copy">
              <h3 title="${escapeHtml(name)}">${escapeHtml(name)}</h3>
              <p>${escapeHtml(description)}</p>
            </div>
            <div class="card-menu">
              <button class="card-menu-button" data-action="menu" aria-label="메뉴">•••</button>
              <div class="card-menu-popover" hidden>
                <button data-action="edit">수정</button>
                <button data-action="refresh">미리보기 새로고침</button>
                <button data-action="delete" class="delete">삭제</button>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <span class="card-domain">${escapeHtml(domainOf(app.url))}</span>
            <a class="open-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">OPEN ↗</a>
          </div>
        </div>
      </article>`;
  }).join('');

  $('#emptyApps').hidden = filtered.length !== 0;
}

function syncAppNodes() {
  const appIds = new Set(state.apps.map(a => a.id));
  state.graph.nodes = state.graph.nodes.filter(node => node.type !== 'app' || appIds.has(node.appId));
  state.graph.edges = state.graph.edges.filter(edge =>
    state.graph.nodes.some(node => node.id === edge.from) && state.graph.nodes.some(node => node.id === edge.to)
  );

  const existing = new Set(state.graph.nodes.filter(n => n.type === 'app').map(n => n.appId));
  state.apps.forEach((app, index) => {
    if (!existing.has(app.id)) {
      state.graph.nodes.push({
        id: `node-${app.id}`,
        type: 'app',
        appId: app.id,
        title: displayName(app),
        description: app.description || '',
        x: 260 + (index % 4) * 360,
        y: 220 + Math.floor(index / 4) * 230
      });
    }
  });
}

function getNodeLabel(node) {
  if (node.type === 'app') {
    const app = state.apps.find(a => a.id === node.appId);
    return app ? displayName(app) : node.title || 'App';
  }
  return node.title || 'Project';
}

function getNodeDescription(node) {
  if (node.type === 'app') {
    const app = state.apps.find(a => a.id === node.appId);
    return app?.description || app?.url || '';
  }
  return node.description || '프로젝트 메모 없음';
}

function renderGraph() {
  const nodeLayer = $('#nodeLayer');
  nodeLayer.innerHTML = state.graph.nodes.map(node => {
    const label = getNodeLabel(node);
    const description = getNodeDescription(node);
    const app = node.type === 'app' ? state.apps.find(a => a.id === node.appId) : null;
    return `
      <div class="graph-node ${node.type}-node" data-node-id="${escapeHtml(node.id)}" style="left:${Number(node.x) || 0}px;top:${Number(node.y) || 0}px">
        <div class="node-port in" data-port="in" title="연결 포트"></div>
        <div class="node-port out" data-port="out" title="연결 포트"></div>
        <div class="node-head">
          <span class="node-kind">${node.type === 'app' ? 'APP' : 'PROJECT'}</span>
          <span class="node-title">${escapeHtml(label)}</span>
          ${node.type === 'project' ? '<button class="node-delete" data-node-delete="1" aria-label="노드 삭제">×</button>' : ''}
        </div>
        <div class="node-body">
          <div>${escapeHtml(description)}</div>
          ${app ? `<div class="node-url">${escapeHtml(domainOf(app.url))}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  applyViewport();
  renderEdges();
}

function nodeCenter(nodeId, side = 'out') {
  const node = state.graph.nodes.find(n => n.id === nodeId);
  if (!node) return { x: 0, y: 0 };
  const width = 250;
  const height = 112;
  return { x: node.x + (side === 'out' ? width : 0), y: node.y + height / 2 };
}

function edgePath(from, to) {
  const dx = Math.max(70, Math.abs(to.x - from.x) * .45);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

function renderEdges(temp = null) {
  const svg = $('#edgeLayer');
  const markup = state.graph.edges.map(edge => {
    const from = nodeCenter(edge.from, edge.fromPort || 'out');
    const to = nodeCenter(edge.to, edge.toPort || 'in');
    const d = edgePath(from, to);
    const selected = edge.id === selectedEdgeId ? ' is-selected' : '';
    return `<g class="edge-group${selected}" data-edge-id="${escapeHtml(edge.id)}"><path class="edge-hit" d="${d}"></path><path class="edge-path" d="${d}"></path></g>`;
  }).join('');
  const tempMarkup = temp ? `<path class="temp-edge" d="${edgePath(temp.from, temp.to)}"></path>` : '';
  svg.innerHTML = markup + tempMarkup;
}

function applyViewport() {
  const { x, y, scale } = state.graph.viewport;
  $('#mapWorld').style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  $('#zoomResetBtn').textContent = `${Math.round(scale * 100)}%`;
}

function clientToWorld(clientX, clientY) {
  const rect = $('#mapFrame').getBoundingClientRect();
  const { x, y, scale } = state.graph.viewport;
  return {
    x: (clientX - rect.left - x) / scale,
    y: (clientY - rect.top - y) / scale
  };
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function showToast(message, isError = false) {
  const toast = $('#toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-show');
  toastTimer = setTimeout(() => toast.classList.remove('is-show'), 2600);
}

function openAppDialog(app = null) {
  $('#appIdInput').value = app?.id || '';
  $('#appUrlInput').value = app?.url || '';
  $('#appNameInput').value = app?.name || '';
  $('#appDescriptionInput').value = app?.description || '';
  $('#appDialogEyebrow').textContent = app ? 'EDIT APP' : 'NEW APP';
  $('#appDialogTitle').textContent = app ? '앱 수정' : '앱 추가';
  $('#appDialog').showModal();
  setTimeout(() => $('#appUrlInput').focus(), 30);
}

function createOrUpdateApp() {
  const id = $('#appIdInput').value;
  const url = safeUrl($('#appUrlInput').value.trim());
  if (!url) {
    showToast('http 또는 https 주소를 입력해주세요.', true);
    return false;
  }
  const payload = {
    id: id || uid('app'),
    url,
    name: $('#appNameInput').value.trim(),
    description: $('#appDescriptionInput').value.trim()
  };

  if (id) {
    const index = state.apps.findIndex(app => app.id === id);
    if (index >= 0) state.apps[index] = payload;
  } else {
    state.apps.push(payload);
  }
  syncAppNodes();
  saveLocalState();
  renderAll();
  showToast(id ? '앱 정보를 수정했습니다.' : '앱을 추가했습니다.');
  return true;
}

function deleteApp(appId) {
  const app = state.apps.find(a => a.id === appId);
  if (!app) return;
  if (!confirm(`“${displayName(app)}” 앱을 삭제할까요?\n연결된 Project Map 노드와 연결선도 함께 삭제됩니다.`)) return;
  state.apps = state.apps.filter(a => a.id !== appId);
  syncAppNodes();
  saveLocalState();
  renderAll();
  showToast('앱을 삭제했습니다.');
}

function addProject(title, description) {
  const position = clientToWorld(window.innerWidth * .52, window.innerHeight * .5);
  state.graph.nodes.push({
    id: uid('project'),
    type: 'project',
    title,
    description,
    x: clamp(position.x - 125, 40, WORLD_WIDTH - 290),
    y: clamp(position.y - 60, 40, WORLD_HEIGHT - 170)
  });
  saveLocalState();
  renderGraph();
  renderStats();
  showToast('프로젝트 노드를 추가했습니다.');
}

function deleteNode(nodeId) {
  const node = state.graph.nodes.find(n => n.id === nodeId);
  if (!node || node.type !== 'project') return;
  if (!confirm(`“${getNodeLabel(node)}” 프로젝트 노드를 삭제할까요?`)) return;
  state.graph.nodes = state.graph.nodes.filter(n => n.id !== nodeId);
  state.graph.edges = state.graph.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
  saveLocalState();
  renderGraph();
  renderStats();
}

function addEdge(fromNodeId, fromPort, toNodeId, toPort) {
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return;
  let from = fromNodeId;
  let to = toNodeId;
  let fp = fromPort;
  let tp = toPort;
  if (fp === 'in' && tp === 'out') {
    [from, to] = [to, from];
    [fp, tp] = [tp, fp];
  }
  const duplicate = state.graph.edges.some(e => e.from === from && e.to === to);
  if (duplicate) {
    showToast('이미 연결된 노드입니다.', true);
    return;
  }
  state.graph.edges.push({ id: uid('edge'), from, to, fromPort: fp, toPort: tp });
  saveLocalState();
  renderEdges();
  renderStats();
}

function arrangeMap() {
  const projects = state.graph.nodes.filter(n => n.type === 'project');
  const apps = state.graph.nodes.filter(n => n.type === 'app');
  projects.forEach((node, i) => {
    node.x = 600 + (i % 3) * 520;
    node.y = 240 + Math.floor(i / 3) * 290;
  });
  apps.forEach((node, i) => {
    node.x = 150 + (i % 4) * 390;
    node.y = 900 + Math.floor(i / 4) * 220;
  });
  state.graph.viewport = { x: 0, y: 0, scale: .78 };
  saveLocalState();
  renderGraph();
  showToast('노드를 자동 정렬했습니다.');
}

async function githubSave() {
  const btn = $('#saveGithubBtn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '저장 중…';
  try {
    const response = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'GitHub 저장 실패');
    showToast('GitHub에 현재 상태를 저장했습니다.');
  } catch (error) {
    showToast(error.message || 'GitHub 저장에 실패했습니다.', true);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function githubLoad() {
  const btn = $('#loadGithubBtn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '불러오는 중…';
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'GitHub 불러오기 실패');
    state = normalizeState(result.state);
    saveLocalState();
    renderAll();
    showToast('GitHub 상태를 불러왔습니다.');
  } catch (error) {
    showToast(error.message || 'GitHub 상태를 불러오지 못했습니다.', true);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function setView(view) {
  $$('.tab-button').forEach(btn => btn.classList.toggle('is-active', btn.dataset.view === view));
  $('#appsView').classList.toggle('is-active', view === 'apps');
  $('#mapView').classList.toggle('is-active', view === 'map');
  if (view === 'map') requestAnimationFrame(() => { applyViewport(); renderEdges(); });
}

function changeZoom(delta, anchor = null) {
  const frame = $('#mapFrame');
  const rect = frame.getBoundingClientRect();
  const old = state.graph.viewport.scale;
  const next = clamp(old + delta, .35, 1.6);
  if (next === old) return;
  const ax = anchor?.x ?? rect.width / 2;
  const ay = anchor?.y ?? rect.height / 2;
  const worldX = (ax - state.graph.viewport.x) / old;
  const worldY = (ay - state.graph.viewport.y) / old;
  state.graph.viewport.x = ax - worldX * next;
  state.graph.viewport.y = ay - worldY * next;
  state.graph.viewport.scale = next;
  applyViewport();
  saveLocalState();
}

function bindEvents() {
  $$('.tab-button').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  $('#addAppBtn').addEventListener('click', () => openAppDialog());
  $('#appSearch').addEventListener('input', e => { searchTerm = e.target.value; renderApps(); });
  $('#saveGithubBtn').addEventListener('click', githubSave);
  $('#loadGithubBtn').addEventListener('click', githubLoad);
  $('#addProjectBtn').addEventListener('click', () => $('#projectDialog').showModal());
  $('#arrangeMapBtn').addEventListener('click', arrangeMap);

  $$('[data-close-dialog]').forEach(btn => btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.closeDialog)?.close();
  }));

  $('#appForm').addEventListener('submit', e => {
    e.preventDefault();
    if (createOrUpdateApp()) $('#appDialog').close();
  });

  $('#projectForm').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#projectNameInput').value.trim();
    if (!title) return;
    addProject(title, $('#projectDescriptionInput').value.trim());
    e.currentTarget.reset();
    $('#projectDialog').close();
  });

  $('#appGrid').addEventListener('click', e => {
    const card = e.target.closest('.app-card');
    if (!card) return;
    const appId = card.dataset.appId;
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'menu') {
      const popover = $('.card-menu-popover', card);
      const isHidden = popover.hidden;
      $$('.card-menu-popover').forEach(p => p.hidden = true);
      popover.hidden = !isHidden;
    }
    if (action === 'edit') {
      const app = state.apps.find(a => a.id === appId);
      if (app) openAppDialog(app);
      $('.card-menu-popover', card).hidden = true;
    }
    if (action === 'refresh') {
      const iframe = $('.app-iframe', card);
      if (iframe) iframe.src = iframe.src;
      $('.card-menu-popover', card).hidden = true;
      showToast('미리보기를 새로고침했습니다.');
    }
    if (action === 'delete') deleteApp(appId);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.card-menu')) $$('.card-menu-popover').forEach(p => p.hidden = true);
  });

  const frame = $('#mapFrame');
  const nodeLayer = $('#nodeLayer');
  const edgeLayer = $('#edgeLayer');

  nodeLayer.addEventListener('mousedown', e => {
    const nodeEl = e.target.closest('.graph-node');
    if (!nodeEl) return;
    const node = state.graph.nodes.find(n => n.id === nodeEl.dataset.nodeId);
    if (!node) return;

    if (e.target.closest('[data-node-delete]')) {
      e.stopPropagation();
      deleteNode(node.id);
      return;
    }

    const port = e.target.closest('.node-port');
    if (port) {
      e.preventDefault();
      e.stopPropagation();
      const startWorld = nodeCenter(node.id, port.dataset.port);
      graphInteraction = { type: 'connect', nodeId: node.id, port: port.dataset.port, startWorld };
      renderEdges({ from: startWorld, to: startWorld });
      return;
    }

    if (e.target.closest('.node-head')) {
      e.preventDefault();
      e.stopPropagation();
      const world = clientToWorld(e.clientX, e.clientY);
      graphInteraction = { type: 'node', nodeId: node.id, offsetX: world.x - node.x, offsetY: world.y - node.y };
      nodeEl.classList.add('is-dragging');
    }
  });

  frame.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.closest('.graph-node') || e.target.closest('.map-corner-tools')) return;
    selectedEdgeId = null;
    renderEdges();
    graphInteraction = {
      type: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: state.graph.viewport.x,
      startY: state.graph.viewport.y
    };
    frame.classList.add('is-panning');
  });

  window.addEventListener('mousemove', e => {
    if (!graphInteraction) return;
    if (graphInteraction.type === 'node') {
      const node = state.graph.nodes.find(n => n.id === graphInteraction.nodeId);
      if (!node) return;
      const world = clientToWorld(e.clientX, e.clientY);
      node.x = clamp(world.x - graphInteraction.offsetX, 0, WORLD_WIDTH - 250);
      node.y = clamp(world.y - graphInteraction.offsetY, 0, WORLD_HEIGHT - 120);
      const el = document.querySelector(`.graph-node[data-node-id="${CSS.escape(node.id)}"]`);
      if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; }
      renderEdges();
    }
    if (graphInteraction.type === 'connect') renderEdges({ from: graphInteraction.startWorld, to: clientToWorld(e.clientX, e.clientY) });
    if (graphInteraction.type === 'pan') {
      state.graph.viewport.x = graphInteraction.startX + e.clientX - graphInteraction.startClientX;
      state.graph.viewport.y = graphInteraction.startY + e.clientY - graphInteraction.startClientY;
      applyViewport();
    }
  });

  window.addEventListener('mouseup', e => {
    if (!graphInteraction) return;
    if (graphInteraction.type === 'connect') {
      const targetPort = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.node-port');
      const targetNode = targetPort?.closest('.graph-node');
      if (targetPort && targetNode) addEdge(graphInteraction.nodeId, graphInteraction.port, targetNode.dataset.nodeId, targetPort.dataset.port);
      else renderEdges();
    }
    if (graphInteraction.type === 'node' || graphInteraction.type === 'pan') saveLocalState();
    $$('.graph-node.is-dragging').forEach(el => el.classList.remove('is-dragging'));
    frame.classList.remove('is-panning');
    graphInteraction = null;
  });

  edgeLayer.addEventListener('click', e => {
    const group = e.target.closest('.edge-group');
    if (!group) return;
    e.stopPropagation();
    selectedEdgeId = group.dataset.edgeId;
    renderEdges();
  });

  window.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
      state.graph.edges = state.graph.edges.filter(edge => edge.id !== selectedEdgeId);
      selectedEdgeId = null;
      saveLocalState();
      renderEdges();
      renderStats();
      showToast('연결선을 삭제했습니다.');
    }
  });

  frame.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = frame.getBoundingClientRect();
    changeZoom(e.deltaY > 0 ? -.08 : .08, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, { passive: false });

  $('#zoomInBtn').addEventListener('click', () => changeZoom(.1));
  $('#zoomOutBtn').addEventListener('click', () => changeZoom(-.1));
  $('#zoomResetBtn').addEventListener('click', () => {
    state.graph.viewport = { x: 0, y: 0, scale: 1 };
    saveLocalState();
    applyViewport();
  });
}

bindEvents();
renderAll();
