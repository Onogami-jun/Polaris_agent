"""Fix: empty placeholder, garbled md(), streaming robustness"""
import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# ── Fix 1: Don't create empty placeholder message ──
old = "d(addMessage({sessionId:sid,message:{id:msgId,role:'assistant',content:'',timestamp:Date.now()}}));"
new = "// Placeholder added lazily on first real content chunk"
c = c.replace(old, new)
if old in c: print("WARN: placeholder not fully replaced")

# ── Fix 2: Rewrite md() function ──
# Find the md function boundaries
start = c.find('function md(t:string):string{')
hl_start = c.find('function hl(c:string,l:string):string{')
old_md = c[start:hl_start]

new_md = (
    'function md(t:string):string{\n'
    'var BL="%%BLOCK%%";var BE="%%BEND%%";\n'
    'var blocks=[];var out="";var inB=false;var lang="";var bc="";\n'
    'for(var i=0;i<t.length;i++){\n'
    ' if(t.substr(i,3)==="```"){\n'
    '  if(inB){blocks.push({l:lang,c:bc.trim()});out+=BL+(blocks.length-1)+BE;bc="";lang="";inB=false;i+=2;}\n'
    '  else{inB=true;i+=2;while(i+1<t.length&&t[i+1]!=="\\n"[0]&&t[i+1]!=="\\r"[0]){lang+=t[i+1];i++;}if(t[i+1]==="\\r"[0])i++;i++;}\n'
    '  continue;}\n'
    ' if(inB){bc+=t[i];}else{out+=t[i];}\n'
    '}\n'
    'out=out.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");\n'
    'out=out.replace(new RegExp(BL+"(\\\\d+)"+BE,"g"),function(_,idx){\n'
    ' var b=blocks[parseInt(idx)];\n'
    ' var ec=b.c.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");\n'
    ' return "<div class=\\"code-block my-3 rounded-lg border border-border overflow-hidden\\"><div class=\\"flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border\\"><span class=\\"text-[10px] font-mono text-muted-foreground\\">"+(b.l||"plaintext")+"</span><button onclick=\\"copyCode(this)\\" class=\\"text-[10px] text-muted-foreground hover:text-foreground font-mono transition-colors\\">复制</button></div><pre class=\\"p-4 overflow-x-auto text-xs font-mono leading-relaxed\\"><code>"+hl(ec,b.l)+"</code></pre></div>";\n'
    '});\n'
    "out=out.replace(/`([^`]+)`/g,'<code class=\"bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary\">$1</code>');\n"
    "out=out.replace(/\\*\\*(.+?)\\*\\*/g,'<strong class=\"font-semibold\">$1</strong>');\n"
    "out=out.replace(/\\*(.+?)\\*/g,'<em class=\"text-muted-foreground\">$1</em>');\n"
    "out=out.replace(/^### (.+)/gm,'<h3 class=\"text-sm font-semibold mt-4 mb-2\">$1</h3>');\n"
    "out=out.replace(/^## (.+)/gm,'<h2 class=\"text-base font-semibold mt-5 mb-3\">$1</h2>');\n"
    "out=out.replace(/^# (.+)/gm,'<h1 class=\"text-lg font-bold mt-5 mb-3 pb-2 border-b border-border\">$1</h1>');\n"
    "out=out.replace(/^[-*] (.+)/gm,'<li class=\"ml-4 text-sm\">$1</li>');\n"
    "var br2=new RegExp('\\\\n\\\\n','g');out=out.replace(br2,'<br/><br/>');\n"
    "var br1=new RegExp('\\\\n','g');out=out.replace(br1,'<br/>');\n"
    "return'<p>'+out+'</p>';}\n\n"
)
c = c.replace(old_md, new_md)

# ── Fix 3: Add message on first content (not placeholder) ──
old_chunk = (
    "streamApi.onStreamChunk(function(chunk){\n"
    "        if(stop.current)return;\n"
    "        if(chunk.type==='thinking'){setThinking(chunk.text||'');}\n"
    "        else if(chunk.type==='content'){\n"
    "          fullContent=chunk.full||fullContent;setThk('');\n"
    "          d(updateLastAssistant({sessionId:sid,content:fullContent}));\n"
    "        }\n"
    "        else if(chunk.type==='tool_call'){setThinking('调用工具...');}\n"
    "      });"
)
new_chunk = (
    "streamApi.onStreamChunk(function(chunk){\n"
    "        if(stop.current)return;\n"
    "        if(chunk.type==='thinking'){setThinking(chunk.text||'');}\n"
    "        else if(chunk.type==='content'){\n"
    "          fullContent=chunk.full||fullContent;setThk('');\n"
    "          if(!hasAdded){d(addMessage({sessionId:sid,message:{id:msgId,role:'assistant',content:fullContent,timestamp:Date.now()}}));hasAdded=true;}else{d(updateLastAssistant({sessionId:sid,content:fullContent}));}\n"
    "        }\n"
    "        else if(chunk.type==='tool_call'){setThinking('调用工具...');}\n"
    "      });"
)
c = c.replace(old_chunk, new_chunk)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

print("OK")
print("md size:", len(new_md))
print("has new onChunk logic:", "hasAdded" in c)
