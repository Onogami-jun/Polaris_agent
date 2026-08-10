/**
 * Polaris Unified Skill Registry v1.0
 *
 * Every capability Polaris has is a Skill.
 * Skills are self-describing: name, description, inputs, outputs, category, executor.
 *
 * The Workflow Planner reads this registry to understand what Polaris CAN do.
 * It asks LLM to decompose a user goal into a chain of skill names.
 * The executor then runs each skill sequentially, passing outputs between them.
 */

const { TOOLS } = require('./tools');
const { gitOps } = require('./git_ops');
const AGENTS = require('./agents');

/* ── Skill categories ── */
const CATEGORIES = {
  git:         { icon: '⟿', label: 'Git',         color: '#3ba88e' },
  filesystem:  { icon: '▤', label: 'Files',       color: '#5a8ad4' },
  optimize:    { icon: '◎', label: 'Optimize',    color: '#c8a96e' },
  research:    { icon: '◇', label: 'Research',    color: '#d4a85a' },
  agent:       { icon: '◆', label: 'Agent',       color: '#a088c8' },
  system:      { icon: '○', label: 'System',      color: '#8a8794' },
};

/* ── Skill definitions ── */
const SKILLS = {
  // ── Optimization skills ──
  solve: {
    name: 'Solve Problem', category: 'optimize',
    description: 'Solve an optimization problem described in natural language. Returns optimal solution.',
    inputs: ['prompt'], outputs: ['result', 'error'],
    execute: async function(params, ctx) {
      const r = await TOOLS.polaris_opt.execute({ prompt: params.prompt || ctx.userMessage });
      return r.success ? { result: r.result } : { error: r.error };
    }
  },

  analyze: {
    name: 'Analyze Structure', category: 'optimize',
    description: 'Analyze optimization problem structure: detect block-angular, time-indexed patterns.',
    inputs: ['prompt'], outputs: ['result'],
    execute: async function(params) {
      const r = await TOOLS.polaris_analyze.execute({ prompt: params.prompt });
      return { result: r.result };
    }
  },

  experiment: {
    name: 'Run Experiment', category: 'research',
    description: 'Run batch experiments comparing solvers, output Markdown/LaTeX tables.',
    inputs: ['problem', 'sizes', 'solvers', 'seed'], outputs: ['result'],
    execute: async function(params) {
      const r = await TOOLS.polaris_research.execute({
        problem: params.problem, sizes: params.sizes || '10,20,50',
        solvers: params.solvers || 'highs,naive', seed: params.seed || 42
      });
      return { result: r.result };
    }
  },

  search: {
    name: 'Search Web', category: 'research',
    description: 'Search the web for optimization literature, algorithms, and references.',
    inputs: ['query'], outputs: ['results'],
    execute: async function(params) {
      const r = await TOOLS.search_web.execute({ query: params.query });
      return { results: (r.results || []).map(function(x) { return x.title + ': ' + x.snippet; }) };
    }
  },

  // ── Git skills ──
  git_clone: {
    name: 'Clone Repository', category: 'git',
    description: 'Clone a GitHub repository to work locally.', inputs: ['url', 'branch?'], outputs: ['dir', 'branch'],
    execute: async function(params, ctx) {
      const r = await gitOps.clone(params, ctx.ghToken);
      return r.success ? { dir: r.dir, branch: r.branch } : { error: r.error };
    }
  },

  git_status: {
    name: 'Check Status', category: 'git',
    description: 'Show working tree status: branch, changed files.', inputs: ['dir'], outputs: ['branch', 'files'],
    execute: async function(params) {
      const r = await gitOps.status(params);
      return { branch: r.branch, files: (r.files || []).length };
    }
  },

  git_branch: {
    name: 'Create Branch', category: 'git',
    description: 'Create and switch to a new git branch.', inputs: ['dir', 'name'], outputs: ['branch'],
    execute: async function(params) {
      const r = await gitOps.branch(params);
      return r.success ? { branch: params.name } : { error: r.error };
    }
  },

  git_commit: {
    name: 'Commit Changes', category: 'git', requiresConfirm: true,
    description: 'Stage and commit changes with a message.', inputs: ['dir', 'message'], outputs: ['branch'],
    execute: async function(params) {
      const r = await gitOps.commit(params);
      return r.success ? { branch: r.branch } : { error: r.error };
    }
  },

  git_push: {
    name: 'Push to Remote', category: 'git', requiresConfirm: true,
    description: 'Push committed changes to GitHub.', inputs: ['dir', 'branch'], outputs: ['branch'],
    execute: async function(params, ctx) {
      const r = await gitOps.push(params, ctx.ghToken);
      return r.success ? { branch: r.branch || params.branch } : { error: r.error };
    }
  },

  git_create_pr: {
    name: 'Create Pull Request', category: 'git', requiresConfirm: true,
    description: 'Create a GitHub Pull Request from current branch.', inputs: ['dir', 'title', 'body?'], outputs: ['pr_url', 'pr_number'],
    execute: async function(params, ctx) {
      const r = await gitOps.createPR(params, ctx.ghToken);
      return r.success ? { pr_url: r.pr_url, pr_number: r.pr_number } : { error: r.error };
    }
  },

  git_list_repos: {
    name: 'List Repositories', category: 'git',
    description: 'List all user GitHub repositories.', inputs: [], outputs: ['repos'],
    execute: async function(params, ctx) {
      const r = await gitOps.listRepos(params, ctx.ghToken);
      return r.success ? { repos: (r.repos || []).map(function(x) { return x.name; }) } : { error: r.error };
    }
  },

  git_review_pr: {
    name: 'Review PR', category: 'git',
    description: 'Fetch PR diff and review the code changes.', inputs: ['dir', 'prNumber'], outputs: ['diff', 'prNumber'],
    execute: async function(params, ctx) {
      const r = await gitOps.getPRDiff(params, ctx.ghToken);
      return r.success ? { diff: r.diff, prNumber: params.prNumber } : { error: r.error };
    }
  },

  // ── Filesystem skills ──
  read_file: {
    name: 'Read File', category: 'filesystem',
    description: 'Read a local file.', inputs: ['path'], outputs: ['content'],
    execute: async function(params) {
      const r = await TOOLS.read_file.execute({ path: params.path });
      return r.success ? { content: r.result } : { error: r.error };
    }
  },

  write_file: {
    name: 'Write File', category: 'filesystem', requiresConfirm: true,
    description: 'Write content to a local file.', inputs: ['path', 'content'], outputs: ['path'],
    execute: async function(params) {
      const r = await TOOLS.write_file.execute({ path: params.path, content: params.content });
      return r.success ? { path: params.path } : { error: r.error };
    }
  },

  list_dir: {
    name: 'List Directory', category: 'filesystem',
    description: 'List files in a directory.', inputs: ['path'], outputs: ['files'],
    execute: async function(params) {
      const r = await TOOLS.list_dir.execute({ path: params.path });
      return r.success ? { files: JSON.stringify(r.files) } : { error: r.error };
    }
  },

  run_python: {
    name: 'Run Python Code', category: 'system',
    description: 'Execute Python code in the sandbox.', inputs: ['code'], outputs: ['stdout', 'stderr'],
    execute: async function(params) {
      const r = await TOOLS.run_code.execute({ code: params.code });
      return { stdout: r.stdout, stderr: r.stderr || '' };
    }
  },

  // ── Meta skills ──
  plan: {
    name: 'Think / Plan', category: 'agent',
    description: 'Think through a problem and plan next steps. LLM generates the plan.',
    inputs: ['prompt'], outputs: ['plan'],
    execute: async function(params, ctx) {
      // This is handled by the planner itself — returns a pass-through
      return { plan: params.prompt };
    }
  },
};

function listSkills(filter) {
  var out = [];
  for (var id in SKILLS) {
    var s = SKILLS[id];
    if (filter && s.category !== filter) continue;
    out.push({ id: id, name: s.name, category: s.category, description: s.description, inputs: s.inputs, outputs: s.outputs, requiresConfirm: !!s.requiresConfirm });
  }
  return out;
}

function getSkill(id) { return SKILLS[id]; }

async function executeSkill(id, params, ctx) {
  var skill = SKILLS[id];
  if (!skill) return { error: 'Unknown skill: ' + id };
  try {
    return await skill.execute(params, ctx || {});
  } catch(e) { return { error: e.message }; }
}

module.exports = { SKILLS, CATEGORIES, listSkills, getSkill, executeSkill };
