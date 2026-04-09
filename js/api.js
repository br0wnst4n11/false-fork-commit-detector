/* js/api.js — GitHub REST API wrapper for False Fork Commit Detector */

var GitHubAPI = (function () {

  var BASE_URL = 'https://api.github.com';
  var CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  var PAT_STORAGE_KEY = 'ghpat';

  /* ── Cache helpers ──────────────────────────────────────── */

  function cacheGet(url) {
    try {
      var raw = localStorage.getItem('ffcd:cache:' + url);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (Date.now() - entry.ts > CACHE_TTL_MS) {
        localStorage.removeItem('ffcd:cache:' + url);
        return null;
      }
      return entry.data;
    } catch (e) {
      return null;
    }
  }

  function cacheSet(url, data) {
    try {
      localStorage.setItem('ffcd:cache:' + url, JSON.stringify({ ts: Date.now(), data: data }));
    } catch (e) {
      // storage full or unavailable — ignore
    }
  }

  /* ── PAT helpers ────────────────────────────────────────── */

  function getPat() {
    try { return localStorage.getItem(PAT_STORAGE_KEY) || ''; } catch (e) { return ''; }
  }

  /* ── Core fetch wrapper ─────────────────────────────────── */

  function buildHeaders(extraHeaders) {
    var headers = Object.assign({ 'Accept': 'application/vnd.github+json' }, extraHeaders || {});
    var pat = getPat();
    if (pat) headers['Authorization'] = 'Bearer ' + pat;
    return headers;
  }

  function apiRequest(path, extraHeaders, bypassCache) {
    var url = BASE_URL + path;

    if (!bypassCache) {
      var cached = cacheGet(url);
      if (cached !== null) return Promise.resolve(cached);
    }

    return fetch(url, { headers: buildHeaders(extraHeaders) }).then(function (res) {
      if (res.status === 403) {
        var reset = res.headers.get('X-RateLimit-Reset');
        var resetMsg = '';
        if (reset) {
          var resetDate = new Date(parseInt(reset, 10) * 1000);
          resetMsg = ' Rate limit resets at ' + resetDate.toLocaleTimeString() + '.';
        }
        return res.json().then(function (body) {
          var msg = (body && body.message) ? body.message : 'API rate limit exceeded.';
          throw new RateLimitError(msg + resetMsg);
        }, function () {
          throw new RateLimitError('API rate limit exceeded.' + resetMsg);
        });
      }

      if (res.status === 404) {
        throw new NotFoundError('Resource not found: ' + path);
      }

      if (!res.ok) {
        return res.json().then(function (body) {
          var msg = (body && body.message) ? body.message : ('HTTP ' + res.status);
          throw new APIError(msg, res.status);
        }, function () {
          throw new APIError('HTTP ' + res.status, res.status);
        });
      }

      return res.json().then(function (data) {
        cacheSet(url, data);
        return data;
      });
    });
  }

  /* ── Custom error types ─────────────────────────────────── */

  function RateLimitError(message) {
    this.name = 'RateLimitError';
    this.message = message;
  }
  RateLimitError.prototype = Object.create(Error.prototype);

  function NotFoundError(message) {
    this.name = 'NotFoundError';
    this.message = message;
  }
  NotFoundError.prototype = Object.create(Error.prototype);

  function APIError(message, status) {
    this.name = 'APIError';
    this.message = message;
    this.status = status;
  }
  APIError.prototype = Object.create(Error.prototype);

  /* ── Public API methods ─────────────────────────────────── */

  function getCommit(owner, repo, sha) {
    return apiRequest('/repos/' + owner + '/' + repo + '/commits/' + sha);
  }

  function getRepo(owner, repo) {
    return apiRequest('/repos/' + owner + '/' + repo);
  }

  function compareCommits(owner, repo, base, head) {
    return apiRequest('/repos/' + owner + '/' + repo + '/compare/' + encodeURIComponent(base) + '...' + encodeURIComponent(head));
  }

  function getBranchesWhereHead(owner, repo, sha) {
    return apiRequest('/repos/' + owner + '/' + repo + '/commits/' + sha + '/branches-where-head');
  }

  function getCommitPulls(owner, repo, sha) {
    return apiRequest(
      '/repos/' + owner + '/' + repo + '/commits/' + sha + '/pulls',
      { 'Accept': 'application/vnd.github.groot-preview+json' }
    );
  }

  function getTags(owner, repo, page, perPage) {
    page = page || 1;
    perPage = perPage || 100;
    return apiRequest('/repos/' + owner + '/' + repo + '/tags?per_page=' + perPage + '&page=' + page);
  }

  function getGitRef(owner, repo, ref) {
    return apiRequest('/repos/' + owner + '/' + repo + '/git/ref/tags/' + encodeURIComponent(ref));
  }

  function getGitTag(owner, repo, sha) {
    return apiRequest('/repos/' + owner + '/' + repo + '/git/tags/' + sha);
  }

  function getRateLimit() {
    return apiRequest('/rate_limit', {}, true);
  }

  /* ── PAT management ─────────────────────────────────────── */

  function savePat(token) {
    try { localStorage.setItem(PAT_STORAGE_KEY, token); } catch (e) {}
  }

  function clearPat() {
    try { localStorage.removeItem(PAT_STORAGE_KEY); } catch (e) {}
  }

  /* ── Export ─────────────────────────────────────────────── */

  return {
    // API methods
    getCommit: getCommit,
    getRepo: getRepo,
    compareCommits: compareCommits,
    getBranchesWhereHead: getBranchesWhereHead,
    getCommitPulls: getCommitPulls,
    getTags: getTags,
    getGitRef: getGitRef,
    getGitTag: getGitTag,
    getRateLimit: getRateLimit,
    // PAT
    getPat: getPat,
    savePat: savePat,
    clearPat: clearPat,
    // Error constructors (for instanceof checks)
    RateLimitError: RateLimitError,
    NotFoundError: NotFoundError,
    APIError: APIError
  };
})();
