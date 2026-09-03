(() => {
  const LAYOUT_STORAGE_KEY = 'blanket-app-layout-v1';
  const appGrid = document.getElementById('appGrid');
  const sectionActions = document.querySelector('#appsView .section-actions');
  const addAppButton = document.getElementById('addAppBtn');

  if (appGrid && sectionActions && addAppButton) {
    const toggle = document.createElement('div');
    toggle.className = 'app-layout-toggle';
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', '앱 보기 방식');
    toggle.innerHTML = `
      <button type="button" class="layout-toggle-button" data-layout="thumbnail" aria-label="썸네일로 보기" title="썸네일로 보기">
        <span class="layout-icon" aria-hidden="true">▦</span><span>썸네일</span>
      </button>
      <button type="button" class="layout-toggle-button" data-layout="list" aria-label="리스트로 보기" title="리스트로 보기">
        <span class="layout-icon" aria-hidden="true">☰</span><span>리스트</span>
      </button>`;

    sectionActions.insertBefore(toggle, addAppButton);

    const setAppLayout = (layout, persist = true) => {
      const normalized = layout === 'list' ? 'list' : 'thumbnail';
      appGrid.classList.toggle('is-list-view', normalized === 'list');
      appGrid.dataset.layout = normalized;
      toggle.querySelectorAll('[data-layout]').forEach(button => {
        const active = button.dataset.layout === normalized;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (persist) localStorage.setItem(LAYOUT_STORAGE_KEY, normalized);
    };

    toggle.addEventListener('click', event => {
      const button = event.target.closest('[data-layout]');
      if (!button) return;
      setAppLayout(button.dataset.layout);
    });

    setAppLayout(localStorage.getItem(LAYOUT_STORAGE_KEY) || 'thumbnail', false);
  }

  const frame = document.getElementById('mapFrame');
  const nodeLayer = document.getElementById('nodeLayer');
  if (!frame || !nodeLayer || !window.PointerEvent) return;

  const isTouchLike = window.matchMedia?.('(pointer: coarse)').matches;
  if (isTouchLike) {
    const tip = document.querySelector('.map-mini-tip');
    if (tip) tip.textContent = '한 손가락 드래그: 맵 이동 · 노드 제목 드래그: 노드 이동';
  }

  frame.classList.add('touch-map-enabled');

  const activePointers = new Map();
  let touchInteraction = null;
  let pinchInteraction = null;

  const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pointCenter = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const getTwoPointers = () => [...activePointers.values()].slice(0, 2);

  const beginPinch = () => {
    const [a, b] = getTwoPointers();
    if (!a || !b) return;
    const rect = frame.getBoundingClientRect();
    const center = pointCenter(a, b);
    const localCenter = { x: center.x - rect.left, y: center.y - rect.top };
    const startScale = state.graph.viewport.scale;
    pinchInteraction = {
      startDistance: Math.max(1, pointDistance(a, b)),
      startScale,
      worldX: (localCenter.x - state.graph.viewport.x) / startScale,
      worldY: (localCenter.y - state.graph.viewport.y) / startScale
    };
    touchInteraction = null;
    document.querySelectorAll('.graph-node.is-dragging').forEach(el => el.classList.remove('is-dragging'));
    frame.classList.add('is-panning');
  };

  const updatePinch = () => {
    const [a, b] = getTwoPointers();
    if (!a || !b || !pinchInteraction) return;
    const rect = frame.getBoundingClientRect();
    const center = pointCenter(a, b);
    const localX = center.x - rect.left;
    const localY = center.y - rect.top;
    const ratio = pointDistance(a, b) / pinchInteraction.startDistance;
    const nextScale = clamp(pinchInteraction.startScale * ratio, .35, 1.6);
    state.graph.viewport.scale = nextScale;
    state.graph.viewport.x = localX - pinchInteraction.worldX * nextScale;
    state.graph.viewport.y = localY - pinchInteraction.worldY * nextScale;
    applyViewport();
  };

  const finishTouchGesture = (event) => {
    if (event.pointerType !== 'touch') return;

    const endedInteraction = touchInteraction;
    const wasPinching = Boolean(pinchInteraction);

    if (endedInteraction?.type === 'connect') {
      const targetPort = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('.node-port');
      const targetNode = targetPort?.closest('.graph-node');
      if (targetPort && targetNode) {
        addEdge(endedInteraction.nodeId, endedInteraction.port, targetNode.dataset.nodeId, targetPort.dataset.port);
      } else {
        renderEdges();
      }
    }

    if (endedInteraction?.type === 'node' || endedInteraction?.type === 'pan' || wasPinching) saveLocalState();

    activePointers.delete(event.pointerId);
    try { frame.releasePointerCapture(event.pointerId); } catch {}

    if (activePointers.size < 2) pinchInteraction = null;
    if (activePointers.size === 0) {
      touchInteraction = null;
      frame.classList.remove('is-panning');
      document.querySelectorAll('.graph-node.is-dragging').forEach(el => el.classList.remove('is-dragging'));
    } else if (wasPinching) {
      touchInteraction = null;
    }
  };

  frame.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;

    if (event.target.closest('.map-corner-tools, [data-node-delete], button, a, input, textarea, select, dialog')) return;

    event.preventDefault();
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { frame.setPointerCapture(event.pointerId); } catch {}

    if (activePointers.size === 2) {
      beginPinch();
      return;
    }
    if (activePointers.size > 2) return;

    const nodeEl = event.target.closest('.graph-node');
    if (nodeEl) {
      const node = state.graph.nodes.find(item => item.id === nodeEl.dataset.nodeId);
      if (!node) return;

      const port = event.target.closest('.node-port');
      if (port) {
        const startWorld = nodeCenter(node.id, port.dataset.port);
        touchInteraction = { type: 'connect', nodeId: node.id, port: port.dataset.port, startWorld };
        renderEdges({ from: startWorld, to: startWorld });
        return;
      }

      if (event.target.closest('.node-head')) {
        const world = clientToWorld(event.clientX, event.clientY);
        touchInteraction = {
          type: 'node',
          nodeId: node.id,
          offsetX: world.x - node.x,
          offsetY: world.y - node.y
        };
        nodeEl.classList.add('is-dragging');
      }
      return;
    }

    selectedEdgeId = null;
    renderEdges();
    touchInteraction = {
      type: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: state.graph.viewport.x,
      startY: state.graph.viewport.y
    };
    frame.classList.add('is-panning');
  }, { passive: false });

  frame.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch' || !activePointers.has(event.pointerId)) return;
    event.preventDefault();
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size >= 2) {
      if (!pinchInteraction) beginPinch();
      updatePinch();
      return;
    }

    if (!touchInteraction) return;

    if (touchInteraction.type === 'pan') {
      state.graph.viewport.x = touchInteraction.startX + event.clientX - touchInteraction.startClientX;
      state.graph.viewport.y = touchInteraction.startY + event.clientY - touchInteraction.startClientY;
      applyViewport();
      return;
    }

    if (touchInteraction.type === 'node') {
      const node = state.graph.nodes.find(item => item.id === touchInteraction.nodeId);
      if (!node) return;
      const world = clientToWorld(event.clientX, event.clientY);
      node.x = clamp(world.x - touchInteraction.offsetX, 0, WORLD_WIDTH - 250);
      node.y = clamp(world.y - touchInteraction.offsetY, 0, WORLD_HEIGHT - 120);
      const nodeEl = document.querySelector(`.graph-node[data-node-id="${CSS.escape(node.id)}"]`);
      if (nodeEl) {
        nodeEl.style.left = `${node.x}px`;
        nodeEl.style.top = `${node.y}px`;
      }
      renderEdges();
      return;
    }

    if (touchInteraction.type === 'connect') {
      renderEdges({ from: touchInteraction.startWorld, to: clientToWorld(event.clientX, event.clientY) });
    }
  }, { passive: false });

  frame.addEventListener('pointerup', finishTouchGesture, { passive: false });
  frame.addEventListener('pointercancel', finishTouchGesture, { passive: false });
})();