(() => {
  const RECOVERY_KEY = 'blanket-sync-v2-recovery-complete';
  const PENDING_KEY = 'blanket-sync-v2-pending';
  const SERVER_SHA_KEY = 'blanket-sync-v2-server-sha';
  const POLL_MS = 12000;

  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  let syncReady = false;
  let syncTimer = null;
  let syncing = false;
  let applyingRemote = false;
  let serverSha = localStorage.getItem(SERVER_SHA_KEY) || null;

  const setupCopyButtons = () => {
    const grid = document.getElementById('appGrid');
    if (!grid) return;

    const style = document.createElement('style');
    style.textContent = `
      .copy-url-button {
        flex: 0 0 auto;
        min-height: 28px;
        padding: 0 9px;
        margin-left: auto;
        border: 1px solid var(--line, #2a2f39);
        border-radius: 8px;
        background: rgba(255,255,255,.035);
        color: var(--muted, #9aa3b3);
        font: inherit;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        -webkit-tap-highlight-color: transparent;
      }
      .copy-url-button:hover,
      .copy-url-button:focus-visible {
        border-color: rgba(215,255,99,.5);
        color: var(--accent, #d7ff63);
        outline: none;
      }
      .copy-url-button.is-copied {
        border-color: rgba(215,255,99,.55);
        background: rgba(215,255,99,.09);
        color: var(--accent, #d7ff63);
      }
      .copy-url-button + .open-link { margin-left: 6px; }
      @media (max-width: 820px) {
        .copy-url-button { min-height: 31px; padding-inline: 10px; font-size: 11px; }
      }
    `;
    document.head.appendChild(style);

    const fallbackCopy = text => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      area.remove();
      if (!ok) throw new Error('copy failed');
    };

    const copyText = async text => {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }
      fallbackCopy(text);
    };

    const decorate = () => {
      grid.querySelectorAll('.app-card').forEach(card => {
        if (card.querySelector('.copy-url-button')) return;
        const app = state.apps.find(item => item.id === card.dataset.appId);
        const footer = card.querySelector('.card-footer');
        if (!app || !footer) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy-url-button';
        button.dataset.copyAppUrl = app.id;
        button.setAttribute('aria-label', `${displayName(app)} 링크 복사`);
        button.title = '링크 복사';
        button.textContent = '⧉ 복사';

        const openLink = footer.querySelector('.open-link');
        if (openLink) footer.insertBefore(button, openLink);
        else footer.appendChild(button);
      });
    };

    grid.addEventListener('click', async event => {
      const button = event.target.closest('[data-copy-app-url]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();

      const app = state.apps.find(item => item.id === button.dataset.copyAppUrl);
      if (!app) return;

      try {
        await copyText(app.url);
        const original = button.textContent;
        button.textContent = '✓ 복사됨';
        button.classList.add('is-copied');
        showToast(`${displayName(app)} 링크를 복사했습니다.`);
        setTimeout(() => {
          if (!button.isConnected) return;
          button.textContent = original;
          button.classList.remove('is-copied');
        }, 1400);
      } catch {
        showToast('링크 복사에 실패했습니다.', true);
      }
    });

    new MutationObserver(() => requestAnimationFrame(decorate)).observe(grid, { childList: true });
    decorate();
  };

  setupCopyButtons();

  const timeOf = value => {
    const t = Date.parse(value || '');
    return Number.isFinite(t) ? t : 0;
  };

  const deepClone = value => JSON.parse(JSON.stringify(value));
  const localSnapshot = () => deepClone(state);

  const setServerSha = sha => {
    serverSha = sha || null;
    if (serverSha) localStorage.setItem(SERVER_SHA_KEY, serverSha);
    else localStorage.removeItem(SERVER_SHA_KEY);
  };

  const setPending = pending => {
    if (pending) localStorage.setItem(PENDING_KEY, '1');
    else localStorage.removeItem(PENDING_KEY);
  };

  const persistLocalWithoutTouchingTime = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  const setSyncStatus = (text, error = false) => {
    const box = document.querySelector('.autosave-state');
    if (!box) return;
    const strong = box.querySelector('strong');
    const tail = box.querySelector('span:last-child');
    if (strong) strong.textContent = text;
    if (tail) tail.textContent = error ? 'retry' : 'server';
    box.classList.toggle('is-sync-error', error);
  };

  const canonicalUrl = value => {
    try {
      const url = new URL(value);
      url.hash = '';
      const path = url.pathname.replace(/\/+$/, '') || '/';
      return `${url.protocol}//${url.host}${path}${url.search}`;
    } catch {
      return String(value || '').trim();
    }
  };

  const applyRemoteState = (remote, { notify = false } = {}) => {
    if (!remote || !Array.isArray(remote.apps) || !remote.graph) return false;
    applyingRemote = true;
    state = normalizeState(remote);
    persistLocalWithoutTouchingTime();
    renderAll();
    applyingRemote = false;
    if (notify) showToast('서버의 최신 Blanket 데이터를 반영했습니다.');
    return true;
  };

  const mergeLocalOnlyApps = (remote, local) => {
    if (!remote || !local) return { merged: remote, added: 0 };

    const merged = deepClone(remote);
    merged.apps = Array.isArray(merged.apps) ? merged.apps : [];
    merged.graph = merged.graph || { nodes: [], edges: [], viewport: { x: 0, y: 0, scale: 1 } };
    merged.graph.nodes = Array.isArray(merged.graph.nodes) ? merged.graph.nodes : [];

    const remoteIds = new Set(merged.apps.map(app => app.id));
    const remoteUrls = new Set(merged.apps.map(app => canonicalUrl(app.url)));
    const extras = (local.apps || []).filter(app => {
      const key = canonicalUrl(app.url);
      return !remoteIds.has(app.id) && !remoteUrls.has(key);
    });

    if (!extras.length) return { merged, added: 0 };

    extras.forEach(app => {
      merged.apps.push(deepClone(app));
      remoteIds.add(app.id);
      remoteUrls.add(canonicalUrl(app.url));

      const localNode = local.graph?.nodes?.find(node => node.type === 'app' && node.appId === app.id);
      if (localNode && !merged.graph.nodes.some(node => node.id === localNode.id || node.appId === app.id)) {
        merged.graph.nodes.push(deepClone(localNode));
      }
    });

    return { merged, added: extras.length };
  };

  const fetchServer = async () => {
    const response = await fetch('/api/state', { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '공용 상태 불러오기 실패');
    return result;
  };

  const postState = async ({
    force = false,
    silent = true,
    stateOverride = null,
    expectedSha = serverSha
  } = {}) => {
    if (syncing) return false;
    syncing = true;
    setSyncStatus('Saving…');

    const snapshot = stateOverride ? deepClone(stateOverride) : localSnapshot();

    try {
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: snapshot,
          force,
          expectedSha: force ? null : expectedSha,
          clientMode: isStandalone ? 'standalone' : 'browser'
        }),
        keepalive: true
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 409 && result.state) {
        setServerSha(result.sha || null);
        applyRemoteState(result.state, { notify: !silent });
        setPending(false);
        setSyncStatus('Synced');
        return false;
      }

      if (!response.ok) throw new Error(result.error || '공용 상태 저장 실패');

      setServerSha(result.sha || null);
      if (result.state?.updatedAt) state.updatedAt = result.state.updatedAt;
      persistLocalWithoutTouchingTime();
      setPending(false);
      setSyncStatus('Synced');
      if (!silent) showToast('서버에 현재 Blanket 상태를 저장했습니다.');
      return true;
    } catch (error) {
      setPending(true);
      setSyncStatus('Local only', true);
      if (!silent && error?.message) showToast(error.message, true);
      return false;
    } finally {
      syncing = false;
    }
  };

  const scheduleSync = () => {
    if (!syncReady || applyingRemote) return;
    setPending(true);
    setSyncStatus('Saving…');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => postState({ silent: true }), 650);
  };

  const originalSaveLocalState = saveLocalState;
  saveLocalState = function syncedSaveLocalState() {
    originalSaveLocalState();
    scheduleSync();
  };

  const pullLatest = async ({ notify = false } = {}) => {
    if (!syncReady || syncing || document.visibilityState === 'hidden') return false;
    if (localStorage.getItem(PENDING_KEY) === '1') return false;

    try {
      const result = await fetchServer();
      if (!result.sha || result.sha === serverSha) return false;
      setServerSha(result.sha);
      applyRemoteState(result.state, { notify });
      setSyncStatus('Synced');
      return true;
    } catch {
      setSyncStatus('Local only', true);
      return false;
    }
  };

  const bootstrap = async () => {
    const localBefore = localSnapshot();
    const previousKnownSha = serverSha;
    const hadPendingLocalChanges = localStorage.getItem(PENDING_KEY) === '1';

    setSyncStatus('Connecting…');

    try {
      const result = await fetchServer();
      const remote = result.state;
      setServerSha(result.sha || null);

      if (!remote?.syncMeta?.initialized) {
        state = normalizeState(localBefore);
        persistLocalWithoutTouchingTime();
        const seeded = await postState({ force: true, silent: true, stateOverride: state });
        syncReady = true;
        localStorage.setItem(RECOVERY_KEY, '1');
        if (seeded) showToast('현재 데이터를 서버 저장소와 연결했습니다.');
        return;
      }

      if (
        hadPendingLocalChanges &&
        previousKnownSha &&
        previousKnownSha === result.sha &&
        timeOf(localBefore.updatedAt) >= timeOf(remote.updatedAt)
      ) {
        state = normalizeState(localBefore);
        persistLocalWithoutTouchingTime();
        syncReady = true;
        await postState({ silent: true, expectedSha: result.sha });
        localStorage.setItem(RECOVERY_KEY, '1');
        return;
      }

      const recoveryDone = localStorage.getItem(RECOVERY_KEY) === '1';
      if (!recoveryDone && timeOf(localBefore.updatedAt) >= timeOf(remote.updatedAt)) {
        const { merged, added } = mergeLocalOnlyApps(remote, localBefore);
        if (added > 0) {
          state = normalizeState(merged);
          syncAppNodes();
          persistLocalWithoutTouchingTime();
          syncReady = true;
          const recovered = await postState({ silent: true, expectedSha: result.sha });
          localStorage.setItem(RECOVERY_KEY, '1');
          if (recovered) showToast(`로컬에만 있던 앱 ${added}개를 서버에 복구했습니다.`);
          return;
        }
      }

      applyRemoteState(remote);
      setPending(false);
      localStorage.setItem(RECOVERY_KEY, '1');
      syncReady = true;
      setSyncStatus('Synced');
    } catch (error) {
      syncReady = true;
      setSyncStatus('Local only', true);
      console.warn('Blanket shared sync unavailable:', error);
    }
  };

  window.addEventListener('focus', () => pullLatest({ notify: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pullLatest({ notify: false });
    else if (syncReady && localStorage.getItem(PENDING_KEY) === '1') postState({ silent: true });
  });
  window.addEventListener('online', () => {
    if (localStorage.getItem(PENDING_KEY) === '1') postState({ silent: false });
    else pullLatest({ notify: true });
  });

  setInterval(() => {
    if (document.visibilityState === 'visible') pullLatest({ notify: false });
  }, POLL_MS);

  bootstrap();
})();