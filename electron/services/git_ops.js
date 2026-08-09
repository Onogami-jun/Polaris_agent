/**
 * Polaris Git Operations Service v1.0
 * Agent-driven git workflows: clone, branch, commit, push, create PR.
 * All mutations require user confirmation via permission bridge.
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

/* ── Resolve git executable ── */
function getGit() {
  // Check common install paths
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'bin', 'git.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'cmd', 'git.exe'),
    'C:\\Program Files\\Git\\bin\\git.exe',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'git',
  ];
  for (const c of candidates) {
    try {
      const r = spawnSync(c, ['--version'], { timeout: 5000, encoding: 'utf8', windowsHide: true });
      if (r.status === 0 && r.stdout.includes('git version')) return c;
    } catch {}
  }
  return null;
}

function gitRun(args, cwd, timeout = 30000) {
  const git = getGit();
  if (!git) return { success: false, error: 'Git not found. Install Git from https://git-scm.com/' };
  try {
    const r = spawnSync(git, args, { cwd: cwd || os.homedir(), timeout, encoding: 'utf8', windowsHide: true, env: { ...process.env } });
    return { success: r.status === 0, stdout: (r.stdout || '').slice(0, 5000), stderr: (r.stderr || '').slice(0, 2000) };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/* ── GitHub API helper ── */
function githubAPI(token, method, apiPath, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Polaris-Solver/1.0',
      },
      timeout: 20000,
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(options, resp => {
      let d = ''; resp.on('data', c => d += c.toString());
      resp.on('end', () => {
        try { const j = JSON.parse(d); resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, data: j, status: resp.statusCode }); }
        catch { resolve({ ok: false, error: d.slice(0, 500), status: resp.statusCode }); }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'GitHub API timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

/* ═══════════════════════════════════════════════════════════
   Git operations (used as tool execute functions)
   ═══════════════════════════════════════════════════════════ */

const gitOps = {
  /* ── Clone repository ── */
  clone: async function (params, ghToken) {
    const { url, branch, targetDir } = params;
    if (!url || !url.includes('github.com')) return { success: false, error: 'Please provide a valid GitHub URL' };
    const token = ghToken || params.token;
    if (!token) return { success: false, error: 'GitHub token required. Add it in Settings > Models.' };

    const dir = targetDir || path.join(os.homedir(), 'Documents', 'Polaris_Repo', sanitizeDir(url));
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
      return { success: true, result: 'Repository already exists at ' + dir, dir: dir };
    }
    if (!fs.existsSync(path.dirname(dir))) fs.mkdirSync(path.dirname(dir), { recursive: true });

    // Clone with token in URL
    const authUrl = url.replace('https://github.com/', 'https://' + token + '@github.com/');
    const args = ['clone', authUrl, dir];
    if (branch) args.splice(1, 0, '-b', branch);

    const r = gitRun(args);
    if (r.success) return { success: true, result: 'Cloned to ' + dir, dir: dir, branch: branch || 'main' };
    return { success: false, error: r.stderr || r.error || 'Clone failed' };
  },

  /* ── Create branch ── */
  branch: async function (params) {
    const { dir, name: branchName } = params;
    if (!dir || !branchName) return { success: false, error: 'dir and name are required' };
    if (!fs.existsSync(dir)) return { success: false, error: 'Directory not found: ' + dir };

    const r = gitRun(['checkout', '-b', branchName], dir);
    if (r.success) return { success: true, result: 'Created and switched to branch ' + branchName, branch: branchName, dir: dir };
    return { success: false, error: r.stderr || r.error || 'Failed to create branch' };
  },

  /* ── Stage + commit ── */
  commit: async function (params) {
    const { dir, message, files } = params;
    if (!dir || !message) return { success: false, error: 'dir and commit message are required' };
    if (!fs.existsSync(dir)) return { success: false, error: 'Directory not found: ' + dir };

    const toAdd = files || ['.'];
    for (const f of toAdd) {
      const r = gitRun(['add', f], dir);
      if (!r.success && !r.stderr.includes('did not match')) return { success: false, error: 'Git add failed: ' + (r.stderr || r.error) };
    }
    const cr = gitRun(['commit', '-m', message], dir);
    if (cr.success) return { success: true, result: 'Committed: ' + message, branch: getCurrentBranch(dir), dir: dir };
    if (cr.stdout.includes('nothing to commit') || cr.stderr.includes('nothing to commit')) {
      return { success: true, result: 'Nothing to commit (working tree clean)', branch: getCurrentBranch(dir), dir: dir };
    }
    return { success: false, error: cr.stderr || cr.error || 'Commit failed' };
  },

  /* ── Push to remote ── */
  push: async function (params, ghToken) {
    const { dir, branch } = params;
    if (!dir) return { success: false, error: 'dir is required' };
    const token = ghToken || params.token;
    if (!token) return { success: false, error: 'GitHub token required' };

    const pushBranch = branch || getCurrentBranch(dir);
    // Set remote URL with token temporarily
    try {
      const remoteUrl = execSync('git -C "' + dir + '" remote get-url origin', { encoding: 'utf8', windowsHide: true }).trim();
      if (remoteUrl.startsWith('https://')) {
        const authUrl = remoteUrl.replace('https://', 'https://' + token + '@');
        execSync('git -C "' + dir + '" remote set-url origin "' + authUrl + '"', { windowsHide: true });
        const r = gitRun(['push', '-u', 'origin', pushBranch], dir);
        // Restore remote URL (remove token)
        execSync('git -C "' + dir + '" remote set-url origin "' + remoteUrl + '"', { windowsHide: true });
        if (r.success) return { success: true, result: 'Pushed ' + pushBranch + ' to origin', branch: pushBranch, dir: dir };
        return { success: false, error: r.stderr || r.error || 'Push failed' };
      }
    } catch (e) {
      return { success: false, error: 'Failed to get remote URL: ' + e.message };
    }
    return { success: false, error: 'Remote URL is not HTTPS' };
  },

  /* ── Create Pull Request ── */
  createPR: async function (params, ghToken) {
    const { dir, title, body, base, head } = params;
    if (!dir) return { success: false, error: 'dir is required' };
    const token = ghToken || params.token;
    if (!token) return { success: false, error: 'GitHub token required' };

    // Get repo info from git remote
    let owner, repo;
    try {
      const remoteUrl = execSync('git -C "' + dir + '" remote get-url origin', { encoding: 'utf8', windowsHide: true }).trim();
      const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/\s.]+?)(?:\.git)?$/);
      if (!match) return { success: false, error: 'Could not parse owner/repo from remote URL: ' + remoteUrl };
      owner = match[1]; repo = match[2];
    } catch (e) {
      return { success: false, error: 'Failed to get remote URL: ' + e.message };
    }

    const prBody = body || 'Created by Polaris Solver Agent.\n\n' + (params.description || 'Automated Pull Request.');
    const headBranch = head || getCurrentBranch(dir);
    const baseBranch = base || 'main';

    const r = await githubAPI(token, 'POST', '/repos/' + owner + '/' + repo + '/pulls', {
      title: title || 'Polaris Agent PR',
      body: prBody,
      head: headBranch,
      base: baseBranch,
    });

    if (r.ok && r.data) {
      return {
        success: true,
        result: 'Pull Request created!',
        pr_url: r.data.html_url,
        pr_number: r.data.number,
        title: r.data.title,
        owner: owner, repo: repo,
        branch: headBranch, base: baseBranch,
      };
    }
    return { success: false, error: (r.data && r.data.message) || r.error || 'PR creation failed', status: r.status };
  },

  /* ── Quick status ── */
  status: async function (params) {
    const { dir } = params;
    if (!dir) return { success: false, error: 'dir is required' };
    const r = gitRun(['status', '--porcelain'], dir);
    const branch = getCurrentBranch(dir);
    return { success: true, result: r.stdout || 'Clean', branch: branch, files: (r.stdout || '').split('\n').filter(Boolean) };
  },

  /* ── Pull latest ── */
  pull: async function (params) {
    const { dir } = params;
    if (!dir) return { success: false, error: 'dir is required' };
    const r = gitRun(['pull'], dir);
    if (r.success) return { success: true, result: r.stdout || 'Pulled latest changes', dir: dir };
    return { success: false, error: r.stderr || r.error || 'Pull failed' };
  },
};

function getCurrentBranch(dir) {
  try { return execSync('git -C "' + dir + '" branch --show-current', { encoding: 'utf8', windowsHide: true }).trim(); }
  catch { return 'unknown'; }
}

function sanitizeDir(url) {
  const match = url.match(/github\.com[:/]([^/]+)\/([^/\s.]+?)(?:\.git)?$/);
  return match ? (match[1] + '_' + match[2]) : 'polaris_repo';
}

module.exports = { gitOps, getGit, gitRun, githubAPI };
