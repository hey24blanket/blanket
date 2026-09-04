(() => {
  const grid = document.getElementById('appGrid');
  if (!grid || !window.PointerEvent) return;

  const INTERACTIVE = 'a, button, input, textarea, select, [contenteditable="true"], .app-rating, .card-menu, .preview-overlay';
  const HOLD_MS = 280;
  const TOUCH_CANCEL_DISTANCE = 12;
  const MOUSE_DRAG_DISTANCE = 5;

  let candidate = null;
  let drag = null;
  let suppressClickUntil = 0;

  const clearDropMarkers = () => {
    grid.querySelectorAll('.is-reorder-before, .is-reorder-after').forEach(card => {
      card.classList.remove('is-reorder-before', 'is-reorder-after');
    });
  };

  const clearCandidate = () => {
    if (candidate?.timer) clearTimeout(candidate.timer);
    candidate = null;
  };

  const makeGhost = card => {
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('app-reorder-ghost');
    ghost.classList.remove('is-reorder-source', 'is-reorder-before', 'is-reorder-after');
    ghost.querySelectorAll('iframe').forEach(frame => frame.remove());
    ghost.querySelectorAll('.card-menu-popover').forEach(menu => { menu.hidden = true; });
    Object.assign(ghost.style, {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      left: `${rect.left}px`,
      top: `${rect.top}px`
    });
    document.body.appendChild(ghost);
    return { ghost, rect };
  };

  const beginDrag = eventLike => {
    if (!candidate || drag) return;
    const card = candidate.card;
    if (!document.body.contains(card)) return clearCandidate();

    const { ghost, rect } = makeGhost(card);
    drag = {
      pointerId: candidate.pointerId,
      sourceId: candidate.appId,
      sourceCard: card,
      ghost,
      offsetX: candidate.lastX - rect.left,
      offsetY: candidate.lastY - rect.top,
      targetId: null,
      before: true
    };

    card.classList.add('is-reorder-source');
    document.body.classList.add('is-app-reordering');
    if (navigator.vibrate) navigator.vibrate(20);
    suppressClickUntil = Date.now() + 700;
    showToast('순서 변경 · 원하는 위치로 드래그하세요.');
    positionGhost(candidate.lastX, candidate.lastY);
  };

  const positionGhost = (x, y) => {
    if (!drag) return;
    drag.ghost.style.left = `${x - drag.offsetX}px`;
    drag.ghost.style.top = `${y - drag.offsetY}px`;
  };

  const chooseBefore = (target, x, y) => {
    const rect = target.getBoundingClientRect();
    if (grid.classList.contains('is-list-view')) return y < rect.top + rect.height / 2;
    const verticalOffset = y - (rect.top + rect.height / 2);
    if (Math.abs(verticalOffset) > rect.height * .28) return verticalOffset < 0;
    return x < rect.left + rect.width / 2;
  };

  const updateDropTarget = (x, y) => {
    if (!drag) return;
    clearDropMarkers();
    const target = document.elementFromPoint(x, y)?.closest?.('.app-card');
    if (!target || target === drag.sourceCard || target.hidden) {
      drag.targetId = null;
      return;
    }

    const before = chooseBefore(target, x, y);
    drag.targetId = target.dataset.appId;
    drag.before = before;
    target.classList.add(before ? 'is-reorder-before' : 'is-reorder-after');
  };

  const autoScroll = y => {
    const edge = 72;
    if (y < edge) window.scrollBy({ top: -12, behavior: 'auto' });
    else if (y > window.innerHeight - edge) window.scrollBy({ top: 12, behavior: 'auto' });
  };

  const commitOrder = () => {
    if (!drag?.targetId) return false;
    const fromIndex = state.apps.findIndex(app => app.id === drag.sourceId);
    if (fromIndex < 0) return false;

    const [moved] = state.apps.splice(fromIndex, 1);
    let targetIndex = state.apps.findIndex(app => app.id === drag.targetId);
    if (targetIndex < 0) {
      state.apps.splice(fromIndex, 0, moved);
      return false;
    }
    if (!drag.before) targetIndex += 1;
    state.apps.splice(targetIndex, 0, moved);
    saveLocalState();
    renderApps();
    showToast(`${displayName(moved)} 순서를 변경했습니다.`);
    return true;
  };

  const finishDrag = () => {
    if (!drag) return;
    const source = drag.sourceCard;
    commitOrder();
    source?.classList.remove('is-reorder-source');
    drag.ghost?.remove();
    clearDropMarkers();
    document.body.classList.remove('is-app-reordering');
    drag = null;
    clearCandidate();
  };

  grid.addEventListener('pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest(INTERACTIVE)) return;
    const card = event.target.closest('.app-card');
    if (!card || card.hidden) return;

    clearCandidate();
    candidate = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      card,
      appId: card.dataset.appId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      timer: null
    };

    try { card.setPointerCapture(event.pointerId); } catch {}

    if (event.pointerType === 'mouse') {
      candidate.timer = setTimeout(() => beginDrag(event), 120);
    } else {
      candidate.timer = setTimeout(() => beginDrag(event), HOLD_MS);
    }
  }, { passive: true });

  grid.addEventListener('pointermove', event => {
    if (!candidate || candidate.pointerId !== event.pointerId) return;
    candidate.lastX = event.clientX;
    candidate.lastY = event.clientY;

    const distance = Math.hypot(event.clientX - candidate.startX, event.clientY - candidate.startY);

    if (!drag) {
      if (candidate.pointerType === 'mouse' && distance >= MOUSE_DRAG_DISTANCE) {
        beginDrag(event);
      } else if (candidate.pointerType !== 'mouse' && distance > TOUCH_CANCEL_DISTANCE) {
        clearCandidate();
      }
      return;
    }

    event.preventDefault();
    positionGhost(event.clientX, event.clientY);
    updateDropTarget(event.clientX, event.clientY);
    autoScroll(event.clientY);
  }, { passive: false });

  const endPointer = event => {
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault();
      finishDrag();
      return;
    }
    if (candidate?.pointerId === event.pointerId) clearCandidate();
  };

  grid.addEventListener('pointerup', endPointer, { passive: false });
  grid.addEventListener('pointercancel', endPointer, { passive: false });

  grid.addEventListener('click', event => {
    if (Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();