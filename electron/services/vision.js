/**
 * ═══════════════════════════════════════════════════════════
 *  Polaris Vision Service — 多模态视觉模型路由
 *  ─────────────────────────────────────────────────────────
 *  所有"看图"能力走这里：computer-use 视觉决策、截图分析。
 *
 *  默认后端：豆包（火山引擎 Ark，OpenAI 兼容，支持图像输入）
 *  endpoint: ark.cn-beijing.volces.com/api/v3/chat/completions
 *
 *  文本推理仍走 DeepSeek；视觉任务路由到本服务（豆包）。
 * ═══════════════════════════════════════════════════════════
 */
const https = require('https');

// 内置豆包视觉 key（来自启文项目，用户授权复用；设置面板可覆盖）
const BUILTIN_VISION_KEY = 'ark-0f0fd51c-1395-45bd-9df0-29a195257d96-5ab55';

let _visionKey = null;
let _visionModel = process.env.POLARIS_VISION_MODEL || 'doubao-seed-2-0-pro-260215';
let _visionEndpoint = process.env.POLARIS_VISION_ENDPOINT || 'ark.cn-beijing.volces.com';

function setVisionKey(k) { if (k) _visionKey = k; }
function setVisionModel(m) { if (m) _visionModel = m; }
function getVisionKey() { return _visionKey || process.env.POLARIS_VISION_KEY || BUILTIN_VISION_KEY; }

/**
 * 分析屏幕截图，返回下一步动作 JSON（视觉 computer-use 决策核心）。
 * @param {string} imageBase64 - 截图的 base64（可带 data:image/png;base64, 前缀）
 * @param {string} goal         - 用户目标
 * @param {Array}  history      - 已完成动作 [{action, result}]
 * @param {string} visionKey    - 可选，本次调用覆盖 key
 * @returns {Promise<{action:object, raw:string, error?:string}>}
 */
async function analyzeScreen({ imageBase64, goal, history, visionKey }) {
  const key = visionKey || getVisionKey();
  if (!key) return { action: { action: 'done', summary: '未配置视觉模型 key' }, raw: '', error: 'no vision key' };
  if (!imageBase64) return { action: { action: 'done', summary: '无截图' }, raw: '', error: 'no screenshot' };

  const hist = (history || []).slice(-8).map(function(h) { return (h.action || '') + ': ' + (h.result || ''); }).join('\n');
  const sys = '你是桌面视觉自动化助手，你能"看到"当前屏幕截图。根据用户目标和已完成的历史动作，决定"下一步"单个动作。\n' +
    '屏幕坐标：图片左上角是 (0,0)，右下角是 (width,height)。click / double_click 必须给出精确像素坐标（先看图里目标元素的位置）。\n' +
    '只输出一个 JSON 对象（不要 markdown 代码块、不要任何其他文字），action 字段必须是以下之一：\n' +
    'click(x,y) / double_click(x,y) / type(text) / hotkey(combo) / scroll(direction:up|down) / open_browser(url) / open_app(app) / done(summary)\n' +
    '示例：{"action":"click","x":420,"y":180} 或 {"action":"done","summary":"已看到目标页面"}\n' +
    '如果目标已达成、或连续几步无实质进展，输出 done。危险操作（删除文件/格式化/关机）绝不要输出。';
  const user = '目标：' + goal + '\n\n已完成历史：\n' + (hist || '(无)') + '\n\n现在仔细看这张截图，输出下一步动作 JSON。';

  const imgUrl = String(imageBase64).startsWith('data:') ? imageBase64 : 'data:image/png;base64,' + imageBase64;

  const body = JSON.stringify({
    model: _visionModel,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: [
        { type: 'text', text: user },
        { type: 'image_url', image_url: { url: imgUrl } },
      ]},
    ],
    max_tokens: 300,
    temperature: 0,
  });

  const content = await new Promise(function(resolve) {
    const req = https.request({
      hostname: _visionEndpoint,
      path: '/api/v3/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, function(resp) {
      let d = '';
      resp.on('data', function(c) { d += c.toString(); });
      resp.on('end', function() {
        try { resolve((JSON.parse(d).choices?.[0]?.message?.content) || ''); }
        catch (e) { resolve(''); }
      });
    });
    req.on('error', function() { resolve(''); });
    req.on('timeout', function() { req.destroy(); resolve(''); });
    req.write(body); req.end();
  });

  const m = content.match(/\{[\s\S]*\}/);
  let action = null;
  if (m) { try { action = JSON.parse(m[0]); } catch {} }
  if (!action || !action.action) action = { action: 'done', summary: 'no action' };
  return { action: action, raw: content };
}

module.exports = { analyzeScreen, setVisionKey, setVisionModel, getVisionKey };
