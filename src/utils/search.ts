export async function webSearch(query: string, apiKey?: string): Promise<{title:string;link:string;snippet:string}[]> {
  const key = apiKey || '';
  if (!key) {
    try { const r = await fetch('https://api.duckduckgo.com/?q='+encodeURIComponent(query)+'&format=json&no_html=1'); const d = await r.json(); const results = (d.RelatedTopics||[]).slice(0,5).map((t:any)=>({title:t.Text?.split('-')[0]||query,link:t.FirstURL||'',snippet:t.Text||''})); if (results.length) return results; } catch {}
    return [{title:'未配置搜索引擎 API',link:'',snippet:'在 设置→连接 中添加 Serper API Key 以启用联网搜索。'}];
  }
  const r = await fetch('https://google.serper.dev/search',{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({q:query,num:5})});
  const d = await r.json();
  return (d.organic||[]).map((o:any)=>({title:o.title,link:o.link,snippet:o.snippet}));
}
