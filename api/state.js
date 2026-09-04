const REPO = process.env.GITHUB_REPO || 'hey24blanket/blanket';
const STATE_PATH = process.env.GITHUB_STATE_PATH || 'data/blanket-state.json';
const STATE_BRANCH = process.env.GITHUB_STATE_BRANCH || 'blanket-state';
const TOKEN = process.env.GITHUB_TOKEN;
const API = 'https://api.github.com';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function headers() {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Blanket-Dashboard'
  };
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) }
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok) {
    const error = new Error(body?.message || `GitHub API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function encodeBase64Utf8(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function decodeBase64Utf8(value) {
  return Buffer.from(String(value).replace(/\n/g, ''), 'base64').toString('utf8');
}

function timeOf(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

module.exports = async function handler(req, res) {
  if (!TOKEN) {
    return send(res, 503, {
      error: 'Vercel 환경변수 GITHUB_TOKEN이 아직 없습니다. 로컬 자동저장은 정상 작동합니다.'
    });
  }

  const [owner, repo] = REPO.split('/');
  if (!owner || !repo) return send(res, 500, { error: 'GITHUB_REPO 형식은 owner/repo 여야 합니다.' });

  const encodedRef = encodeURIComponent(STATE_BRANCH);
  const contentPath = `/repos/${owner}/${repo}/contents/${STATE_PATH}`;
  const readPath = `${contentPath}?ref=${encodedRef}`;

  try {
    if (req.method === 'GET') {
      const file = await githubRequest(readPath);
      const state = JSON.parse(decodeBase64Utf8(file.content));
      return send(res, 200, { state, sha: file.sha, branch: STATE_BRANCH });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);

      const incoming = body?.state && body.state.graph ? body.state : body;
      const force = body?.force === true;
      const clientMode = body?.clientMode || 'manual';

      if (!incoming || !Array.isArray(incoming.apps) || !incoming.graph) {
        return send(res, 400, { error: '저장할 Blanket 상태 데이터 형식이 올바르지 않습니다.' });
      }

      let sha;
      let currentState = null;
      try {
        const current = await githubRequest(readPath);
        sha = current.sha;
        currentState = JSON.parse(decodeBase64Utf8(current.content));
      } catch (error) {
        if (error.status !== 404) throw error;
      }

      if (
        !force &&
        currentState?.syncMeta?.initialized === true &&
        timeOf(currentState.updatedAt) > timeOf(incoming.updatedAt)
      ) {
        return send(res, 409, {
          error: '서버에 더 최신 Blanket 상태가 있습니다.',
          state: currentState,
          branch: STATE_BRANCH
        });
      }

      const now = new Date().toISOString();
      const stateToSave = {
        ...incoming,
        updatedAt: incoming.updatedAt || now,
        syncMeta: {
          initialized: true,
          savedAt: now,
          clientMode
        }
      };

      const payload = {
        message: `Sync Blanket state ${now}`,
        content: encodeBase64Utf8(JSON.stringify(stateToSave, null, 2)),
        branch: STATE_BRANCH,
        ...(sha ? { sha } : {})
      };

      const saved = await githubRequest(contentPath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return send(res, 200, {
        ok: true,
        commit: saved.commit?.sha || null,
        state: stateToSave,
        branch: STATE_BRANCH
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'GET 또는 POST만 사용할 수 있습니다.' });
  } catch (error) {
    console.error(error);
    const detail = error.status === 401 || error.status === 403
      ? 'GitHub 토큰 권한을 확인해주세요. 저장소 내용을 읽고 쓸 수 있어야 합니다.'
      : error.message;
    return send(res, error.status && error.status < 600 ? error.status : 500, { error: detail });
  }
};
