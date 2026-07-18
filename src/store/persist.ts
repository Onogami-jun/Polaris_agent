/* localStorage chat persistence */
import type { ChatSession } from './chatSlice';
const P = 'ps_', IDX = 'ps_idx', SET = 'ps_set';
export function saveSessions(sessions: ChatSession[]): void {
  try{const ids:string[]=[];sessions.forEach(s=>{if(!s.messages||s.messages.length===0)return;localStorage.setItem(P+s.id,JSON.stringify(s));ids.push(s.id)});localStorage.setItem(IDX,JSON.stringify(ids))}catch(e){console.warn('saveSessions failed',e)}
}
export function loadSessions(): ChatSession[] {
  try{const ids=JSON.parse(localStorage.getItem(IDX)||'[]');const out:ChatSession[]=[];ids.forEach((id:string)=>{const r=localStorage.getItem(P+id);if(r){try{const s=JSON.parse(r);if(s&&s.messages&&s.messages.length>0)out.push(s)}catch(e){}}});return out}catch{return[]}
}
export function deleteSessionStorage(id:string):void{try{localStorage.removeItem(P+id);const ids=JSON.parse(localStorage.getItem(IDX)||'[]');localStorage.setItem(IDX,JSON.stringify(ids.filter((x:string)=>x!==id)))}catch(e){}}
export function saveSettings(s:any):void{try{localStorage.setItem(SET,JSON.stringify(s))}catch(e){}}
export function loadSettings():any{try{return JSON.parse(localStorage.getItem(SET)||'{}')}catch(e){return{}}}
