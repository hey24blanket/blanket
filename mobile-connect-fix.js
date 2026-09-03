(() => {
  const frame = document.getElementById('mapFrame');
  if (!frame || !window.PointerEvent) return;

  let pendingConnection = null;

  const clearPending = () => {
    pendingConnection = null;
    document.querySelectorAll('.node-port.is-connection-source').forEach(el => {
      el.classList.remove('is-connection-source');
    });
  };

  const markPending = (nodeEl, portEl) => {
    clearPending();
    pendingConnection = {
      nodeId: nodeEl.dataset.nodeId,
      port: portEl.dataset.port
    };
    portEl.classList.add('is-connection-source');
    showToast('연결 시작 · 연결할 노드의 점을 한 번 더 누르세요.');
  };

  const tip = document.querySelector('.map-mini-tip');
  if (tip && window.matchMedia?.('(pointer: coarse)').matches) {
    tip.textContent = '연결: 점 탭 → 다른 점 탭 · 빈 공간 드래그: 맵 이동';
  }

  frame.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    const portEl = event.target.closest('.node-port');
    if (!portEl) return;
    const nodeEl = portEl.closest('.graph-node');
    if (!nodeEl) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const target = {
      nodeId: nodeEl.dataset.nodeId,
      port: portEl.dataset.port
    };

    if (!pendingConnection) {
      markPending(nodeEl, portEl);
      return;
    }

    if (pendingConnection.nodeId === target.nodeId && pendingConnection.port === target.port) {
      clearPending();
      renderEdges();
      showToast('연결을 취소했습니다.');
      return;
    }

    if (pendingConnection.nodeId === target.nodeId) {
      clearPending();
      showToast('서로 다른 노드를 선택해주세요.', true);
      return;
    }

    const source = { ...pendingConnection };
    clearPending();
    addEdge(source.nodeId, source.port, target.nodeId, target.port);
  }, { capture: true, passive: false });

  frame.addEventListener('pointerup', event => {
    if (event.pointerType !== 'touch') return;
    if (!event.target.closest('.node-port')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, passive: false });

  frame.addEventListener('pointercancel', event => {
    if (event.pointerType !== 'touch') return;
    if (!event.target.closest('.node-port')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, passive: false });
})();