(() => {
  const FILTER_STORAGE_KEY = 'blanket-rating-filter-v1';
  const appGrid = document.getElementById('appGrid');
  const statsStrip = document.querySelector('#appsView .stats-strip');
  const emptyApps = document.getElementById('emptyApps');
  if (!appGrid || !statsStrip || !emptyApps) return;

  const originalEmptyTitle = emptyApps.querySelector('h3')?.textContent || '등록된 앱이 없습니다';
  const originalEmptyCopy = emptyApps.querySelector('p')?.textContent || '';
  const allowedFilters = new Set(['all', '0', '1', '2', '3', '4', '5']);
  let ratingFilter = localStorage.getItem(FILTER_STORAGE_KEY) || 'all';
  if (!allowedFilters.has(ratingFilter)) ratingFilter = 'all';

  const normalizeRating = value => Math.max(0, Math.min(5, Number(value) || 0));
  const starsText = value => '★'.repeat(Number(value));

  const filterBar = document.createElement('div');
  filterBar.className = 'rating-filter-bar';
  filterBar.innerHTML = `
    <span class="rating-filter-title">별점</span>
    <div class="rating-filter-options" role="group" aria-label="별점별 앱 모아보기"></div>`;
  statsStrip.insertAdjacentElement('afterend', filterBar);
  const filterOptions = filterBar.querySelector('.rating-filter-options');

  const getCounts = () => {
    const counts = [0, 0, 0, 0, 0, 0];
    state.apps.forEach(app => { counts[normalizeRating(app.rating)] += 1; });
    return counts;
  };

  const renderFilterButtons = () => {
    const counts = getCounts();
    const items = [
      { value: 'all', label: '전체', count: state.apps.length },
      { value: '0', label: '☆ 미평가', count: counts[0] },
      ...[1, 2, 3, 4, 5].map(value => ({ value: String(value), label: starsText(value), count: counts[value] }))
    ];

    filterOptions.innerHTML = items.map(item => `
      <button type="button" class="rating-filter-button${ratingFilter === item.value ? ' is-active' : ''}" data-star-filter="${item.value}" aria-pressed="${ratingFilter === item.value}">
        <span>${item.label}</span><b>${item.count}</b>
      </button>`).join('');
  };

  const updateRatingControl = (card, rating) => {
    const control = card.querySelector('.app-rating');
    if (!control) return;
    control.dataset.rating = String(rating);
    control.querySelectorAll('[data-rate]').forEach(button => {
      const value = Number(button.dataset.rate);
      const active = value <= rating;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', value === rating ? 'true' : 'false');
    });
    const valueLabel = control.querySelector('.rating-value');
    if (valueLabel) valueLabel.textContent = rating ? `${rating}/5` : '미평가';
  };

  const decorateCards = () => {
    appGrid.querySelectorAll('.app-card').forEach(card => {
      const app = state.apps.find(item => item.id === card.dataset.appId);
      if (!app) return;
      const rating = normalizeRating(app.rating);
      app.rating = rating;

      let control = card.querySelector('.app-rating');
      if (!control) {
        control = document.createElement('div');
        control.className = 'app-rating';
        control.innerHTML = `
          <span class="rating-label">우선순위</span>
          <div class="rating-stars" role="group" aria-label="별점 지정">
            ${[1, 2, 3, 4, 5].map(value => `<button type="button" data-rate="${value}" aria-label="${value}점으로 지정" title="${value}점">★</button>`).join('')}
          </div>
          <span class="rating-value"></span>`;
        const footer = card.querySelector('.card-footer');
        if (footer) footer.insertAdjacentElement('beforebegin', control);
        else card.querySelector('.card-body')?.appendChild(control);
      }
      updateRatingControl(card, rating);
    });
  };

  const applyRatingFilter = () => {
    const cards = [...appGrid.querySelectorAll('.app-card')];
    let visibleCount = 0;

    cards.forEach(card => {
      const app = state.apps.find(item => item.id === card.dataset.appId);
      const rating = normalizeRating(app?.rating);
      const visible = ratingFilter === 'all' || rating === Number(ratingFilter);
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    const title = emptyApps.querySelector('h3');
    const copy = emptyApps.querySelector('p');
    if (cards.length === 0) {
      emptyApps.hidden = false;
      if (title) title.textContent = originalEmptyTitle;
      if (copy) copy.textContent = originalEmptyCopy;
    } else if (visibleCount === 0) {
      emptyApps.hidden = false;
      if (title) title.textContent = '해당 별점의 앱이 없습니다';
      if (copy) copy.textContent = '다른 별점을 선택하거나 앱의 별점을 바꿔보세요.';
    } else {
      emptyApps.hidden = true;
      if (title) title.textContent = originalEmptyTitle;
      if (copy) copy.textContent = originalEmptyCopy;
    }
  };

  const refreshRatings = () => {
    decorateCards();
    renderFilterButtons();
    applyRatingFilter();
  };

  filterOptions.addEventListener('click', event => {
    const button = event.target.closest('[data-star-filter]');
    if (!button) return;
    ratingFilter = button.dataset.starFilter;
    localStorage.setItem(FILTER_STORAGE_KEY, ratingFilter);
    renderFilterButtons();
    applyRatingFilter();
  });

  appGrid.addEventListener('click', event => {
    const star = event.target.closest('[data-rate]');
    if (!star) return;
    event.preventDefault();
    event.stopPropagation();

    const card = star.closest('.app-card');
    const app = state.apps.find(item => item.id === card?.dataset.appId);
    if (!card || !app) return;

    const requested = Number(star.dataset.rate);
    const current = normalizeRating(app.rating);
    app.rating = current === requested ? 0 : requested;
    saveLocalState();
    updateRatingControl(card, app.rating);
    renderFilterButtons();
    applyRatingFilter();
    showToast(app.rating ? `${displayName(app)} · ${app.rating}점으로 지정했습니다.` : `${displayName(app)} · 별점을 지웠습니다.`);
  });

  const observer = new MutationObserver(() => requestAnimationFrame(refreshRatings));
  observer.observe(appGrid, { childList: true });

  if (typeof createOrUpdateApp === 'function') {
    const baseCreateOrUpdateApp = createOrUpdateApp;
    createOrUpdateApp = function preserveRatingOnEdit() {
      const editingId = document.getElementById('appIdInput')?.value || '';
      const previousRating = editingId ? normalizeRating(state.apps.find(app => app.id === editingId)?.rating) : 0;
      const result = baseCreateOrUpdateApp();
      if (result && editingId) {
        const edited = state.apps.find(app => app.id === editingId);
        if (edited) {
          edited.rating = previousRating;
          saveLocalState();
          renderApps();
        }
      }
      return result;
    };
  }

  refreshRatings();
})();