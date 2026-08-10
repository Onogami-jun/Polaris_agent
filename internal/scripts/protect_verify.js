#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════
 *  Polaris 闭源保护工具
 *  ─────────────────────────────────────────────────────────
 *  加密 verification_engine.js → verification_engine.js.enc
 *  解密 verification_engine.js.enc → verification_engine.js
 *
 *  用法:
 *    node internal/scripts/protect_verify.js encrypt   -- 加密并提交.enc
 *    node internal/scripts/protect_verify.js decrypt   -- 解密（构建时调用）
 *
 *  密钥来源（优先级）:
 *    1. 环境变量 POLARIS_VERIFY_KEY
 *    2. 本地文件 internal/.polaris_key（gitignored）
 *    3. 从 internal/services/secrets.js vault 自动衍生
 *
 *  .enc 文件可公开提交到 GitHub。
 *  没有密钥的人拿到 .enc 也解不开。
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const VERIFY_SRC = path.join(ROOT, 'internal', 'services', 'verification_engine.js');
const VERIFY_ENC = path.join(ROOT, 'internal', 'services', 'verification_engine.js.enc');
const KEY_FILE = path.join(ROOT, 'internal', '.polaris_key');

// ═══════════════════════════════════════════════════════════
// Key management
// ═══════════════════════════════════════════════════════════

function getKey() {
  // Priority 1: environment variable (used in CI)
  if (process.env.POLARIS_VERIFY_KEY) {
    return crypto.createHash('sha256').update(process.env.POLARIS_VERIFY_KEY).digest();
  }

  // Priority 2: local key file
  if (fs.existsSync(KEY_FILE)) {
    const raw = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (raw) return crypto.createHash('sha256').update(raw).digest();
  }

  // Priority 3: derive from vault seed in secrets.js
  try {
    const vaultPath = path.join(ROOT, 'internal', 'services', 'secrets.js');
    const vaultSrc = fs.readFileSync(vaultPath, 'utf8');
    const match = vaultSrc.match(/VAULT_SEED\s*=\s*'([^']+)'/);
    if (match) {
      const seed = match[1];
      // Derive a DIFFERENT key from the vault seed (by appending a suffix)
      return crypto.createHash('sha256').update(seed + ':verify:protect').digest();
    }
  } catch {}

  console.error('ERROR: No decryption key found.');
  console.error('  Set POLARIS_VERIFY_KEY env var, or create .polaris_key file, or ensure secrets.js has VAULT_SEED.');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════
// Encrypt
// ═══════════════════════════════════════════════════════════

function encrypt() {
  if (!fs.existsSync(VERIFY_SRC)) {
    console.error('ERROR: verification_engine.js not found. Write the source first.');
    process.exit(1);
  }

  const key = getKey();
  const plaintext = fs.readFileSync(VERIFY_SRC, 'utf8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Format: base64(iv) + ':' + hex(encrypted) + ':' + hex(tag)
  const output = Buffer.from(iv).toString('base64') + '\n' + encrypted + '\n' + tag.toString('hex');
  fs.writeFileSync(VERIFY_ENC, output);
  console.log('✓ Encrypted: ' + path.relative(ROOT, VERIFY_ENC));
  console.log('  Size: ' + fs.statSync(VERIFY_ENC).size + ' bytes');
  console.log('  Safe to commit to GitHub.');
}

// ═══════════════════════════════════════════════════════════
// Decrypt
// ═══════════════════════════════════════════════════════════

function decrypt() {
  if (!fs.existsSync(VERIFY_ENC)) {
    console.error('ERROR: verification_engine.js.enc not found.');
    process.exit(1);
  }

  const key = getKey();
  const data = fs.readFileSync(VERIFY_ENC, 'utf8').trim();
  const lines = data.split('\n');
  if (lines.length < 3) {
    console.error('ERROR: Invalid .enc file format.');
    process.exit(1);
  }

  const iv = Buffer.from(lines[0].trim(), 'base64');
  const encrypted = lines[1].trim();
  const tag = Buffer.from(lines[2].trim(), 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  try {
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    fs.writeFileSync(VERIFY_SRC, decrypted);
    console.log('✓ Decrypted: ' + path.relative(ROOT, VERIFY_SRC));
  } catch (e) {
    console.error('ERROR: Decryption failed. Wrong key?');
    console.error('  ' + e.message);
    console.error('');
    console.error('This is expected in development — the build will use a stub.');
    console.error('To unlock the real engine: create .polaris_key or set POLARIS_VERIFY_KEY env var.');
    // Create a stub file so the build can proceed
    createStub();
    console.log('⚠ Build will proceed with stub verification engine.');
    process.exit(0); // Don't fail the build
  }
}

// Stub for when decryption fails (CI without key)
function createStub() {
  const stub = `/**
 * Verification Engine — STUB (decryption failed at build time)
 * The real verification engine was not decrypted. Building without it.
 */
module.exports = {
  verifyAndScore: async function() { return { passed: true, finalScore: 80, verdict: '⚠ 验证引擎未解密（开发构建）', details: 'Verification stub', hardVetoes: [], softScores: [] }; },
  quickVerify: async function() { return { passed: true, hardVetoes: [], details: 'Quick verify stub' }; },
  CONFIG: { PASS_THRESHOLD: 65 },
};
`;
  fs.writeFileSync(VERIFY_SRC, stub);
  console.log('⚠ Created stub verification_engine.js (decryption failed).');
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

const command = process.argv[2] || '';

switch (command) {
  case 'encrypt':
    encrypt();
    break;
  case 'decrypt':
    decrypt();
    break;
  default:
    console.log('Usage: node scripts/protect_verify.js <encrypt|decrypt>');
    console.log('');
    console.log('  encrypt — Encrypt verification_engine.js → .js.enc (commit this)');
    console.log('  decrypt — Decrypt .js.enc → .js (called by build)');
    console.log('');
    console.log('First-time setup:');
    console.log('  1. Write verification_engine.js');
    console.log('  2. node scripts/protect_verify.js encrypt');
    console.log('  3. Add verification_engine.js to .gitignore');
    console.log('  4. Commit verification_engine.js.enc');
    console.log('  5. Set POLARIS_VERIFY_KEY in GitHub Secrets for CI build');
    process.exit(1);
}
