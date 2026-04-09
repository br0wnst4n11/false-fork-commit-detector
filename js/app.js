/* js/app.js — Main application logic for False Fork Commit Detector */

(function () {
  'use strict';

  var RESULT_CACHE_PREFIX = 'ffd:';

  /* ── DOM refs ───────────────────────────────────────────── */
  var repoInput    = document.getElementById('repo-input');
  var shaInput     = document.getElementById('sha-input');
  var detectBtn    = document.getElementById('detect-btn');
  var loadingEl    = document.getElementById('loading');
  var resultsEl    = document.getElementById('results');
  var settingsToggle = document.getElementById('settings-toggle');
  var settingsPanel  = document.getElementById('settings-panel');
  var patInput     = document.getElementById('pat-input');
  var savePATBtn   = document.getElementById('save-pat-btn');
  var clearPATBtn  = document.getElementById('clear-pat-btn');

  /* ── Initialise PAT field ───────────────────────────────── */
  function initPat() {
    var saved = GitHubAPI.getPat();
    if (saved) patInput.value = saved;
  }

  /* ── Settings toggle ────────────────────────────────────── */
  settingsToggle.addEventListener('click', function () {
    var isOpen = settingsPanel.classList.toggle('open');
    settingsToggle.classList.toggle('open', isOpen);
    settingsToggle.setAttribute('aria-expanded', String(isOpen));
  });

  savePATBtn.addEventListener('click', function () {
    var token = patInput.value.trim();
    if (token) {
      GitHubAPI.savePat(token);
      showToast('PAT saved to localStorage.');
    }
  });

  clearPATBtn.addEventListener('click', function () {
    GitHubAPI.clearPat();
    patInput.value = '';
    showToast('PAT cleared.');
  });

  /* ── Simple toast notification ──────────────────────────── */
  function showToast(msg) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = [
      'position:fixed', 'bottom:1.5rem', 'right:1.5rem',
      'background:#21262d', 'border:1px solid #30363d', 'color:#e6edf3',
      'padding:.55rem 1rem', 'border-radius:8px', 'font-size:.82rem',
      'z-index:9999', 'box-shadow:0 4px 14px rgba(0,0,0,.5)',
      'animation:fadeIn .2s ease'
    ].join(';');
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2500);
  }

  /* ── Input validation ───────────────────────────────────── */
  function parseRepo(value) {
    // Accept "owner/repo" or full GitHub URL
    var clean = value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
    var parts = clean.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { owner: parts[0], repo: parts[1] };
    }
    return null;
  }

  function parseSha(value) {
    var clean = value.trim();
    if (/^[0-9a-f]{7,40}$/i.test(clean)) return clean;
    return null;
  }

  /* ── Result cache helpers ───────────────────────────────── */
  function resultCacheKey(owner, repo, sha) {
    return RESULT_CACHE_PREFIX + owner + '/' + repo + '/' + sha;
  }

  function getCachedResult(owner, repo, sha) {
    try {
      var raw = localStorage.getItem(resultCacheKey(owner, repo, sha));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function setCachedResult(owner, repo, sha, result) {
    try {
      localStorage.setItem(resultCacheKey(owner, repo, sha), JSON.stringify(result));
    } catch (e) {}
  }

  /* ── Show / hide helpers ────────────────────────────────── */
  function showLoading(msg) {
    loadingEl.querySelector('span').textContent = msg || 'Running detection pipeline…';
    loadingEl.classList.add('active');
    resultsEl.classList.remove('visible');
    resultsEl.innerHTML = '';
    detectBtn.disabled = true;
  }

  function hideLoading() {
    loadingEl.classList.remove('active');
    detectBtn.disabled = false;
  }

  /* ── Main detect flow ───────────────────────────────────── */
  function runDetect(owner, repo, sha, bypassCache) {
    showLoading('Running detection pipeline…');

    if (!bypassCache) {
      var cached = getCachedResult(owner, repo, sha);
      if (cached) {
        hideLoading();
        renderResults(cached, owner, repo, sha, true);
        return;
      }
    }

    var detector = CommitDetector.create(GitHubAPI);
    detector.detect(owner, repo, sha).then(function (result) {
      hideLoading();
      if (result.classification !== 'error') {
        setCachedResult(owner, repo, sha, result);
      }
      renderResults(result, owner, repo, sha, false);
    }).catch(function (err) {
      hideLoading();
      renderError(err.message || String(err));
    });
  }

  detectBtn.addEventListener('click', function () {
    var parsed = parseRepo(repoInput.value);
    var sha    = parseSha(shaInput.value);

    if (!parsed) {
      repoInput.focus();
      repoInput.style.borderColor = '#f85149';
      setTimeout(function () { repoInput.style.borderColor = ''; }, 1500);
      showToast('Please enter a valid owner/repo (e.g. torvalds/linux).');
      return;
    }
    if (!sha) {
      shaInput.focus();
      shaInput.style.borderColor = '#f85149';
      setTimeout(function () { shaInput.style.borderColor = ''; }, 1500);
      showToast('Please enter a valid commit SHA (7–40 hex characters).');
      return;
    }

    runDetect(parsed.owner, parsed.repo, sha, false);
  });

  // Allow Enter key in either field
  [repoInput, shaInput].forEach(function (el) {
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') detectBtn.click();
    });
  });

  /* ── Rendering ──────────────────────────────────────────── */

  function renderResults(result, owner, repo, sha, fromCache) {
    var html = '';

    if (result.classification === 'error') {
      html += renderErrorBox(result.error ? result.error.message : 'An unknown error occurred.');
    } else {
      html += renderClassification(result.classification, fromCache);
      if (result.commitData) html += renderCommitInfo(result.commitData, owner, repo, sha);
      if (result.signals && result.signals.length) html += renderSignals(result.signals);
      html += renderCheckDetails(result.checks, owner, repo, sha);
    }

    html += renderActions(owner, repo, sha, fromCache);

    resultsEl.innerHTML = html;
    resultsEl.classList.add('visible');

    // Wire up accordion items
    var headers = resultsEl.querySelectorAll('.accordion-header');
    headers.forEach(function (header) {
      header.addEventListener('click', function () {
        var expanded = this.getAttribute('aria-expanded') === 'true';
        this.setAttribute('aria-expanded', String(!expanded));
        var body = this.nextElementSibling;
        if (body) body.classList.toggle('open', !expanded);
      });
    });

    // Wire re-check button
    var recheckBtn = resultsEl.querySelector('#recheck-btn');
    if (recheckBtn) {
      recheckBtn.addEventListener('click', function () {
        runDetect(owner, repo, sha, true);
      });
    }
  }

  function renderClassification(classification, fromCache) {
    var info = Utils.getClassificationInfo(classification);
    var cacheBadgeHtml = fromCache
      ? '<span class="cache-badge">📦 Cached result</span>'
      : '';
    return '<div class="classification-banner ' + Utils.escapeHtml(classification) + '">' +
      '<div class="badge-left">' +
      '<span class="badge-emoji">' + info.emoji + '</span>' +
      '<div>' +
      '<div class="badge-label">' + Utils.escapeHtml(info.label) + '</div>' +
      '<div class="badge-description">' + Utils.escapeHtml(info.description) + '</div>' +
      '</div>' +
      '</div>' +
      cacheBadgeHtml +
      '</div>';
  }

  function renderCommitInfo(commitData, owner, repo, sha) {
    var avatarHtml = commitData.avatarUrl
      ? '<img class="commit-avatar" src="' + Utils.escapeHtml(commitData.avatarUrl) + '" alt="avatar" loading="lazy">'
      : '';
    var shortSha = sha.slice(0, 7);
    var authorLogin = commitData.authorLogin
      ? ' (<a href="https://github.com/' + Utils.escapeHtml(commitData.authorLogin) + '" target="_blank" rel="noopener noreferrer">@' + Utils.escapeHtml(commitData.authorLogin) + '</a>)'
      : '';

    var sigBadge = commitData.verified
      ? '<span class="pill pill-blue">✓ Verified signature</span>'
      : '<span class="pill pill-gray">Unverified</span>';

    return '<div class="commit-info">' +
      '<div class="commit-header">' +
      avatarHtml +
      '<div class="commit-meta">' +
      '<div class="commit-message">' + Utils.escapeHtml(Utils.truncateMessage(commitData.message, 120)) + '</div>' +
      '<div class="commit-sub">' +
      '<a href="' + Utils.escapeHtml(commitData.htmlUrl) + '" target="_blank" rel="noopener noreferrer">' + Utils.escapeHtml(shortSha) + '</a>' +
      ' · authored by <strong>' + Utils.escapeHtml(commitData.author) + '</strong>' +
      authorLogin +
      ' · ' + Utils.timeAgo(commitData.authorDate) +
      '</div>' +
      '<div class="commit-badges">' + sigBadge + '</div>' +
      '</div>' +
      '</div>' +
      '</div>';
  }

  function renderSignals(signals) {
    var items = signals.map(function (s) {
      return '<li><span class="signal-icon">' + s.icon + '</span><span>' + Utils.escapeHtml(s.text) + '</span></li>';
    }).join('');
    return '<ul class="signals-list">' + items + '</ul>';
  }

  function renderCheckDetails(checks, owner, repo, sha) {
    var steps = ['step1', 'step2', 'step3', 'step4', 'step5'];
    var items = steps.map(function (key, idx) {
      var check = checks[key];
      if (!check) return '';
      var statusClass = 'status-' + (check.status === 'pass' ? 'pass' : check.status === 'fail' ? 'fail' : check.status === 'warn' ? 'warn' : check.status === 'info' ? 'info' : 'skip');
      var statusLabel = check.status.toUpperCase();

      var dataHtml = '';
      if (check.apiUrl) {
        dataHtml += '<div class="check-api-url">' + Utils.escapeHtml(check.apiUrl) + '</div>';
      }
      if (check.error) {
        dataHtml += '<div style="color:#f85149;font-size:.8rem;margin-top:.3rem;">Error: ' + Utils.escapeHtml(check.error) + '</div>';
      }
      if (check.data) {
        dataHtml += '<div class="check-data">' + Utils.escapeHtml(JSON.stringify(check.data, null, 2)) + '</div>';
      }

      return '<div class="accordion-item">' +
        '<button class="accordion-header" aria-expanded="false">' +
        '<span class="accordion-step-num">' + (idx + 1) + '</span>' +
        '<span class="accordion-step-label">' + Utils.escapeHtml(check.name) + '</span>' +
        '<span class="accordion-status ' + statusClass + '">' + statusLabel + '</span>' +
        '<span class="accordion-arrow">▶</span>' +
        '</button>' +
        '<div class="accordion-body">' + dataHtml + '</div>' +
        '</div>';
    }).join('');

    return '<div class="accordion">' +
      '<div class="accordion-title">Detection Step Details</div>' +
      items +
      '</div>';
  }

  function renderActions(owner, repo, sha, fromCache) {
    var ghUrl = 'https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/commit/' + encodeURIComponent(sha);
    return '<div class="result-actions">' +
      '<a class="btn btn-secondary btn-sm" href="' + Utils.escapeHtml(ghUrl) + '" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a>' +
      (fromCache ? '<button class="btn btn-secondary btn-sm" id="recheck-btn">🔄 Re-check</button>' : '') +
      '</div>';
  }

  function renderErrorBox(message) {
    var title = 'Error';
    if (message && message.toLowerCase().includes('not found')) title = 'Commit Not Found';
    if (message && message.toLowerCase().includes('rate limit')) title = 'Rate Limit Exceeded';
    return '<div class="error-box">' +
      '<span class="error-icon">⚠️</span>' +
      '<div class="error-content">' +
      '<h3>' + Utils.escapeHtml(title) + '</h3>' +
      '<p>' + Utils.escapeHtml(message) + '</p>' +
      '</div>' +
      '</div>';
  }

  function renderError(message) {
    resultsEl.innerHTML = renderErrorBox(message);
    resultsEl.classList.add('visible');
  }

  /* ── Boot ───────────────────────────────────────────────── */
  initPat();

})();
