import React, { useState, useMemo } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { newSession as ns, setActiveSession, deleteSession, togglePlugin, setStrategy, newSession } from '../store/chatSlice';
import type { Strategy } from '../store/chatSlice';
import { deleteSessionStorage } from '../store/persist';

// ── Task category templates ────────────────────────────────

const CATEGORIES = [
  { id:'ppt', icon:'📊', label:'演示文稿', items:[
    { name:'产品发布会', prompt:'帮我创建一份产品发布会PPT大纲，包含：封面、产品亮点（3点）、市场数据、团队介绍、路线图。每页用简洁的要点呈现。' },
    { name:'项目汇报', prompt:'帮我写一份项目进展汇报PPT。包含：项目概况、本阶段成果、关键指标、风险与对策、下阶段计划。共5-7页。' },
    { name:'商业计划书', prompt:'帮我写一份商业计划书PPT大纲。包含：项目概述、市场分析、商业模式、竞争优势、财务预测、团队介绍。10页左右。' },
    { name:'年终总结', prompt:'帮我写一份年终工作总结PPT。包含：年度回顾、核心业绩、项目成果、不足与反思、明年目标。简洁务实。' },
  ]},
  { id:'spreadsheet', icon:'📈', label:'表格与数据', items:[
    { name:'数据分析', prompt:'我有一份销售数据需要分析。请告诉我应该关注哪些指标，用什么统计方法。数据列包括：日期、产品、销量、单价、区域。' },
    { name:'财务报表', prompt:'帮我创建一个月度财务报表模板。包含：收入明细、成本分类、毛利计算、费用汇总、净利润。用清晰的表格结构呈现。' },
    { name:'数据清洗', prompt:'我需要清洗一份CSV数据。请给我一个清洗清单和处理步骤，包括：去重、空值处理、格式统一、异常值检测。' },
    { name:'问卷调查', prompt:'帮我设计一份用户满意度调查问卷。包含：基本信息、产品体验（5题）、服务评价（3题）、开放建议。用表格形式组织。' },
  ]},
  { id:'web', icon:'🌐', label:'网站与页面', items:[
    { name:'落地页', prompt:'帮我设计一个产品落地页的结构。包含：Hero区、功能展示（3栏）、用户评价、价格方案、底部CTA。注重转化率设计。' },
    { name:'个人主页', prompt:'帮我设计一个开发者个人主页。包含：个人简介、技能标签、项目展示（3个）、博客摘要、联系方式。简洁专业风格。' },
    { name:'文档站点', prompt:'帮我规划一个技术文档站点的信息架构。包含：快速开始、API参考、教程指南、FAQ。用清晰的目录结构呈现。' },
    { name:'电商页面', prompt:'帮我设计一个商品详情页的布局方案。包含：商品图片轮播、规格选择、价格展示、用户评价、推荐搭配。注重购买转化。' },
  ]},
  { id:'code', icon:'💻', label:'编程开发', items:[
    { name:'代码审查', prompt:'请审查以下代码，指出潜在问题、性能瓶颈和安全风险：\n\n```\n{{code}}\n```' },
    { name:'API设计', prompt:'帮我设计一个RESTful API。需求：用户管理系统，包含注册、登录、信息修改、权限管理。请列出端点、请求/响应格式、错误码。' },
    { name:'算法实现', prompt:'请用Python实现以下算法，要求包含时间复杂度分析和测试用例。请先描述思路再写代码。' },
    { name:'架构设计', prompt:'帮我设计一个微服务架构方案。系统需求：用户服务、订单服务、支付服务、通知服务。请说明服务拆分、通信方式、数据一致性策略。' },
    { name:'Bug排查', prompt:'我的代码出现了以下问题，请帮我排查原因并给出修复方案。请先分析可能的原因，再给出修改建议。' },
  ]},
  { id:'writing', icon:'✍️', label:'写作创作', items:[
    { name:'文章撰写', prompt:'帮我写一篇文章。主题待定，请先问我几个问题来确定方向、读者、风格和篇幅。' },
    { name:'邮件起草', prompt:'帮我起草一封邮件。请先问清楚收件人、目的、语气，然后写一个版本供我修改。' },
    { name:'翻译润色', prompt:'请将以下内容翻译并润色，保持原文风格和语气。如果是英文翻译为中文，要确保表达地道自然。' },
    { name:'会议纪要', prompt:'根据以下讨论内容生成一份结构化的会议纪要。格式：会议主题 — 参会人员 — 讨论议题 — 结论 — 行动项（负责人+截止日期）。' },
    { name:'营销文案', prompt:'帮我撰写一段产品营销文案。请先了解产品特点、目标用户和投放渠道，然后给出2-3个版本供选择。' },
  ]},
  { id:'research', icon:'🔬', label:'研究分析', items:[
    { name:'行业调研', prompt:'帮我做一份行业调研分析。请先确定行业范围，然后从市场规模、竞争格局、发展趋势、关键玩家四个维度展开。' },
    { name:'竞品分析', prompt:'帮我做一份竞品分析。对比3-5个主要竞品，从产品功能、定价策略、用户体验、市场份额四个维度分析。' },
    { name:'论文辅助', prompt:'我正在进行学术研究，需要帮助。请先了解我的研究方向和阶段（选题/文献/方法/写作），然后提供针对性的建议。' },
    { name:'投资分析', prompt:'请帮我分析一个投资项目。提供项目基本信息后，从市场前景、团队能力、商业模式、风险评估四个角度给出分析。' },
  ]},
];

const SidebarFull: React.FC<{ onClose: () => void; onUseTemplate?: (prompt: string) => void }> = ({ onClose, onUseTemplate }) => {
  const d = useAppDispatch();
  const { sessions, activeSessionId, settings, strategy } = useAppSelector(s => s.chat);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'chats'|'tools'|'templates'|'plugins'>('chats');
  const [ws, setWs] = useState('all');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const workspaces = useMemo(() => {
    const names = new Set(sessions.map(s => s.name.split(/\s[-–—]/)[0]).filter(Boolean));
    return ['all', ...Array.from(names).slice(0, 10)];
  }, [sessions]);

  const list = useMemo(() => {
    let f = sessions;
    if (q) f = f.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
    if (ws !== 'all') f = f.filter(s => s.name.startsWith(ws));
    return f;
  }, [sessions, q, ws]);

  const fmt = (t: number) => { const d2 = new Date(t); return d2.getMonth()+1+'/'+d2.getDate(); };
  const pluginStatus = settings.plugins.filter(p => p.enabled).length;

  const handleTemplate = (prompt: string) => {
    if (onUseTemplate) onUseTemplate(prompt);
  };

  return (
    <div className="side">
      <div className="side-hd">
        <div className="side-logo">POLARIS</div>
        <button onClick={onClose} className="side-cl">✕</button>
      </div>

      <button className="side-new" onClick={() => d(ns())}>＋ 新对话</button>

      <div className="side-tabs">
        <button className={'side-tb' + (tab === 'chats' ? ' on' : '')} onClick={() => setTab('chats')}>对话</button>
        <button className={'side-tb' + (tab === 'templates' ? ' on' : '')} onClick={() => setTab('templates')}>模板</button>
        <button className={'side-tb' + (tab === 'tools' ? ' on' : '')} onClick={() => setTab('tools')}>工具</button>
        <button className={'side-tb' + (tab === 'plugins' ? ' on' : '')} onClick={() => setTab('plugins')}>
          插件{pluginStatus > 0 ? <span className="side-dot-sm" /> : null}
        </button>
      </div>

      {/* Chats */}
      {tab === 'chats' && (<>
        <div className="side-srch"><input placeholder="搜索…" value={q} onChange={e => setQ(e.target.value)} /></div>
        {workspaces.length > 1 && (<div className="side-ws">{workspaces.map(w => <button key={w} className={'side-wb' + (ws===w?' on':'')} onClick={() => setWs(w)}>{w==='all'?'全部':w}</button>)}</div>)}
        <div className="side-list">
          {list.map(s => (<div key={s.id} className={'side-it' + (s.id===activeSessionId?' on':'')} onClick={() => d(setActiveSession(s.id))}><span className="side-dot"/><span className="side-nm">{s.name}</span><span className="side-dt">{fmt(s.createdAt)}</span><button className="side-del" onClick={e => { e.stopPropagation(); if (s.id!=='default') { d(deleteSession(s.id)); deleteSessionStorage(s.id); } }}>×</button></div>))}
          {list.length===0 && <div className="side-empty">没有匹配的对话</div>}
        </div>
      </>)}

      {/* Templates */}
      {tab === 'templates' && (<div className="side-tools">
        {CATEGORIES.map(cat => (<div key={cat.id} className="side-tpl-cat">
          <button className="side-tpl-hd" onClick={() => setExpandedCat(expandedCat===cat.id?null:cat.id)}>
            <span className="side-tpl-icon">{cat.icon}</span>
            <span className="side-tpl-label">{cat.label}</span>
            <span className={'side-tpl-arrow' + (expandedCat===cat.id?' open':'')}>▸</span>
          </button>
          {expandedCat===cat.id && <div className="side-tpl-items">
            {cat.items.map((item, i) => (
              <button key={i} className="side-tpl-item" onClick={() => handleTemplate(item.prompt)}>
                {item.name}
              </button>
            ))}
          </div>}
        </div>))}
      </div>)}

      {/* Tools */}
      {tab === 'tools' && (<div className="side-tools">
        <div className="side-section-title">快捷操作</div>
        <button className="side-tool" onClick={async () => { try { const api = window.electronAPI; if (api) { await api.desktopScreenshot(); } } catch {} }}><span className="side-ti">📷</span><span>截图分析</span></button>
        <button className="side-tool" onClick={() => { d(ns()); d(setStrategy('ensemble' as Strategy)); }}><span className="side-ti">◈</span><span>多模型协同</span></button>
        <div className="side-section-title" style={{ marginTop: 16 }}>当前策略</div>
        <div className="side-strat-row">{(['best_quality','cost_optimized','ensemble'] as Strategy[]).map(s => <button key={s} className={'side-strat'+(strategy===s?' on':'')} onClick={()=>d(setStrategy(s))}>{{best_quality:'优质',cost_optimized:'省钱',ensemble:'协同'}[s]}</button>)}</div>
      </div>)}

      {/* Plugins */}
      {tab === 'plugins' && (<div className="side-tools">
        <div className="side-section-title">已安装插件</div>
        {settings.plugins.map(p => (<div key={p.id} className="side-plugin-row"><div><div className="side-pn">{p.name}</div><div className="side-pd">{p.description}</div></div><button className={'side-ptoggle'+(p.enabled?' on':'')} onClick={()=>d(togglePlugin(p.id))}>{p.enabled?'ON':'OFF'}</button></div>))}
        <div className="side-mcp-note">MCP Registry 即将开放</div>
      </div>)}

      <div className="side-ft-row"><span>v0.9.0</span><span className="side-ft-dot"/><span>BitWool</span></div>
    </div>
  );
};

export default SidebarFull;
export { CATEGORIES };
