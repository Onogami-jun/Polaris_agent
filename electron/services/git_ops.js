/**
 * Polaris Git Operations Service v2.0
 * Full GitHub integration: clone, branch, commit, push, PR, review, issues, CI, releases.
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

/* ── Resolve git executable ── */
function getGit() {
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'bin', 'git.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'cmd', 'git.exe'),
    'C:\\Program Files\\Git\\bin\\git.exe', 'C:\\Program Files\\Git\\cmd\\git.exe', 'git',
  ];
  for (const c of candidates) {
    try { const r = spawnSync(c, ['--version'], { timeout: 5000, encoding: 'utf8', windowsHide: true }); if (r.status === 0 && r.stdout.includes('git version')) return c; } catch {}
  }
  return null;
}
function gitRun(args, cwd, timeout = 30000) {
  const git = getGit();
  if (!git) return { success: false, error: 'Git not found.' };
  try {
    const r = spawnSync(git, args, { cwd: cwd || os.homedir(), timeout, encoding: 'utf8', windowsHide: true, env: Object.assign({}, process.env) });
    return { success: r.status === 0, stdout: (r.stdout || '').slice(0, 5000), stderr: (r.stderr || '').slice(0, 2000) };
  } catch (e) { return { success: false, error: e.message }; }
}
function ghAPI(token, method, apiPath, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = { hostname: 'api.github.com', path: apiPath, method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Polaris-Solver/2.0' }, timeout: 20000 };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(options, resp => { let d = ''; resp.on('data', c => d += c.toString()); resp.on('end', () => { try { resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, data: JSON.parse(d), status: resp.statusCode }); } catch { resolve({ ok: false, error: d.slice(0, 500), status: resp.statusCode }); } }); });
    req.on('error', e => resolve({ ok: false, error: e.message })); req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
    if (payload) req.write(payload); req.end();
  });
}
function getRepoInfo(dir) {
  try {
    const remoteUrl = execSync('git -C "' + dir + '" remote get-url origin', { encoding: 'utf8', windowsHide: true }).trim();
    const m = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/\s.]+?)(?:\.git)?$/);
    return m ? { owner: m[1], repo: m[2], remoteUrl } : null;
  } catch { return null; }
}
function getCurrentBranch(dir) { try { return execSync('git -C "' + dir + '" branch --show-current', { encoding: 'utf8', windowsHide: true }).trim(); } catch { return 'unknown'; } }
function sanitizeDir(url) { const m = url.match(/github\.com[:/]([^/]+)\/([^/\s.]+?)(?:\.git)?$/); return m ? (m[1] + '_' + m[2]) : 'polaris_repo'; }

/* ═══════════════════════════════════════════════════════════
   Git operations (used as tool execute functions)
   ═══════════════════════════════════════════════════════════ */

const gitOps = {
  /* ── Clone repository ── */
  clone: async function (params, ghToken) {
    const { url, branch, targetDir } = params;
    if (!url || !url.includes('github.com')) return { success: false, error: 'Invalid GitHub URL' };
    const token = ghToken || params.token; if (!token) return { success: false, error: 'GitHub token required' };
    const dir = targetDir || path.join(os.homedir(), 'Documents', 'Polaris_Repo', sanitizeDir(url));
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) return { success: true, result: 'Already exists', dir };
    if (!fs.existsSync(path.dirname(dir))) fs.mkdirSync(path.dirname(dir), { recursive: true });
    const authUrl = url.replace('https://github.com/', 'https://' + token + '@github.com/');
    const args = ['clone', authUrl, dir]; if (branch) args.splice(1, 0, '-b', branch);
    const r = gitRun(args); return r.success ? { success: true, result: 'Cloned', dir, branch: branch || 'main' } : { success: false, error: r.stderr || r.error };
  },
  status: async function (params) {
    const { dir } = params; if (!dir) return { success: false, error: 'dir required' };
    const r = gitRun(['status', '--porcelain'], dir);
    return { success: true, result: r.stdout || 'Clean', branch: getCurrentBranch(dir), files: (r.stdout || '').split('\n').filter(Boolean) };
  },
  branch: async function (params) {
    const { dir, name: branchName } = params; if (!dir || !branchName) return { success: false, error: 'dir and name required' };
    if (!fs.existsSync(dir)) return { success: false, error: 'Directory not found' };
    const r = gitRun(['checkout', '-b', branchName], dir);
    return r.success ? { success: true, result: 'Created branch ' + branchName, branch: branchName, dir } : { success: false, error: r.stderr || r.error };
  },
  commit: async function (params) {
    const { dir, message, files } = params; if (!dir || !message) return { success: false, error: 'dir and message required' };
    const toAdd = files || ['.']; for (const f of toAdd) { const r = gitRun(['add', f], dir); if (!r.success && !r.stderr.includes('did not match')) return { success: false, error: r.stderr || r.error }; }
    const cr = gitRun(['commit', '-m', message], dir);
    if (cr.success) return { success: true, result: 'Committed', branch: getCurrentBranch(dir), dir };
    if (cr.stdout.includes('nothing') || cr.stderr.includes('nothing')) return { success: true, result: 'Nothing to commit', branch: getCurrentBranch(dir), dir };
    return { success: false, error: cr.stderr || cr.error };
  },
  push: async function (params, ghToken) {
    const { dir, branch: b } = params; if (!dir) return { success: false, error: 'dir required' };
    const token = ghToken || params.token; if (!token) return { success: false, error: 'GitHub token required' };
    try {
      const remoteUrl = execSync('git -C "' + dir + '" remote get-url origin', { encoding: 'utf8', windowsHide: true }).trim();
      if (remoteUrl.startsWith('https://')) {
        const authUrl = remoteUrl.replace('https://', 'https://' + token + '@');
        execSync('git -C "' + dir + '" remote set-url origin "' + authUrl + '"', { windowsHide: true });
        const pushBranch = b || getCurrentBranch(dir);
        const r = gitRun(['push', '-u', 'origin', pushBranch], dir);
        execSync('git -C "' + dir + '" remote set-url origin "' + remoteUrl + '"', { windowsHide: true });
        return r.success ? { success: true, result: 'Pushed ' + pushBranch, branch: pushBranch, dir } : { success: false, error: r.stderr || r.error };
      }
    } catch (e) { return { success: false, error: e.message }; }
    return { success: false, error: 'Remote URL not HTTPS' };
  },
  pull: async function (params) {
    const { dir } = params; if (!dir) return { success: false, error: 'dir required' };
    const r = gitRun(['pull'], dir); return r.success ? { success: true, result: r.stdout || 'Pulled', dir } : { success: false, error: r.stderr || r.error };
  },

  /* ── PR Operations ── */
  createPR: async function (params, ghToken) {
    const { dir, title, body, base, head: h } = params; if (!dir) return { success: false, error: 'dir required' };
    const token = ghToken || params.token; if (!token) return { success: false, error: 'GitHub token required' };
    const info = getRepoInfo(dir); if (!info) return { success: false, error: 'Could not parse repo info' };
    const r = await ghAPI(token, 'POST', '/repos/' + info.owner + '/' + info.repo + '/pulls', { title: title || 'Polaris Agent Update', body: body || 'Created by Polaris.', head: h || getCurrentBranch(dir), base: base || 'main' });
    return r.ok ? { success: true, result: 'PR created', pr_url: r.data.html_url, pr_number: r.data.number } : { success: false, error: (r.data && r.data.message) || r.error };
  },
  mergePR: async function (params, ghToken) {
    const { dir, prNumber, method: mergeMethod } = params; if (!dir) return { success: false, error: 'dir required' };
    const token = ghToken || params.token; if (!token) return { success: false, error: 'GitHub token required' };
    const info = getRepoInfo(dir); if (!info) return { success: false, error: 'Could not parse repo info' };
    const r = await ghAPI(token, 'PUT', '/repos/' + info.owner + '/' + info.repo + '/pulls/' + (prNumber || '') + '/merge', { merge_method: mergeMethod || 'merge' });
    return r.ok ? { success: true, result: 'PR merged', merged: r.data.merged } : { success: false, error: (r.data && r.data.message) || r.error };
  },
  listPRs: async function (params, ghToken) {
    const { dir, state: prState } = params; if (!dir) return { success: false, error: 'dir required' };
    const token = ghToken || params.token; if (!token) return { success: false, error: 'GitHub token required' };
    const info = getRepoInfo(dir); if (!info) return { success: false, error: 'Could not parse repo info' };
    const r = await ghAPI(token, 'GET', '/repos/' + info.owner + '/' + info.repo + '/pulls?state=' + (prState || 'open') + '&per_page=10');
    if (!r.ok) return { success: false, error: (r.data && r.data.message) || r.error };
    const prs = (r.data || []).map(function(p) { return { number: p.number, title: p.title, state: p.state, user: p.user && p.user.login, branch: p.head && p.head.ref, created: p.created_at, url: p.html_url }; });
    return { success: true, result: prs.length + ' PRs', prs };
  },
  getPRDiff: async function (params, ghToken) {
    const { dir, prNumber } = params; if (!dir) return { success: false, error: 'dir required' };
    const token = ghToken || params.token; if (!token) return { success: false, error: 'GitHub token required' };
    const info = getRepoInfo(dir); if (!info) return { success: false, error: 'Could not parse repo info' };
    const r = await ghAPI(token, 'GET', '/repos/' + info.owner + '/' + info.repo + '/pulls/' + prNumber);
    if (!r.ok) return { success: false, error: (r.data && r.data.message) || r.error };
    // Fetch the diff
    return new Promise(function(resolve) {
      const opts = { hostname: 'api.github.com', path: '/repos/' + info.owner + '/' + info.repo + '/pulls/' + prNumber, method: 'GET', headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.v3.diff', 'User-Agent': 'Polaris-Solver/2.0' }, timeout: 20000 };
      const req = https.request(opts, function(resp) { let d = ''; resp.on('data', function(c) { d += c.toString(); }); resp.on('end', function() { resolve({ success: true, result: 'Diff fetched', diff: d.slice(0, 20000), pr: { number: r.data.number, title: r.data.title, state: r.data.state } }); }); });
      req.on('error', function(e) { resolve({ success: false, error: e.message }); }); req.end();
    });
  },

  /* ── Issue Operations ── */
  listIssues: async function (params, ghToken) {
    const { dir, state: isState, labels } = params; if (!dir) return { success: false, error: 'dir required' };
    const token = ghToken || params.token; if (!token) return { success: false, error: 'GitHub token required' };
    const info = getRepoInfo(dir); if (!info) return { success: false, error: 'Could not parse repo info' };
    var qs = 'state=' + (isState || 'open') + '&per_page=10'; if (labels) qs += '&labels=' + encodeURIComponent(labels);
    const r = await ghAPI(token, 'GET', '/repos/' + info.owner + '/' + info.repo + '/issues?' + qs);
    if (!r.ok) return { success: false, error: (r.data && r.data.message) || r.error };
    const issues = (r.data || []).filter(function(i) { return !i.pull_request; }).map(function(i) { return { number: i.number, title: i.title, state: i.state, user: i.user && i.user.login, labels: (i.labels || []).map(function(l) { return l.name; }), created: i.created_at, url: i.html_url }; });
    return { success: true, result: issues.length + ' issues', issues };
  },
  createIssue: async function (params, ghToken) {
    const { dir, title, body: issueBody, labels: issueLabels } = params; if (!dir || !title) return { success: false, error: 'dir and title required' };
    const token = ghToken || params.token; if (!token) return { success: false, error: 'GitHub token required' };
    const info = getRepoInfo(dir); if (!info) return { success: false, error: 'Could not parse repo info' };
    const r = await ghAPI(token, 'POST', '/repos/' + info.owner + '/' + info.repo + '/issues', { title: title, body: issueBody || '', labels: issueLabels || [] });
    return r.ok ? { success: true, result: 'Issue created', issue_url: r.data.html_url, number: r.data.number } : { success: false, error: (r.data && r.data.message) || r.error };
  },

  /* ── CI/Workflow Operations ── */
  listWorkflows: async function (params, ghToken) {
    const { dir } = params; if (!dir) return { success: false, error: 'dir required' };
    const token = ghToken || params.token; if (!token) return { success: false, error: 'GitHub token required' };
    const info = getRepoInfo(dir); if (!info) return { success: false, error: 'Could not parse repo info' };
    const r = await ghAPI(token, 'GET', '/repos/' + info.owner + '/' + info.repo + '/actions/runs?per_page=5');
    if (!r.ok) return { success: false, error: (r.data && r.data.message) || r.error };
    const runs = (r.data.workflow_runs || []).map(function(w) { return { id: w.id, name: w.name, status: w.status, conclusion: w.conclusion, branch: w.head_branch, created: w.created_at, url: w.html_url }; });
    return { success: true, result: runs.length + ' workflow runs', runs };
  },

  /* ── Diff View ── */
  getDiff: async function (params) {
    const { dir } = params; if (!dir) return { success: false, error: 'dir required' };
    const r1 = gitRun(['diff', '--staged'], dir);
    const r2 = gitRun(['diff'], dir);
    return { success: true, result: 'Diff fetched', staged: r1.stdout || '', unstaged: r2.stdout || '' };
  },

  /* ── Release/Tag ── */
  createRelease: async function (params, ghToken) {
    const { dir, tag, name: releaseName, body: releaseBody } = params; if (!dir || !tag) return { success: false, error: 'dir and tag required' };
    const token = ghToken || params.token; if (!token) return { success: false, error: 'GitHub token required' };
    const info = getRepoInfo(dir); if (!info) return { success: false, error: 'Could not parse repo info' };
    // Create tag
    const tr = gitRun(['tag', '-a', tag, '-m', releaseName || tag], dir);
    if (!tr.success) return { success: false, error: 'Tag creation failed: ' + (tr.stderr || tr.error) };
    // Push tag first
    const pushR = gitRun(['push', 'origin', tag], dir);
    // Create release via API
    const r = await ghAPI(token, 'POST', '/repos/' + info.owner + '/' + info.repo + '/releases', { tag_name: tag, name: releaseName || tag, body: releaseBody || '', draft: false, prerelease: false });
    return r.ok ? { success: true, result: 'Release created', release_url: r.data.html_url, tag: tag } : { success: false, error: (r.data && r.data.message) || r.error };
  },
};

module.exports = { gitOps, getGit, gitRun, ghAPI };

