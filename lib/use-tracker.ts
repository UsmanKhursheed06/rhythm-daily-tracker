'use client';
import {useEffect,useRef,useState} from 'react';
import {Entry,seed} from './model';
import {apiFetch} from './supabase';
type Pending={entry:Entry;token:string};

function uid(){
 if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID();
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);});
}

function sanitize(e:Entry):Entry{
 const clean:Entry={id:String(e.id),kind:e.kind};
 if(typeof e.title==='string')clean.title=e.title.slice(0,3000);
 if(typeof e.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.date))clean.date=e.date;
 if(typeof e.category==='string'&&e.category)clean.category=e.category.slice(0,160);
 if(typeof e.done==='boolean')clean.done=e.done;
 if(typeof e.start==='number'&&e.start>=0&&e.start<=23.5)clean.start=e.start;
 if(typeof e.end==='number'&&e.end>=.5&&e.end<=24)clean.end=e.end;
 if(Array.isArray(e.days))clean.days=e.days.filter(d=>Number.isInteger(d)&&d>=0&&d<=6);
 if(typeof e.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(e.color))clean.color=e.color;
 if(typeof e.minutes==='number'&&e.minutes>=0&&e.minutes<=1440)clean.minutes=e.minutes;
 if(typeof e.deleted==='boolean')clean.deleted=e.deleted;
 if(typeof e.version==='number'&&Number.isInteger(e.version)&&e.version>=0)clean.version=e.version;
 return clean;
}

export function useTracker(userId:string){
 const cache='rhythm-cache-v2:'+userId,prefix='rhythm-pending-v2-';
 const [records,setRecords]=useState<Entry[]>(seed),[status,setStatus]=useState('Connecting…'),[ready,setReady]=useState(false),[conflicts,setConflicts]=useState<string[]>([]);
 const owner=useRef(userId),busy=useRef(false),items=useRef(records),syncRef=useRef<()=>Promise<void>>(async()=>{});
 function pending():Pending[]{return Object.keys(localStorage).filter(k=>k.startsWith(prefix+owner.current+':')).map(k=>{try{return JSON.parse(localStorage.getItem(k)!)}catch{return null}}).filter(Boolean);}
 function key(id:string){return prefix+owner.current+':'+id;}
 function render(server:Entry[]){const merged=new Map(server.map(e=>[e.id,e]));pending().forEach(p=>merged.set(p.entry.id,p.entry));items.current=[...merged.values()];setRecords(items.current);}
 async function sync(){if(busy.current)return;busy.current=true;try{
  if(!navigator.onLine){setStatus('Offline · changes queued');return;}
  const response=await apiFetch('sync',{cache:'no-store'});
  if(!response.ok){
   let msg=response.status===401?'Sign in to sync':'Sync unavailable · retrying';
   try{const err=(await response.json()) as any;if(err?.error)msg=err.error;}catch{}
   if(response.status===401)msg='Sign in to sync';
   console.error('Sync GET error:',response.status,msg);
   throw new Error(msg);
  }
  const data=await response.json() as {owner:string;records:Entry[]};
  if(owner.current&&owner.current!==data.owner){setStatus('Account changed · reload to continue');setReady(false);return;}
  owner.current=data.owner;let server:Entry[]=data.records;let queue=pending();
  // An acknowledged response can be interrupted by a reload. Reconcile exact matches safely.
  for(const p of queue){const remote=server.find(e=>e.id===p.entry.id);if(remote&&Object.entries(p.entry).filter(([k])=>k!=='version').every(([k,v])=>JSON.stringify((remote as any)[k])===JSON.stringify(v))){const current=JSON.parse(localStorage.getItem(key(p.entry.id))||'null');if(current?.token===p.token)localStorage.removeItem(key(p.entry.id));}}
  queue=pending();
  // New changes to different records merge independently; stale edits require a choice.
  const stale=queue.filter(p=>(server.find(e=>e.id===p.entry.id)?.version||0)!==(p.entry.version||0));
  setConflicts(stale.map(p=>p.entry.id));const batch=queue.filter(p=>!stale.includes(p)).slice(0,100);
  if(batch.length){
   setStatus('Syncing changes…');
   const cleanChanges=batch.map(p=>sanitize(p.entry));
   const post=await apiFetch('sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:owner.current,changes:cleanChanges})});
   if(!post.ok){
    let msg='Sync unavailable · changes queued';
    try{const err=(await post.json()) as any;if(err?.error)msg=err.error;}catch{}
    if(post.status===401)msg='Sign in to sync';
    console.error('Sync POST error:',post.status,msg);
    // If the server rejected the payload as permanently invalid, purge the bad batch so device unblocks
    if(post.status===400){for(const p of batch)localStorage.removeItem(key(p.entry.id));}
    throw new Error(msg);
   }
   const result=await post.json() as {conflicts:string[]};
   for(const p of batch){if(result.conflicts.includes(p.entry.id))continue;const current=JSON.parse(localStorage.getItem(key(p.entry.id))||'null');if(current?.token===p.token)localStorage.removeItem(key(p.entry.id));else if(current){current.entry.version=(p.entry.version||0)+1;localStorage.setItem(key(p.entry.id),JSON.stringify(current));}}
   const fresh=await apiFetch('sync',{cache:'no-store'});if(!fresh.ok)throw new Error('Checking saved changes…');server=(await fresh.json() as {records:Entry[]}).records;
  }
  localStorage.setItem(cache,JSON.stringify({owner:owner.current,records:server}));render(server);setReady(true);queue=pending();setStatus(stale.length?'Review conflicting changes':queue.length?'Changes waiting to sync':'All changes synced');
 }catch(e){setStatus(e instanceof Error?e.message:'Sync unavailable');}finally{busy.current=false;}}
 syncRef.current=sync;
 useEffect(()=>{try{const cached=JSON.parse(localStorage.getItem(cache)||'null');if(cached){owner.current=cached.owner;render(cached.records);setReady(true);}}catch{setStatus('Device storage unavailable');}void syncRef.current();const trigger=()=>void syncRef.current();const interval=setInterval(trigger,10000);window.addEventListener('online',trigger);window.addEventListener('focus',trigger);window.addEventListener('storage',trigger);return()=>{clearInterval(interval);window.removeEventListener('online',trigger);window.removeEventListener('focus',trigger);window.removeEventListener('storage',trigger);};},[]);
 function save(e:Entry){if(!ready)return false;try{const sanitized=sanitize(e);const previous=items.current.find(r=>r.id===sanitized.id);const next={...sanitized,version:previous?.version||0};localStorage.setItem(key(sanitized.id),JSON.stringify({entry:next,token:uid()}));const merged=new Map(items.current.map(r=>[r.id,r]));merged.set(sanitized.id,next);items.current=[...merged.values()];setRecords(items.current);setStatus('Changes waiting to sync');void syncRef.current();return true;}catch{setStatus('Device storage full · change not saved');return false;}}
 function resolve(id:string,keep:boolean){const cached=JSON.parse(localStorage.getItem(cache)||'null');const current=pending().find(p=>p.entry.id===id);if(current&&keep){current.entry.version=cached?.records.find((r:Entry)=>r.id===id)?.version||0;localStorage.setItem(key(id),JSON.stringify({...current,token:uid()}));}else localStorage.removeItem(key(id));setConflicts(c=>c.filter(x=>x!==id));void sync();}
 function clearPending(){for(const k of Object.keys(localStorage)){if(k.startsWith(prefix+owner.current+':')||k.startsWith(prefix))localStorage.removeItem(k);}setConflicts([]);setStatus('All changes synced');void syncRef.current();}
 return {records:records.filter(e=>!e.deleted),allRecords:records,status,ready,save,sync,conflicts,resolve,clearPending,pendingCount:pending().length};
}


