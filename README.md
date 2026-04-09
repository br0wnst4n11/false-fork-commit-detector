# 🔍 False Fork Commit Detector

A **client-side** tool that uses GitHub's public REST API to determine whether a given commit is a legitimate upstream commit or a potentially suspicious orphaned/fork commit.

> **No build step required.** Just open `index.html` in any browser.

---

## Features

- 🔍 **5-step detection pipeline** — commit metadata, default-branch containment, branch-HEAD check, PR association, tag reachability
- 🏷️ **Cryptographic signature verification** — checks both commit signatures and annotated tag signatures
- 📦 **localStorage caching** — avoids redundant API calls; results cached per commit SHA
- 🔑 **Optional PAT support** — provide a Personal Access Token to raise the rate limit from 60 to 5 000 req/hr
- 📱 **Mobile-responsive dark UI** — works on any screen size
- 🚫 **Zero dependencies** — pure HTML / CSS / JavaScript, no npm, no bundler

---

## How to Use

1. **Open `index.html`** in any modern browser  
   _or_ deploy the entire repo to [GitHub Pages](https://pages.github.com/).
2. Enter the **repository** in `owner/repo` format (e.g. `torvalds/linux`).
3. Enter the **commit SHA** (7–40 hex characters).
4. Click **Detect**.
5. Review the classification banner and expand each detection step for details.

### Optional: increase rate limits

Click *Advanced settings* and paste a GitHub Personal Access Token (PAT) with public repo read access. The token is stored in `localStorage` under the key `ghpat` and is sent **only** to `api.github.com`.

---

## Algorithm

The detector runs five checks in sequence:

| Step | API call | Purpose |
|------|----------|---------|
| 1 | `GET /repos/{owner}/{repo}/commits/{sha}` | Verify the commit exists; extract author, signature status, message |
| 2 | `GET /repos/{owner}/{repo}/compare/{default_branch}...{sha}` | Check whether the commit is reachable from (an ancestor of) the default branch |
| 3 | `GET /repos/{owner}/{repo}/commits/{sha}/branches-where-head` | Check if this commit is currently the HEAD of any branch |
| 4 | `GET /repos/{owner}/{repo}/commits/{sha}/pulls` | Check if the commit is associated with any pull requests |
| 5 | `GET /repos/{owner}/{repo}/tags` (up to 3 pages) + `git/ref` + `git/tags` | Check if any tags point to this commit and whether they carry a verified signature |

---

## Classification Definitions

| Classification | Emoji | Meaning |
|----------------|-------|---------|
| **Reachable** | ✅ | Commit is reachable from the default branch or is the HEAD of a branch |
| **Maintainer-Vouched** | 🔏 | Commit has a verified cryptographic signature, or is pointed to by a signed annotated tag |
| **Orphaned** | ⚠️ | Commit exists in GitHub's object store but is not reachable from any branch or tag |
| **Suspicious** | 🚨 | Orphaned, no verified signature, no PR association, and no tags — may be a false-fork or impersonation |

---

## Known Limitations

- **`branches-where-head` is HEAD-only** — the endpoint only returns branches where this commit is the *current* HEAD, not all branches that *contain* the commit. A commit deep in history may not appear as "reachable from a branch" even if it is legitimately there.
- **Compare API checks the default branch only** — commits that exist on a non-default branch but not on `main`/`master` may appear orphaned even if they are legitimate.
- **Unauthenticated rate limit is 60 req/hr per IP** — the detection pipeline can use up to ~10 API calls per commit. Provide a PAT to increase the limit to 5 000 req/hr.
- **Pushing a tag without its branch triggers a false warning** — if a maintainer pushes a tag before pushing the associated branch, the commit will be tagged but not branch-reachable.
- **Cannot definitively prove "impersonation"** — the public API alone cannot prove a commit is a malicious imposter; classification as *Suspicious* means it has no verifiable upstream references, which warrants further manual investigation.

---

## Rate Limits & Caching

- API responses are cached in `localStorage` for **10 minutes** (keyed by URL).
- Detection results are cached in `localStorage` per `owner/repo/sha` indefinitely (until cleared). A cached result is shown with a "📦 Cached result" badge and a **Re-check** button to force a fresh run.
- To clear all cached data, open the browser's DevTools → Application → Local Storage and clear the entries prefixed with `ffcd:` and `ffd:`.

---

## Project Structure

```
false-fork-commit-detector/
├── index.html          # Main application page
├── css/
│   └── style.css       # Dark-themed responsive styles
├── js/
│   ├── utils.js        # Formatting & classification helpers
│   ├── api.js          # GitHub REST API wrapper (caching, PAT, rate-limit handling)
│   ├── detector.js     # 5-step detection pipeline
│   └── app.js          # UI wiring, rendering, input validation
├── LICENSE             # MIT
└── README.md
```

---

## License

MIT License — Copyright 2025 br0wnst4n11

See [LICENSE](./LICENSE) for full text.