import {createClient} from '@supabase/supabase-js';
import webpush from 'web-push';
import {z} from 'zod';
import {seed} from './model.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Cache-Control':'no-store'};
const url=Deno.env.get('SUPABASE_URL')!;
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
import {seal,open} from './crypto.ts';
const enc=new TextEncoder();
async function runtime(){const {data,error}=await admin.rpc('rhythm_runtime_secrets');if(error||!data?.rhythm_encryption_key)throw new Error('Storage configuration unavailable');return data;}
async function hash(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function equal(a:string,b:string){const x=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(a))),y=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(b)));let result=0;for(let i=0;i<x.length;i++)result|=x[i]^y[i];return result===0;}
const entry=z.object({id:z.string().min(1).max(160),kind:z.enum(['task','habit','check','block','category','note','session','day']),title:z.string().max(3000).optional(),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),category:z.string().max(160).optional(),done:z.boolean().optional(),start:z.number().min(0).max(23.5).optional(),end:z.number().min(.5).max(24).optional(),days:z.array(z.number().int().min(0).max(6)).max(7).optional(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),minutes:z.number().min(0).max(1440).optional(),deleted:z.boolean().optional(),version:z.number().int().min(0).optional()});
const subscription=z.object({endpoint:z.string().url().max(4000),keys:z.object({p256dh:z.string().min(40).max(200),auth:z.string().min(16).max(100)})});
function safeEndpoint(endpoint:string){const u=new URL(endpoint);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'));}
async function send(subscriptionValue:any,payload:unknown,secrets:any){return webpush.sendNotification(subscriptionValue,JSON.stringify(payload),{vapidDetails:{subject:url,publicKey:secrets.rhythm_vapid_public,privateKey:secrets.rhythm_vapid_private},TTL:3600,urgency:'normal',timeout:8000});}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 const action=new URL(req.url).pathname.split('/').pop();
 try{
  if(action==='health')return reply({ok:true,service:'rhythm'});
  if(action==='cron'){
   if(req.method!=='POST'||!req.headers.get('x-cron-secret'))return reply({error:'Unauthorized'},401);
   const secrets=await runtime();if(!await equal(req.headers.get('x-cron-secret')!,secrets.rhythm_cron_secret))return reply({error:'Unauthorized'},401);
   const {data:due,error}=await admin.rpc('rhythm_claim_reminders');if(error)throw error;let sent=0,failed=0;
   // Bounded batches avoid holding a large database result in memory.
   for(let offset=0;offset<(due?.length||0);offset+=8){await Promise.all(due.slice(offset,offset+8).map(async(item:any)=>{
    try{
     const {data:mark,error:markError}=await admin.from('rhythm_day_marks').select('complete').eq('owner',item.owner).eq('day',item.day).maybeSingle();if(markError)throw markError;
     if(!mark?.complete){const sub=await open(item.ciphertext,secrets.rhythm_encryption_key,`push:${item.owner}:${item.subscription_id}`);await send(sub,{title:'A little check-in for yesterday',body:'Your day is still open. Add your details, then tap Day complete.',tag:`rhythm-${item.day}`,url:`/?date=${item.day}`},secrets);sent++;}
     const {error:updateError}=await admin.from('rhythm_deliveries').update({status:'sent'}).eq('owner',item.owner).eq('subscription_id',item.subscription_id).eq('day',item.day);if(updateError)throw updateError;
    }catch(error){failed++;if([404,410].includes((error as any).statusCode))await admin.from('rhythm_subscriptions').delete().eq('owner',item.owner).eq('id',item.subscription_id);}
   }));}
   return reply({sent,failed,checked:due?.length||0});
  }
  const authorization=req.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))return reply({error:'Sign in to continue'},401);
  const client=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await client.auth.getUser(authorization.slice(7));if(authError||!user)return reply({error:'Sign in to continue'},401);
  const secrets=await runtime(),owner=user.id;
  if(action==='sync'&&req.method==='GET'){
   let {data,error}=await client.from('rhythm_records').select('id,ciphertext,version').eq('owner',owner).order('id').range(0,999);if(error)throw error;
   if(!data?.length){const encrypted=await Promise.all(seed.map(async e=>({owner,id:e.id,ciphertext:await seal(e,secrets.rhythm_encryption_key,`${owner}:${e.id}`),version:1})));const {error:seedError}=await client.from('rhythm_records').upsert(encrypted,{onConflict:'owner,id',ignoreDuplicates:true});if(seedError)throw seedError;const result=await client.from('rhythm_records').select('id,ciphertext,version').eq('owner',owner).order('id').range(0,999);if(result.error)throw result.error;data=result.data;}
   if(data.length===1000){let offset=1000;for(;;){const next=await client.from('rhythm_records').select('id,ciphertext,version').eq('owner',owner).order('id').range(offset,offset+999);if(next.error)throw next.error;data.push(...next.data);if(next.data.length<1000)break;offset+=1000;}}
   const records=await Promise.all(data.map(async row=>({...await open(row.ciphertext,secrets.rhythm_encryption_key,`${owner}:${row.id}`),version:row.version})));
   return reply({owner,records});
  }
  if(action==='sync'&&req.method==='POST'){
   const text=await req.text();if(text.length>350000)return reply({error:'Too much data in one request'},413);
   const {changes,owner:submittedOwner}=z.object({changes:z.array(entry).max(100),owner:z.string().uuid()}).parse(JSON.parse(text));if(submittedOwner!==owner)return reply({error:'Account mismatch'},403);
   for(const e of changes){if(e.kind==='block'&&(!(e.start!<e.end!)||!e.days?.length))return reply({error:'Invalid time block'},400);if(e.kind==='day'&&(!e.date||e.id!==`day:${e.date}`))return reply({error:'Invalid day'},400);}
   const encrypted=await Promise.all(changes.map(async e=>({id:e.id,ciphertext:await seal(e,secrets.rhythm_encryption_key,`${owner}:${e.id}`),version:e.version||0,...(e.kind==='day'?{day_date:e.date,day_complete:!!e.done&&!e.deleted}:{})})));
   const {data,error}=await client.rpc('rhythm_apply',{p_changes:encrypted});if(error)throw error;return reply(data);
  }
  if(action==='preferences'&&req.method==='GET'){
   const {data,error}=await client.from('rhythm_profiles').select('timezone,reminder_enabled').eq('owner',owner).maybeSingle();if(error)throw error;return reply({...data,vapidPublicKey:secrets.rhythm_vapid_public});
  }
  if(action==='preferences'&&req.method==='POST'){
   const value=z.object({timezone:z.string().min(1).max(100),reminder_enabled:z.boolean()}).parse(await req.json());try{new Intl.DateTimeFormat('en',{timeZone:value.timezone}).format();}catch{return reply({error:'Choose a valid time zone'},400);}
   const {error}=await client.from('rhythm_profiles').upsert({owner,...value},{onConflict:'owner'});if(error)throw error;return reply({ok:true});
  }
  if(action==='push'&&req.method==='POST'){
   const sub=subscription.parse(await req.json());if(!safeEndpoint(sub.endpoint))return reply({error:'Unsupported notification provider'},400);
   const id=await hash(sub.endpoint);const {count}=await client.from('rhythm_subscriptions').select('id',{count:'exact',head:true}).eq('owner',owner);const {data:existing}=await client.from('rhythm_subscriptions').select('id').eq('owner',owner).eq('id',id).maybeSingle();if(!existing&&(count||0)>=10)return reply({error:'Up to 10 devices are supported'},400);
   const {error}=await client.from('rhythm_subscriptions').upsert({owner,id,ciphertext:await seal(sub,secrets.rhythm_encryption_key,`push:${owner}:${id}`)},{onConflict:'owner,id'});if(error)throw error;return reply({ok:true});
  }
  if(action==='push'&&req.method==='DELETE'){
   const {endpoint}=z.object({endpoint:z.string().url()}).parse(await req.json());const {error}=await client.from('rhythm_subscriptions').delete().eq('owner',owner).eq('id',await hash(endpoint));if(error)throw error;return reply({ok:true});
  }
  return reply({error:'Not found'},404);
 }catch(error){if(error instanceof z.ZodError||error instanceof SyntaxError)return reply({error:'Invalid request'},400);console.error('Rhythm request failed',action,(error as any)?.code||'runtime_error');return reply({error:'Unable to complete this request. Your offline changes are retained.'},503);}
});
