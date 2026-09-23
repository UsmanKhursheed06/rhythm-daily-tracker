'use client';
import {useEffect,useRef,useState} from 'react';
import {Entry,seed} from './model';
type Pending={entry:Entry;token:string};
const cache='rhythm-cache-v1',prefix='rhythm-pending-';
export function useTracker(){
 const [records,setRecords]=useState<Entry[]>(seed),[status,setStatus]=useState('Connecting…'),[ready,setReady]=useState(false),[conflicts,setConflicts]=useState<string[]>([]);
 const owner=useRef(''),busy=useRef(false),items=useRef(records),syncRef=useRef<()=>Promise<void>>(async()=>{});
 function pending():Pending[]{return Object.keys(localStorage).filter(k=>k.startsWith(prefix+owner.current+':')).map(k=>{try{return JSON.parse(localStorage.getItem(k)!)}catch{return null}}).filter(Boolean);}
 function key(id:string){return prefix+owner.current+':'+id;}
 function render(server:Entry[]){const merged=new Map(server.map(e=>[e.id,e]));pending().forEach(p=>merged.set(p.entry.id,p.entry));items.current=[...merged.values()];setRecords(items.current);}
 async function sync(){if(busy.current)return;busy.current=true;try{
  if(!navigator.onLine){setStatus('Offline · changes queued');return;}
  const response=await fetch('/api/sync',{cache:'no-store'});if(!response.ok)throw new Error(response.status===401?'Sign in to sync':'Sync unavailable · retrying');const data=await response.json() as {owner:string;records:Entry[]};
  if(owner.current&&owner.current!==data.owner){setStatus('Account changed · reload to continue');setReady(false);return;}
  owner.current=data.owner;let server:Entry[]=data.records;let queue=pending();
  // An acknowledged response can be interrupted by a reload. Reconcile exact matches safely.
  for(const p of queue){const remote=server.find(e=>e.id===p.entry.id);if(remote&&Object.entries(p.entry).filter(([k])=>k!=='version').every(([k,v])=>JSON.stringify((remote as any)[k])===JSON.stringify(v))){const current=JSON.parse(localStorage.getItem(key(p.entry.id))||'null');if(current?.token===p.token)localStorage.removeItem(key(p.entry.id));}}
  queue=pending();
  // New changes to different records merge independently; stale edits require a choice.
  const stale=queue.filter(p=>(server.find(e=>e.id===p.entry.id)?.version||0)!==(p.entry.version||0));
  setConflicts(stale.map(p=>p.entry.id));const batch=queue.filter(p=>!stale.includes(p)).slice(0,100);
  if(batch.length){setStatus('Syncing changes…');const post=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:owner.current,changes:batch.map(p=>p.entry)})});if(!post.ok)throw new Error('Sync unavailable · changes queued');const result=await post.json() as {conflicts:string[]};for(const p of batch){if(result.conflicts.includes(p.entry.id))continue;const current=JSON.parse(localStorage.getItem(key(p.entry.id))||'null');if(current?.token===p.token)localStorage.removeItem(key(p.entry.id));else if(current){current.entry.version=(p.entry.version||0)+1;localStorage.setItem(key(p.entry.id),JSON.stringify(current));}}
   const fresh=await fetch('/api/sync',{cache:'no-store'});if(!fresh.ok)throw new Error('Checking saved changes…');server=(await fresh.json() as {records:Entry[]}).records;
  }
  localStorage.setItem(cache,JSON.stringify({owner:owner.current,records:server}));render(server);setReady(true);queue=pending();setStatus(stale.length?'Review conflicting changes':queue.length?'Changes waiting to sync':'All changes synced');
 }catch(e){setStatus(e instanceof Error?e.message:'Sync unavailable');}finally{busy.current=false;}}
 syncRef.current=sync;
 useEffect(()=>{try{const cached=JSON.parse(localStorage.getItem(cache)||'null');if(cached){owner.current=cached.owner;render(cached.records);setReady(true);}}catch{setStatus('Device storage unavailable');}void syncRef.current();const trigger=()=>void syncRef.current();const interval=setInterval(trigger,10000);window.addEventListener('online',trigger);window.addEventListener('focus',trigger);window.addEventListener('storage',trigger);return()=>{clearInterval(interval);window.removeEventListener('online',trigger);window.removeEventListener('focus',trigger);window.removeEventListener('storage',trigger);};},[]);
 function save(e:Entry){if(!ready)return false;try{const previous=items.current.find(r=>r.id===e.id);const next={...e,version:previous?.version||0};localStorage.setItem(key(e.id),JSON.stringify({entry:next,token:crypto.randomUUID()}));const merged=new Map(items.current.map(r=>[r.id,r]));merged.set(e.id,next);items.current=[...merged.values()];setRecords(items.current);setStatus('Changes waiting to sync');void syncRef.current();return true;}catch{setStatus('Device storage full · change not saved');return false;}}
 function resolve(id:string,keep:boolean){const cached=JSON.parse(localStorage.getItem(cache)||'null');const current=pending().find(p=>p.entry.id===id);if(current&&keep){current.entry.version=cached?.records.find((r:Entry)=>r.id===id)?.version||0;localStorage.setItem(key(id),JSON.stringify({...current,token:crypto.randomUUID()}));}else localStorage.removeItem(key(id));setConflicts(c=>c.filter(x=>x!==id));void sync();}
 return {records:records.filter(e=>!e.deleted),allRecords:records,status,ready,save,sync,conflicts,resolve};
}


