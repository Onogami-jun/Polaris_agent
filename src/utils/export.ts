import type { ChatSession } from '../store/chatSlice';

export function exportMarkdown(session: ChatSession): string {
  const lines = ['# ' + session.name, '', '> 导出时间: ' + new Date().toLocaleString(), ''];
  session.messages.forEach(m => {
    const role = m.role === 'user' ? '## 👤 用户' : '## 🤖 AI';
    lines.push(role + '\n');
    lines.push(m.content + '\n');
    lines.push('---\n');
  });
  return lines.join('\n');
}

export function exportPDF(session: ChatSession): void {
  const md = exportMarkdown(session);
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + session.name + '</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;line-height:1.8;color:#333}h1{font-size:24px}h2{font-size:16px;color:#666}p{white-space:pre-wrap}</style></head><body>' + md.split('\n').map(l => l.startsWith('#') ? '<h1>' + l.replace(/^# /, '') + '</h1>' : l.startsWith('##') ? '<h2>' + l.replace(/^## /, '') + '</h2>' : l === '---' ? '<hr/>' : '<p>' + l + '</p>').join('\n') + '</body></html>';
  const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500); }
}

export function shareLink(session: ChatSession): string {
  // Encode the session as a base64 JSON blob for sharing
  const json = JSON.stringify({ name: session.name, messages: session.messages.map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp })) });
  const encoded = btoa(unescape(encodeURIComponent(json)));
  return window.location.origin + window.location.pathname + '#share=' + encoded.slice(0, 200);
}

export function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
