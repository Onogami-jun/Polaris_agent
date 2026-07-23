/**
 * Polaris System Monitor — Agent Proactive Intervention Engine
 * Monitors keyboard/mouse/system state and triggers Agent interventions.
 * Implements the four-level intervention model (L0-L3).
 */
const { execSync } = require('child_process');
const os = require('os');

// ============================================================
// Intervention Levels (L0-L3)
// ============================================================
const LEVELS = { L0: 'silent', L1: 'ambient', L2: 'hint', L3: 'intervene' };

// Cooldown tracker — prevents spam
const cooldowns = new Map();      // eventKey → next_allowed_time
const rejections = new Map();     // eventKey → consecutive_reject_count
const lastInterventionTime = { value: 0 };

// System state
let kbActivity = { lastPress: Date.now(), count: 0, heavyCount: 0, deleteCount: 0, window: '' };
let agentState = 'ready'; // ready | quiet | meeting | sleep
let currentScene = 'solo_work';

// Callback for sending events to the frontend
let onIntervention = null;

// ============================================================
// Keyboard activity monitor (polling, no native hook needed)
// ============================================================
let monitorInterval = null;

function startMonitoring(callback) {
  onIntervention = callback;
  if (monitorInterval) return;

  monitorInterval = setInterval(() => {
    checkKeyboardIdle();
    checkTimeBasedEvents();
  }, 5000); // Check every 5 seconds

  console.log('[Polaris] System monitor started');
}

function stopMonitoring() {
  if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null; }
}

function updateKeyboardActivity(activity) {
  kbActivity = { ...kbActivity, ...activity };
  if (activity.window) kbActivity.window = activity.window;
  if (activity.count !== undefined) kbActivity.count += activity.count || 0;
  if (activity.heavy) kbActivity.heavyCount++;
  if (activity.delete) kbActivity.deleteCount++;
  kbActivity.lastPress = Date.now();
}

// ============================================================
// Scene-based intervention checks
// ============================================================
function setScene(scene) {
  currentScene = scene;
  // Auto state transitions per scene
  if (scene === 'meeting') agentState = 'meeting';
  else if (scene === 'bedtime') agentState = 'quiet';
  else if (scene === 'emergency') agentState = 'ready';
  else if (agentState === 'meeting' || agentState === 'quiet') agentState = 'ready';
}

function setAgentState(state) { agentState = state; }
function getAgentState() { return agentState; }

// ============================================================
// Keyboard idle detection
// ============================================================
function checkKeyboardIdle() {
  if (agentState !== 'ready') return;

  const idleMs = Date.now() - kbActivity.lastPress;

  // Check: idle for 2 minutes in a coding window?
  if (idleMs > 120000 && idleMs < 600000) {
    const hasCoding = /code|editor|ide|terminal|vscode|sublime|intellij|notepad/i.test(kbActivity.window);
    const wasActive = kbActivity.count > 20;

    if (hasCoding && wasActive && kbActivity.deleteCount > 3) {
      triggerIntervention('keyboard_idle_code', LEVELS.L2, {
        title: '需要帮助吗？',
        body: '检测到你可能在调试代码。需要我帮你查找解决方案吗？',
        level: 2,
        actions: [{ label: '查一下', action: 'search' }, { label: '不用', action: 'dismiss' }],
        timeout: 30000,
      });
    }
  }

  // Reset keyboard counters periodically
  if (idleMs > 300000) {
    kbActivity.count = 0;
    kbActivity.deleteCount = 0;
    kbActivity.heavyCount = 0;
  }
}

function checkTimeBasedEvents() {
  const now = new Date();
  const hour = now.getHours();

  // Bedtime reminder (22:00)
  if (hour === 22 && currentScene !== 'bedtime' && agentState === 'ready') {
    triggerIntervention('bedtime_reminder', LEVELS.L1, {
      title: '夜深了',
      body: '需要我总结今天的要点吗？',
      level: 1,
      timeout: 15000,
    });
  }

  // Morning briefing hint (09:00)
  if (hour === 9 && currentScene === 'solo_work' && agentState === 'ready') {
    triggerIntervention('morning_brief', LEVELS.L2, {
      title: '早上好',
      body: '需要我查看今天的日程和待办吗？',
      level: 2,
      actions: [{ label: '查看', action: 'brief' }, { label: '不用', action: 'dismiss' }],
      timeout: 30000,
    });
  }
}

// ============================================================
// Intervention engine
// ============================================================
function triggerIntervention(eventKey, level, card) {
  // Check agent state
  if (agentState === 'sleep') return;
  if (agentState === 'quiet' && level !== LEVELS.L3) return;
  if (agentState === 'meeting' && level !== LEVELS.L3) return;

  // Check cooldown
  const cooldownKey = `${eventKey}_${card.title}`;
  const nextAllowed = cooldowns.get(cooldownKey);
  if (nextAllowed && Date.now() < nextAllowed) return;

  // Check rate limit (max 1 intervention per 3 minutes)
  if (Date.now() - lastInterventionTime.value < 180000 && level !== LEVELS.L3) return;

  // Check rejection streak
  const rejCount = rejections.get(cooldownKey) || 0;
  if (rejCount >= 3) return; // Given up on this type

  // L2/L3 require user confirmation, send to frontend
  card.timestamp = Date.now();
  card.eventKey = cooldownKey;
  lastInterventionTime.value = Date.now();

  if (onIntervention) {
    onIntervention(card);
  }

  return card;
}

function recordFeedback(eventKey, accepted) {
  const rejCount = rejections.get(eventKey) || 0;
  if (accepted) {
    rejections.set(eventKey, Math.max(0, rejCount - 1));
    cooldowns.set(eventKey, Date.now() + 120000); // 2 min cooldown after accept
  } else {
    rejections.set(eventKey, rejCount + 1);
    const backoff = Math.min(rejCount + 1, 10) * 60000 * (rejCount + 1);
    cooldowns.set(eventKey, Date.now() + backoff); // Exponential backoff
  }
}

// ============================================================
// System info for proactive context
// ============================================================
function getSystemContext() {
  return {
    platform: os.platform(),
    hostname: os.hostname(),
    uptime: os.uptime(),
    cpuLoad: os.loadavg(),
    freeMem: os.freemem(),
    totalMem: os.totalmem(),
    agentState,
    currentScene,
    kbActivity: {
      lastPressAgo: Date.now() - kbActivity.lastPress,
      keyCount: kbActivity.count,
      deleteCount: kbActivity.deleteCount,
      window: kbActivity.window,
    },
  };
}

module.exports = {
  startMonitoring, stopMonitoring, updateKeyboardActivity,
  setScene, setAgentState, getAgentState,
  triggerIntervention, recordFeedback, getSystemContext,
  LEVELS,
};
