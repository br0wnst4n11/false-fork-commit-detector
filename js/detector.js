/* js/detector.js — 5-step detection pipeline for False Fork Commit Detector */

var CommitDetector = (function () {

  /**
   * Create a new CommitDetector bound to a GitHubAPI instance.
   * @param {object} api  GitHubAPI object
   */
  function create(api) {

    /**
     * Run the full 5-step detection pipeline.
     * @param {string} owner
     * @param {string} repo
     * @param {string} sha
     * @returns {Promise<object>} result
     */
    async function detect(owner, repo, sha) {
      var result = {
        classification: 'orphaned',
        signals: [],
        commitData: null,
        checks: {
          step1: { name: 'Commit Existence & Metadata',    status: 'skip', apiUrl: '', data: null, error: null },
          step2: { name: 'Default Branch Containment',     status: 'skip', apiUrl: '', data: null, error: null },
          step3: { name: 'HEAD of Branch Check',           status: 'skip', apiUrl: '', data: null, error: null },
          step4: { name: 'Pull Request Association',       status: 'skip', apiUrl: '', data: null, error: null },
          step5: { name: 'Tag Reachability',               status: 'skip', apiUrl: '', data: null, error: null }
        }
      };

      var hasVerifiedSignature = false;
      var isReachable = false;
      var isHeadOfBranch = false;
      var hasPR = false;
      var hasTag = false;
      var hasSignedTag = false;

      /* ── Step 1: Commit existence & metadata ──────────────── */
      var step1 = result.checks.step1;
      step1.apiUrl = 'GET /repos/' + owner + '/' + repo + '/commits/' + sha;
      try {
        var commitData = await api.getCommit(owner, repo, sha);
        step1.status = 'pass';
        step1.data = {
          sha: commitData.sha,
          author: commitData.commit && commitData.commit.author ? commitData.commit.author.name : 'Unknown',
          authorEmail: commitData.commit && commitData.commit.author ? commitData.commit.author.email : '',
          authorDate: commitData.commit && commitData.commit.author ? commitData.commit.author.date : '',
          committer: commitData.commit && commitData.commit.committer ? commitData.commit.committer.name : 'Unknown',
          committerDate: commitData.commit && commitData.commit.committer ? commitData.commit.committer.date : '',
          message: commitData.commit ? commitData.commit.message : '',
          verified: commitData.commit && commitData.commit.verification ? commitData.commit.verification.verified : false,
          verificationReason: commitData.commit && commitData.commit.verification ? commitData.commit.verification.reason : '',
          avatarUrl: commitData.author ? commitData.author.avatar_url : null,
          htmlUrl: commitData.html_url || ('https://github.com/' + owner + '/' + repo + '/commit/' + sha),
          authorLogin: commitData.author ? commitData.author.login : null
        };
        result.commitData = step1.data;

        if (step1.data.verified) {
          hasVerifiedSignature = true;
          result.signals.push({ icon: '🔑', text: 'Commit has a verified cryptographic signature.' });
        } else {
          result.signals.push({ icon: '🔓', text: 'Commit signature is not verified (reason: ' + (step1.data.verificationReason || 'none') + ').' });
        }
      } catch (err) {
        step1.status = 'fail';
        step1.error = err.message;
        result.classification = 'error';
        result.error = err;
        return result;
      }

      /* ── Step 2: Default branch containment ───────────────── */
      var step2 = result.checks.step2;
      try {
        var repoData = await api.getRepo(owner, repo);
        var defaultBranch = repoData.default_branch || 'main';
        step2.apiUrl = 'GET /repos/' + owner + '/' + repo + '/compare/' + defaultBranch + '...' + sha;

        try {
          var comparison = await api.compareCommits(owner, repo, defaultBranch, sha);
          var compareStatus = comparison.status; // "ahead" | "behind" | "identical" | "diverged"
          step2.data = {
            defaultBranch: defaultBranch,
            compareStatus: compareStatus,
            aheadBy: comparison.ahead_by,
            behindBy: comparison.behind_by
          };

          if (compareStatus === 'behind' || compareStatus === 'identical') {
            // The commit is reachable from (is an ancestor of) the default branch
            isReachable = true;
            step2.status = 'pass';
            result.signals.push({ icon: '✅', text: 'Commit is reachable from the default branch (' + defaultBranch + ').' });
          } else if (compareStatus === 'ahead') {
            // SHA is ahead of default branch — could be an unmerged feature branch
            step2.status = 'warn';
            result.signals.push({ icon: '⬆️', text: 'Commit is ahead of the default branch (' + defaultBranch + ') and not yet merged.' });
          } else {
            // diverged
            step2.status = 'warn';
            result.signals.push({ icon: '🔀', text: 'Commit has diverged from the default branch (' + defaultBranch + ').' });
          }
        } catch (compareErr) {
          // 404 can happen if sha is entirely unknown to the branch tree
          step2.status = 'fail';
          step2.error = compareErr.message;
          step2.data = { defaultBranch: defaultBranch };
          result.signals.push({ icon: '❌', text: 'Could not compare with default branch: ' + compareErr.message });
        }
      } catch (repoErr) {
        step2.status = 'fail';
        step2.error = repoErr.message;
      }

      /* ── Step 3: HEAD of branch check ─────────────────────── */
      var step3 = result.checks.step3;
      step3.apiUrl = 'GET /repos/' + owner + '/' + repo + '/commits/' + sha + '/branches-where-head';
      try {
        var branches = await api.getBranchesWhereHead(owner, repo, sha);
        step3.data = { branches: branches.map(function (b) { return b.name; }) };
        if (branches.length > 0) {
          isHeadOfBranch = true;
          isReachable = true;
          step3.status = 'pass';
          result.signals.push({ icon: '🌿', text: 'Commit is the HEAD of branch(es): ' + step3.data.branches.join(', ') + '.' });
        } else {
          step3.status = 'info';
          result.signals.push({ icon: 'ℹ️', text: 'Commit is not the HEAD of any branch.' });
        }
      } catch (err) {
        step3.status = 'fail';
        step3.error = err.message;
      }

      /* ── Step 4: Pull request association ─────────────────── */
      var step4 = result.checks.step4;
      step4.apiUrl = 'GET /repos/' + owner + '/' + repo + '/commits/' + sha + '/pulls';
      try {
        var pulls = await api.getCommitPulls(owner, repo, sha);
        var pullSummary = pulls.map(function (pr) {
          return { number: pr.number, title: pr.title, state: pr.state, merged: !!pr.merged_at };
        });
        step4.data = { pulls: pullSummary };
        if (pulls.length > 0) {
          hasPR = true;
          step4.status = 'pass';
          var merged = pullSummary.filter(function (p) { return p.merged; });
          if (merged.length > 0) {
            result.signals.push({ icon: '🔗', text: 'Commit is associated with ' + merged.length + ' merged PR(s).' });
          } else {
            result.signals.push({ icon: '🔗', text: 'Commit is associated with ' + pulls.length + ' PR(s) (not yet merged).' });
          }
        } else {
          step4.status = 'info';
          result.signals.push({ icon: 'ℹ️', text: 'No pull requests associated with this commit.' });
        }
      } catch (err) {
        step4.status = 'fail';
        step4.error = err.message;
      }

      /* ── Step 5: Tag reachability ─────────────────────────── */
      var step5 = result.checks.step5;
      step5.apiUrl = 'GET /repos/' + owner + '/' + repo + '/tags?per_page=100&page=1-3';
      var matchingTags = [];
      try {
        var allTags = [];
        for (var page = 1; page <= 3; page++) {
          var pageTags = await api.getTags(owner, repo, page, 100);
          allTags = allTags.concat(pageTags);
          if (pageTags.length < 100) break; // no more pages
        }

        // Find tags whose lightweight commit sha matches
        var directMatches = allTags.filter(function (t) {
          return t.commit && t.commit.sha === sha;
        });

        for (var i = 0; i < directMatches.length; i++) {
          var tag = directMatches[i];
          var tagEntry = { name: tag.name, annotated: false, signed: false };

          try {
            // Check if annotated via git/ref
            var gitRef = await api.getGitRef(owner, repo, tag.name);
            if (gitRef.object && gitRef.object.type === 'tag') {
              tagEntry.annotated = true;
              // Fetch the annotated tag object to check for signature
              try {
                var gitTag = await api.getGitTag(owner, repo, gitRef.object.sha);
                if (gitTag.verification && gitTag.verification.verified) {
                  tagEntry.signed = true;
                  hasSignedTag = true;
                }
                tagEntry.taggerName = gitTag.tagger ? gitTag.tagger.name : null;
              } catch (e) {
                // ignore — tag object fetch failed
              }
            }
          } catch (e) {
            // ignore — ref fetch failed
          }

          matchingTags.push(tagEntry);
        }

        step5.data = { totalTagsChecked: allTags.length, matchingTags: matchingTags };

        if (matchingTags.length > 0) {
          hasTag = true;
          step5.status = 'pass';
          var signedTagNames = matchingTags.filter(function (t) { return t.signed; }).map(function (t) { return t.name; });
          var unsignedTagNames = matchingTags.filter(function (t) { return !t.signed; }).map(function (t) { return t.name; });
          if (signedTagNames.length > 0) {
            result.signals.push({ icon: '🏷️', text: 'Commit is pointed to by signed annotated tag(s): ' + signedTagNames.join(', ') + '.' });
          }
          if (unsignedTagNames.length > 0) {
            result.signals.push({ icon: '🏷️', text: 'Commit is pointed to by tag(s): ' + unsignedTagNames.join(', ') + '.' });
          }
        } else {
          step5.status = 'info';
          result.signals.push({ icon: 'ℹ️', text: 'No tags point directly to this commit (checked ' + (step5.data.totalTagsChecked) + ' tags).' });
        }
      } catch (err) {
        step5.status = 'fail';
        step5.error = err.message;
      }

      /* ── Final classification ─────────────────────────────── */
      var classify;
      if ((isReachable || isHeadOfBranch) && (hasVerifiedSignature || hasSignedTag)) {
        classify = 'vouched';
      } else if (isReachable || isHeadOfBranch) {
        classify = 'reachable';
      } else if (hasVerifiedSignature || hasSignedTag) {
        classify = 'vouched';
      } else if (!isReachable && !isHeadOfBranch && !hasTag && !hasPR) {
        classify = 'suspicious';
      } else {
        classify = 'orphaned';
      }
      result.classification = classify;

      return result;
    }

    return { detect: detect };
  }

  return { create: create };
})();
