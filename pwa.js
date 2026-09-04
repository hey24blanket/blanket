(() => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  const TEST_APP_ID = 'app-desk';

  document.documentElement.classList.toggle('is-ios', isIOS);
  document.documentElement.classList.toggle('is-standalone', isStandalone);

  const style = document.createElement('style');
  style.textContent = `
    .safari-test-button {
      min-height: 27px;
      padding: 0 9px;
      border: 1px solid rgba(215,255,99,.35);
      border-radius: 999px;
      background: rgba(215,255,99,.08);
      color: var(--accent, #d7ff63);
      font: inherit;
      font-size: 9px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent;
    }
    .safari-test-button:active { transform: scale(.97); }
    @media (max-width: 820px) {
      .safari-test-button { min-height: 30px; font-size: 10px; }
    }
  `;
  document.head.appendChild(style);

  const toSafariScheme = url => {
    if (url.startsWith('https://')) return `x-safari-https://${url.slice('https://'.length)}`;
    if (url.startsWith('http://')) return `x-safari-http://${url.slice('http://'.length)}`;
    return null;
  };

  const openSafariTest = app => {
    const url = typeof safeUrl === 'function' ? safeUrl(app.url) : app.url;
    const safariUrl = url && toSafariScheme(url);
    if (!url || !safariUrl) return;

    let leftBlanket = false;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leftBlanket = true;
    };
    document.addEventListener('visibilitychange', onVisibility, { passive: true });
    window.addEventListener('pagehide', () => { leftBlanket = true; }, { once: true });

    if (typeof showToast === 'function') showToast('Safari 앱 열기를 시도합니다…');

    window.location.href = safariUrl;

    window.setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (!leftBlanket && document.visibilityState === 'visible') {
        if (typeof showToast === 'function') showToast('직접 실행이 안 되어 일반 외부 열기로 전환합니다.');
        window.location.href = url;
      }
    }, 1100);
  };

  const decorate = () => {
    if (!isIOS || !isStandalone) return;
    const grid = document.getElementById('appGrid');
    if (!grid || !window.state?.apps) return;

    const card = grid.querySelector(`.app-card[data-app-id="${TEST_APP_ID}"]`);
    if (!card || card.querySelector('.safari-test-button')) return;

    const app = state.apps.find(item => item.id === TEST_APP_ID);
    if (!app) return;

    const footer = card.querySelector('.card-footer');
    if (!footer) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'safari-test-button';
    button.textContent = 'Safari 테스트';
    button.title = 'Safari 앱 자체로 열기 테스트';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openSafariTest(app);
    });

    footer.appendChild(button);
  };

  const grid = document.getElementById('appGrid');
  if (grid) {
    new MutationObserver(() => requestAnimationFrame(decorate)).observe(grid, { childList: true, subtree: false });
  }

  decorate();
})();