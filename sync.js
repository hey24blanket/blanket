(() => {
  const SYNC_SEEN_KEY = 'blanket-shared-sync-seen-v1';
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  let syncReady = false;
  let syncTimer = null;
  let syncing = false;
  let applyingRemote = false;

  const timeOf = value => {
    const t = Date.parse(value || '');
    return Number.isFinite(t) ? t : 0;
  };

  const localSnapshot = () => JSON.parse(JSON.stringify(state));

  const applyRemoteState = remote => {
    if (!remote || !Array.isArray(remote.apps) || !remote.graph) return false;
    applyingRemote = true;
    state = normalizeState(remote);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
    applyingRemote = false;
    return true;
  };

  const postState = async ({ force = false, silent = true } = {}) => {
    if (syncing) return false;
    syncing = true;
    try {
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: localSnapshot(),
          force,
          clientMode: isStandalone ? 'standalone' : 'browser'
        })
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 409 && result.state) {
        applyRemoteState(result.state);
        localStorage.setItem(SYNC_SEEN_KEY, '1');
        if (!silent) showToast('다른 화면의 최신 상태를 불러왔습니다.');
        return true;
      }
      if (!response.ok) throw new Error(result.error || '공용 상태 저장 실패');

      localStorage.setItem(SYNC_SEEN_KEY, '1');
      if (!silent) showToast('Safari · 독립앱 상태를 동기화했습니다.');
      return true;
    } catch (error) {
      if (!silent && error?.message) showToast(error.message, true);
      return false;
    } finally {
      syncing = false;
    }
  };

  const scheduleSync = () => {
    if (!syncReady || applyingRemote) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => postState({ silent: true }), 1200);
  };

  const originalSaveLocalState = saveLocalState;
  saveLocalState = function syncedSaveLocalState() {
    originalSaveLocalState();
    scheduleSync();
  };

  const bootstrap = async () => {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));

      if (response.status === 503) return;
      if (!response.ok) throw new Error(result.error || '공용 상태 불러오기 실패');

      const remote = result.state;
      const initialized = remote?.syncMeta?.initialized === true;
      const hasSeenShared = localStorage.getItem(SYNC_SEEN_KEY) === '1';

      if (!initialized) {
        if (isStandalone) {
          showToast('Safari 데이터 연결 대기 중 · Safari에서 Blanket을 한 번 열어주세요.');
          return;
        }

        const seeded = await postState({ force: true, silent: true });
        if (seeded) {
          syncReady = true;
          showToast('Safari 데이터를 공용 상태로 연결했습니다.');
        }
        return;
      }

      if (isStandalone && !hasSeenShared) {
        applyRemoteState(remote);
        localStorage.setItem(SYNC_SEEN_KEY, '1');
        syncReady = true;
        showToast('Safari에서 쓰던 Blanket 데이터를 가져왔습니다.');
        return;
      }

      const remoteTime = timeOf(remote.updatedAt);
      const localTime = timeOf(state.updatedAt);

      if (remoteTime > localTime) {
        applyRemoteState(remote);
        localStorage.setItem(SYNC_SEEN_KEY, '1');
      } else if (localTime > remoteTime) {
        await postState({ silent: true });
      } else {
        localStorage.setItem(SYNC_SEEN_KEY, '1');
      }

      syncReady = true;
    } catch (error) {
      console.warn('Blanket shared sync unavailable:', error);
    }
  };

  window.addEventListener('focus', () => {
    if (!syncReady) return;
    fetch('/api/state', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(result => {
        const remote = result?.state;
        if (remote && timeOf(remote.updatedAt) > timeOf(state.updatedAt)) {
          applyRemoteState(remote);
          localStorage.setItem(SYNC_SEEN_KEY, '1');
          showToast('다른 화면에서 변경한 내용을 반영했습니다.');
        }
      })
      .catch(() => {});
  });

  bootstrap();
})();