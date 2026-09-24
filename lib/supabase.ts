import {createClient} from '@supabase/supabase-js';
// Publishable keys identify the project, never authorize access by themselves.
export const projectUrl='https://sddeyqpvnmcqjvxqgvmp.supabase.co';
export const publishableKey='sb_publishable_RtkNCYvXXezBji9toqi-pw_4ISwS_G7';
export const supabase=createClient(projectUrl,publishableKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
export async function apiFetch(path:string,init:RequestInit={}){
 let {data:{session}}=await supabase.auth.getSession();
 const isExpiring=session?.expires_at?(session.expires_at*1000<Date.now()+60000):false;
 if(!session||isExpiring){
  try{
   const refreshed=await supabase.auth.refreshSession();
   if(refreshed.data?.session)session=refreshed.data.session;
  }catch{}
 }
 if(!session)return new Response(JSON.stringify({error:'Sign in to sync'}),{status:401});
 let response=await fetch(`${projectUrl}/functions/v1/rhythm-api/${path}`,{...init,headers:{...init.headers,apikey:publishableKey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'}});
 if(response.status===401){
  try{
   const refreshed=await supabase.auth.refreshSession();
   if(refreshed.data?.session){
    session=refreshed.data.session;
    response=await fetch(`${projectUrl}/functions/v1/rhythm-api/${path}`,{...init,headers:{...init.headers,apikey:publishableKey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'}});
   }
  }catch{}
 }
 return response;
}
