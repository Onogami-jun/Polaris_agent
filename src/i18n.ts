/* Polaris Solver — Full i18n dictionary (4 languages)
   Import: import { t, langInstruction } from './i18n'
   Use:    t(lang, 'settings.general') → returns translated string
           langInstruction(lang) → returns prompt suffix for LLM */

const DICT: any = {
  'zh-CN': {
    settings: {
      tabs: { general:'通用', models:'模型', agent:'代理', plugins:'插件', data:'数据', account:'账号', sandbox:'沙箱', lab:'实验', about:'关于' },
      general: { title:'通用', theme:'主题', themeHint1:'浅色模式', themeHint2:'深色模式', themeLight:'浅色', themeDark:'深色', language:'语言', fontSize:'字体大小', autoExecute:'自动执行', autoExecuteHint:'Agent 生成计划后自动执行', contextMemory:'上下文记忆', contextMemoryHint:'跨对话记住用户偏好', showGuide:'显示引导页', showGuideHint:'重新显示首次启动引导', showGuideBtn:'重新引导', mascotTitle:'吉祥物 Pola', mascotShow:'显示吉祥物', mascotShowHint:'在聊天区显示啵啦吉祥物', mascotClick:'点击互动', mascotClickHint:'点击吉祥物时播放动画', mascotWander:'自动闲逛', mascotWanderHint:'长时间不用时自动在聊天区移动', mascotSleepy:'犯困动画', mascotSleepyHint:'超长时间不理它会打瞌睡' },
      models: { title:'模型 API', desc:'内置 DeepSeek 免费密钥已包含。添加你自己的 API Key 以解锁更多模型。', deepseekNote:'V3 / R1 模型', anthropicNote:'Claude Sonnet / Opus', openaiNote:'GPT-4o / o1', serperNote:'联网搜索 API', githubNote:'Agent 创建 PR 用', deepseekPlaceholder:'已内置 · 可覆盖' },
      agent: { title:'代理配置', name:'代理名称', nameHint:'显示给用户的名字', systemPrompt:'系统提示词', systemPromptHint:'定义 Agent 的行为风格', reasoningStyle:'推理风格', concise:'简洁', detailed:'详细', creative:'创意', maxTokens:'最大 Token', temperature:'温度' },
      plugins: { title:'已安装插件', empty:'+ 从 MCP 注册表安装插件' },
      data: { title:'数据与导出', exportJson:'导出对话', exportJsonHint:'将所有对话导出为 JSON 文件', exportJsonBtn:'导出 JSON', exportMd:'导出当前对话', exportMdHint:'导出当前会话为 Markdown', exportMdBtn:'导出 Markdown', sync:'同步设置', syncHint:'登录 BitWool 后自动同步', syncLogged:'已登录 · 云端同步已启用', syncUnlogged:'未登录 · 仅本地存储', dangerTitle:'危险区域', reset:'清除所有数据', resetHint:'删除所有对话和本地设置', resetBtn:'重置' },
      account: { title:'BitWool 账号', plan:'计划', createdAt:'创建时间', logout:'退出登录', loginTitle:'登录 BitWool 账号以启用云端同步', loginBtn:'登录', email:'邮箱', password:'密码' },
      sandbox: { title:'Python 沙箱', desc:'自动下载并配置便携 Python 环境，无需手动安装。polaris-opt 引擎从本地代码仓库自动链接。', ready:'已就绪', notReady:'未安装', installed:'已安装', notInstalled:'未安装', installBtn:'一键安装沙箱', repairBtn:'修复沙箱', installing:'安装中...', repairing:'修复中...', info1:'Python 环境安装在', info2:'polaris-opt 从', info3:'pip 镜像源已设为阿里云，下载更快' },
      lab: { title:'实验' },
      about: { title:'关于 Polaris Solver', subtitle:'运筹优化科研助手', author:'作者', authorVal:'BitWool Studio', email:'邮箱', license:'许可证', licenseVal:'MIT License' },
    },
    chat: {
      emptyTitle:'描述你的优化问题', emptyDesc:'试试：「背包容量50，价值60 100 120，重量10 20 30」', placeholder:'描述优化问题... Enter 发送，Shift+Enter 换行', thinking:'思考中...', fast:'快速', quality:'优质', expert:'专家', footer:'Enter 发送 · Shift+Enter 换行', newSession:'新对话',
    },
    sidebar: { sessions:'会话', settings:'设置', lab:'实验 Lab', login:'登录 BitWool', logout:'登出' },
    userMenu: { switchAccount:'切换账号', logout:'退出登录' },
    workflow: { title:'工作流', tools:'工具调用', running:'运行中', idle:'就绪', waiting:'等待任务', stop:'停止执行' },
    permission: { title:'Polaris 请求权限', subtitle:'Agent 正在尝试执行以下操作', deny:'拒绝', allow:'允许' },
  },
  'en': {
    settings: {
      tabs: { general:'General', models:'Models', agent:'Agent', plugins:'Plugins', data:'Data', account:'Account', sandbox:'Sandbox', lab:'Lab', about:'About' },
      general: { title:'General', theme:'Theme', themeHint1:'Light', themeHint2:'Dark', themeLight:'Light', themeDark:'Dark', language:'Language', fontSize:'Font Size', autoExecute:'Auto Execute', autoExecuteHint:'Auto-execute plans after generation', contextMemory:'Context Memory', contextMemoryHint:'Remember user preferences across sessions', showGuide:'Show Onboarding', showGuideHint:'Re-display first-launch guide', showGuideBtn:'Re-guide', mascotTitle:'Mascot Pola', mascotShow:'Show Mascot', mascotShowHint:'Display Pola in chat area', mascotClick:'Click Interaction', mascotClickHint:'Play animation on click', mascotWander:'Auto Wander', mascotWanderHint:'Move around when idle', mascotSleepy:'Sleepy Animation', mascotSleepyHint:'Fall asleep when ignored' },
      models: { title:'Model API', desc:'Built-in DeepSeek key included. Add your own API keys to unlock more models.', deepseekNote:'V3 / R1 models', anthropicNote:'Claude Sonnet / Opus', openaiNote:'GPT-4o / o1', serperNote:'Web search API', deepseekPlaceholder:'Built-in · Overridable' },
      agent: { title:'Agent Config', name:'Agent Name', nameHint:'Name shown to user', systemPrompt:'System Prompt', systemPromptHint:'Define Agent behavior style', reasoningStyle:'Reasoning Style', concise:'Concise', detailed:'Detailed', creative:'Creative', maxTokens:'Max Tokens', temperature:'Temperature' },
      plugins: { title:'Installed Plugins', empty:'+ Install from MCP Registry' },
      data: { title:'Data & Export', exportJson:'Export Conversations', exportJsonHint:'Export all conversations as JSON', exportJsonBtn:'Export JSON', exportMd:'Export Current', exportMdHint:'Export current session as Markdown', exportMdBtn:'Export Markdown', sync:'Sync Settings', syncHint:'Auto-sync after BitWool login', syncLogged:'Logged in · Cloud sync enabled', syncUnlogged:'Not logged in · Local only', dangerTitle:'Danger Zone', reset:'Clear All Data', resetHint:'Delete all conversations and local settings', resetBtn:'Reset' },
      account: { title:'BitWool Account', plan:'Plan', createdAt:'Member Since', logout:'Logout', loginTitle:'Sign in to enable cloud sync', loginBtn:'Sign In', email:'Email', password:'Password' },
      sandbox: { title:'Python Sandbox', desc:'Auto-download portable Python environment. No manual setup required.', ready:'Ready', notReady:'Not Installed', installed:'Installed', notInstalled:'Not Installed', installBtn:'One-click Install', repairBtn:'Repair', installing:'Installing...', repairing:'Repairing...', info1:'Python installed at', info2:'polaris-opt linked from', info3:'pip mirror set to Alibaba Cloud' },
      lab: { title:'Lab' },
      about: { title:'About Polaris Solver', subtitle:'Optimization Research Agent', author:'Author', authorVal:'BitWool Studio', email:'Email', license:'License', licenseVal:'MIT License' },
    },
    chat: {
      emptyTitle:'Describe your optimization problem', emptyDesc:'Try: "Knapsack capacity 50, values 60 100 120, weights 10 20 30"', placeholder:'Describe optimization problem... Enter to send, Shift+Enter for newline', thinking:'Thinking...', fast:'Fast', quality:'Quality', expert:'Expert', footer:'Enter to send · Shift+Enter for newline', newSession:'New Chat',
    },
    sidebar: { sessions:'Sessions', settings:'Settings', lab:'Lab', login:'Sign In', logout:'Logout' },
    userMenu: { switchAccount:'Switch Account', logout:'Logout' },
    workflow: { title:'Workflow', tools:'Tools', running:'Running', idle:'Idle', waiting:'Waiting...', stop:'Stop' },
    permission: { title:'Polaris requests permission', subtitle:'Agent wants to perform this action', deny:'Deny', allow:'Allow' },
  },
  'ja': {
    settings: {
      tabs: { general:'一般', models:'モデル', agent:'エージェント', plugins:'プラグイン', data:'データ', account:'アカウント', sandbox:'サンドボックス', lab:'実験', about:'情報' },
      general: { title:'一般', theme:'テーマ', themeHint1:'ライト', themeHint2:'ダーク', themeLight:'ライト', themeDark:'ダーク', language:'言語', fontSize:'フォントサイズ', autoExecute:'自動実行', autoExecuteHint:'計画生成後に自動実行', contextMemory:'コンテキスト記憶', contextMemoryHint:'セッション間で設定を記憶', showGuide:'ガイド表示', showGuideHint:'初回起動ガイドを再表示', showGuideBtn:'再ガイド', mascotTitle:'マスコット Pola', mascotShow:'マスコット表示', mascotShowHint:'チャットエリアにPolaを表示', mascotClick:'クリック操作', mascotClickHint:'クリックでアニメーション', mascotWander:'自動散歩', mascotWanderHint:'放置時に自動移動', mascotSleepy:'居眠り', mascotSleepyHint:'長時間放置で居眠り' },
      models: { title:'モデル API', desc:'DeepSeekキー内蔵。独自のAPIキーを追加してさらにモデルを利用可能。', deepseekNote:'V3 / R1 モデル', anthropicNote:'Claude Sonnet / Opus', openaiNote:'GPT-4o / o1', serperNote:'ウェブ検索 API', deepseekPlaceholder:'内蔵 · 上書き可' },
      agent: { title:'エージェント設定', name:'エージェント名', nameHint:'ユーザーに表示する名前', systemPrompt:'システムプロンプト', systemPromptHint:'エージェントの動作スタイル', reasoningStyle:'推論スタイル', concise:'簡潔', detailed:'詳細', creative:'クリエイティブ', maxTokens:'最大トークン', temperature:'温度' },
      plugins: { title:'インストール済み', empty:'+ MCPレジストリからインストール' },
      data: { title:'データとエクスポート', exportJson:'会話エクスポート', exportJsonHint:'全会話をJSONでエクスポート', exportJsonBtn:'JSON出力', exportMd:'現在の会話', exportMdHint:'現在のセッションをMarkdownで出力', exportMdBtn:'Markdown出力', sync:'同期設定', syncHint:'BitWoolログイン後に自動同期', syncLogged:'ログイン済 · クラウド同期有効', syncUnlogged:'未ログイン · ローカルのみ', dangerTitle:'危険区域', reset:'全データ削除', resetHint:'全会話とローカル設定を削除', resetBtn:'リセット' },
      account: { title:'BitWool アカウント', plan:'プラン', createdAt:'作成日', logout:'ログアウト', loginTitle:'クラウド同期を有効にする', loginBtn:'ログイン', email:'メール', password:'パスワード' },
      sandbox: { title:'Python サンドボックス', desc:'ポータブルPython環境を自動ダウンロード。手動設定不要。', ready:'準備完了', notReady:'未インストール', installed:'インストール済', notInstalled:'未インストール', installBtn:'ワンクリックインストール', repairBtn:'修復', installing:'インストール中...', repairing:'修復中...', info1:'Python環境:', info2:'polaris-opt連携元:', info3:'pipミラーはAlibaba Cloudに設定済み' },
      lab: { title:'実験' },
      about: { title:'Polaris Solver について', subtitle:'最適化研究アシスタント', author:'作者', authorVal:'BitWool Studio', email:'メール', license:'ライセンス', licenseVal:'MIT License' },
    },
    chat: {
      emptyTitle:'最適化問題を記述してください', emptyDesc:'例：「ナップサック容量50、価値60 100 120、重量10 20 30」', placeholder:'最適化問題を記述... Enterで送信、Shift+Enterで改行', thinking:'考え中...', fast:'高速', quality:'品質', expert:'専門家', footer:'Enterで送信 · Shift+Enterで改行', newSession:'新規チャット',
    },
    sidebar: { sessions:'セッション', settings:'設定', lab:'実験', login:'ログイン', logout:'ログアウト' },
    userMenu: { switchAccount:'アカウント切替', logout:'ログアウト' },
    workflow: { title:'ワークフロー', tools:'ツール', running:'実行中', idle:'待機中', waiting:'待機中...', stop:'停止' },
    permission: { title:'権限リクエスト', subtitle:'エージェントが操作を実行しようとしています', deny:'拒否', allow:'許可' },
  },
  'fr': {
    settings: {
      tabs: { general:'General', models:'Modeles', agent:'Agent', plugins:'Extensions', data:'Donnees', account:'Compte', sandbox:'Sandbox', lab:'Labo', about:'A propos' },
      general: { title:'General', theme:'Theme', themeHint1:'Clair', themeHint2:'Sombre', themeLight:'Clair', themeDark:'Sombre', language:'Langue', fontSize:'Taille police', autoExecute:'Auto-execution', autoExecuteHint:'Executer apres generation du plan', contextMemory:'Memoire', contextMemoryHint:'Se souvenir des preferences', showGuide:'Guide', showGuideHint:'Re-afficher le guide', showGuideBtn:'Re-guider', mascotTitle:'Mascotte Pola', mascotShow:'Afficher', mascotShowHint:'Afficher Pola', mascotClick:'Interaction', mascotClickHint:'Animation au clic', mascotWander:'Deplacement', mascotWanderHint:'Se deplace au repos', mascotSleepy:'Somnolence', mascotSleepyHint:'Sendort si ignore' },
      models: { title:'API Modeles', desc:'Cle DeepSeek integree. Ajoutez vos propres cles.', deepseekNote:'Modeles V3 / R1', anthropicNote:'Claude Sonnet / Opus', openaiNote:'GPT-4o / o1', serperNote:'Recherche web', deepseekPlaceholder:'Integree · Remplacable' },
      agent: { title:'Config Agent', name:'Nom Agent', nameHint:'Nom affiche', systemPrompt:'System Prompt', systemPromptHint:'Definir le comportement', reasoningStyle:'Style Raisonnement', concise:'Concis', detailed:'Detaille', creative:'Creatif', maxTokens:'Max Tokens', temperature:'Temperature' },
      plugins: { title:'Extensions', empty:'+ Installer du registre MCP' },
      data: { title:'Donnees & Export', exportJson:'Exporter conversations', exportJsonHint:'Tout exporter en JSON', exportJsonBtn:'Export JSON', exportMd:'Exporter session', exportMdHint:'Exporter en Markdown', exportMdBtn:'Export Markdown', sync:'Synchro', syncHint:'Synchro auto apres login', syncLogged:'Connecte · Synchro cloud', syncUnlogged:'Non connecte · Local seul', dangerTitle:'Zone dangereuse', reset:'Tout effacer', resetHint:'Supprimer conversations et parametres', resetBtn:'Reinitialiser' },
      account: { title:'Compte BitWool', plan:'Forfait', createdAt:'Membre depuis', logout:'Deconnexion', loginTitle:'Connectez-vous pour la synchro cloud', loginBtn:'Connexion', email:'Email', password:'Mot de passe' },
      sandbox: { title:'Sandbox Python', desc:'Telechargement automatique de Python portable.', ready:'Pret', notReady:'Non installe', installed:'Installe', notInstalled:'Non installe', installBtn:'Installer', repairBtn:'Reparer', installing:'Installation...', repairing:'Reparation...', info1:'Python installe dans', info2:'polaris-opt lie depuis', info3:'Miroir pip: Alibaba Cloud' },
      lab: { title:'Labo' },
      about: { title:'A propos', subtitle:'Assistant de recherche en optimisation', author:'Auteur', authorVal:'BitWool Studio', email:'Email', license:'Licence', licenseVal:'MIT License' },
    },
    chat: {
      emptyTitle:'Decrivez votre probleme', emptyDesc:'Essayez: "Sac a dos capacite 50, valeurs 60 100 120, poids 10 20 30"', placeholder:'Decrivez le probleme... Entree pour envoyer', thinking:'Reflexion...', fast:'Rapide', quality:'Qualite', expert:'Expert', footer:'Entree pour envoyer · Maj+Entree pour nouvelle ligne', newSession:'Nouveau chat',
    },
    sidebar: { sessions:'Sessions', settings:'Parametres', lab:'Labo', login:'Connexion', logout:'Deconnexion' },
    userMenu: { switchAccount:'Changer compte', logout:'Deconnexion' },
    workflow: { title:'Workflow', tools:'Outils', running:'En cours', idle:'Inactif', waiting:'En attente...', stop:'Arreter' },
    permission: { title:'Demande de permission', subtitle:'L\'agent souhaite effectuer cette action', deny:'Refuser', allow:'Autoriser' },
  },
};

function getPath(obj: any, path: string): string {
  const parts = path.split('.');
  let current = obj;
  for (const p of parts) {
    if (current && typeof current === 'object' && p in current) current = current[p];
    else return path; // fallback: return the key path itself
  }
  return typeof current === 'string' ? current : path;
}

export function t(lang: string, path: string): string {
  const dict = DICT[lang] || DICT['zh-CN'];
  return getPath(dict, path);
}

/** Return a language instruction to append to the LLM system prompt */
export function langInstruction(lang: string): string {
  const map: any = {
    'zh-CN': 'Always reply in Chinese (Simplified). Use natural, fluent Chinese.',
    'en': 'Always reply in English. Use natural, fluent English.',
    'ja': 'Always reply in Japanese. Use natural, fluent Japanese.',
    'fr': 'Always reply in French. Use natural, fluent French.',
  };
  return map[lang] || map['en'];
}
