'use client';
import {useEffect,useState} from 'react';
import type {User} from '@supabase/supabase-js';
import {Activity,LockKeyhole,CloudCheck,CalendarDays} from 'lucide-react';
import {supabase,apiFetch} from '@/lib/supabase';
import Tracker from './tracker';
export default function AuthGate(){
 const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{supabase.auth.getSession().then(({data,error})=>{setUser(data.session?.user||null);if(error)setError(error.message);setLoading(false);});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{setUser(session?.user||null);setLoading(false);setBusy(false);});const params=new URLSearchParams(location.hash.slice(1));if(params.get('error_description'))setError(params.get('error_description')!);return()=>subscription.unsubscribe();},[]);
 async function login(){setBusy(true);setError('');const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/'}});if(error){setError(error.message);setBusy(false);}}
 async function logout(force = false){
  if(!user)return;
  const pendingKeys=Object.keys(localStorage).filter(k=>k.startsWith(`rhythm-pending-v2-${user.id}:`));
  if(pendingKeys.length>0&&!force){
   if(!window.confirm(`You have ${pendingKeys.length} unsynced change(s). Sign out anyway? Offline changes on this device will be cleared.`))return;
  }
  for(const k of pendingKeys)localStorage.removeItem(k);
  try{
   const reg=await navigator.serviceWorker?.getRegistration();
   const sub=await reg?.pushManager.getSubscription();
   if(sub){
    try{await apiFetch('push',{method:'DELETE',body:JSON.stringify({endpoint:sub.endpoint})});}catch{}
    await sub.unsubscribe().catch(()=>{});
   }
  }catch{}
  const {error}=await supabase.auth.signOut({scope:'local'});
  if(error)throw error;
  localStorage.removeItem(`rhythm-cache-v2:${user.id}`);
  setUser(null);
 }
 if(user)return <Tracker key={user.id} user={user} onSignOut={logout}/>;
 return <main className="signin-page"><div className="signin-card"><a className="brand" href="/"><span className="brand-icon"><Activity size={25}/></span>rhythm<span className="brand-period">.</span></a><span className="signin-eyebrow">A LITTLE INTENTION, EVERY DAY</span><h1>Your time.<br/>Your rhythm.</h1><p>A thoughtful space for your schedule, habits, and the small wins that add up.</p><button className="google-button" disabled={loading||busy} onClick={login}><span className="google-letter">G</span>{loading?'Opening your workspace…':busy?'Connecting to Google…':'Continue with Google'}</button>{error&&<p role="alert" className="signin-error">{error.includes('not enabled')?'Google sign-in is awaiting the project’s Google OAuth configuration.':error}</p>}<div className="signin-features"><span><CalendarDays size={17}/>Make time for what matters</span><span><CloudCheck size={17}/>Your rhythm, on every device</span><span><LockKeyhole size={17}/>Private workspace. Encrypted storage.</span></div><small>Sign in to start your own tracker. Your information stays separate from everyone else’s.</small></div></main>;
}
