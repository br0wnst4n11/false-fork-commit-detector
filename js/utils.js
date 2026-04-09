/* js/utils.js — Utility helpers for False Fork Commit Detector */

var Utils = (function () {

  /**
   * Format an ISO date string into a human-readable form.
   * @param {string} isoString
   * @returns {string}
   */
  function formatDate(isoString) {
    if (!isoString) return 'Unknown date';
    try {
      var d = new Date(isoString);
      return d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
      });
    } catch (e) {
      return isoString;
    }
  }

  /**
   * Truncate a commit message to maxLen characters.
   * @param {string} msg
   * @param {number} maxLen
   * @returns {string}
   */
  function truncateMessage(msg, maxLen) {
    if (!msg) return '';
    maxLen = maxLen || 72;
    var firstLine = msg.split('\n')[0];
    if (firstLine.length <= maxLen) return firstLine;
    return firstLine.slice(0, maxLen) + '…';
  }

  /**
   * Return display info for each classification.
   * @param {string} classification  one of: reachable, vouched, orphaned, suspicious
   * @returns {{ emoji: string, label: string, color: string, description: string }}
   */
  function getClassificationInfo(classification) {
    var map = {
      reachable: {
        emoji: '✅',
        label: 'Reachable',
        color: '#3fb950',
        description: 'This commit is reachable from the default branch or is the HEAD of a branch.'
      },
      vouched: {
        emoji: '🔏',
        label: 'Maintainer-Vouched',
        color: '#58a6ff',
        description: 'This commit has a verified cryptographic signature or is pointed to by a signed annotated tag.'
      },
      orphaned: {
        emoji: '⚠️',
        label: 'Orphaned',
        color: '#d29922',
        description: 'This commit is not reachable from any branch or tag. It exists in GitHub\'s object store but is not referenced by upstream refs.'
      },
      suspicious: {
        emoji: '🚨',
        label: 'Suspicious',
        color: '#f85149',
        description: 'This commit is unreachable, has no verified signature, no PR association, and no tag — it may be a false fork commit or impersonation attempt.'
      }
    };
    return map[classification] || {
      emoji: '❓',
      label: classification,
      color: '#8b949e',
      description: 'Unknown classification.'
    };
  }

  /**
   * Escape HTML entities to prevent XSS.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Return a relative-time string such as "3 hours ago".
   * @param {string} dateString
   * @returns {string}
   */
  function timeAgo(dateString) {
    if (!dateString) return '';
    try {
      var now = Date.now();
      var then = new Date(dateString).getTime();
      var diff = Math.floor((now - then) / 1000); // seconds (negative = future)

      if (diff < 0) {
        var absDiff = Math.abs(diff);
        if (absDiff < 60)    return 'in ' + absDiff + ' second' + (absDiff === 1 ? '' : 's');
        if (absDiff < 3600)  { var fm = Math.floor(absDiff / 60);   return 'in ' + fm + ' minute' + (fm === 1 ? '' : 's'); }
        if (absDiff < 86400) { var fh = Math.floor(absDiff / 3600); return 'in ' + fh + ' hour'   + (fh === 1 ? '' : 's'); }
        return 'in the future';
      }

      if (diff < 60)    return diff + ' second' + (diff === 1 ? '' : 's') + ' ago';
      if (diff < 3600)  { var m = Math.floor(diff / 60);   return m + ' minute' + (m === 1 ? '' : 's') + ' ago'; }
      if (diff < 86400) { var h = Math.floor(diff / 3600); return h + ' hour'   + (h === 1 ? '' : 's') + ' ago'; }
      var days = Math.floor(diff / 86400);
      if (days < 30)    return days + ' day'   + (days === 1 ? '' : 's') + ' ago';
      var months = Math.floor(days / 30);
      if (months < 12)  return months + ' month' + (months === 1 ? '' : 's') + ' ago';
      var years = Math.floor(months / 12);
      return years + ' year' + (years === 1 ? '' : 's') + ' ago';
    } catch (e) {
      return dateString;
    }
  }

  return {
    formatDate: formatDate,
    truncateMessage: truncateMessage,
    getClassificationInfo: getClassificationInfo,
    escapeHtml: escapeHtml,
    timeAgo: timeAgo
  };
})();
