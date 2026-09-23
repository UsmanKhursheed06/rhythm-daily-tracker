export type Entry = { id: string; kind: 'task'|'habit'|'check'|'block'|'category'|'note'|'session'; title?: string; date?: string; category?: string; done?: boolean; start?: number; end?: number; days?: number[]; color?: string; minutes?: number; deleted?: boolean; version?: number };
export const categories: Entry[] = [
 {id:'green',kind:'category',title:'Personal time',color:'#388960'},
 {id:'orange',kind:'category',title:'Deep work',color:'#ed8742'},
 {id:'red',kind:'category',title:'Work & study',color:'#bc5d66'},
 {id:'blue',kind:'category',title:'Movement',color:'#5488cc'},
 {id:'gray',kind:'category',title:'Rest & sleep',color:'#76839a'},
 {id:'yellow',kind:'category',title:'Weekly reset',color:'#c1a034'},
 {id:'mint',kind:'category',title:'Daily essentials',color:'#70ad90'}];
export const dateKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const seed: Entry[] = [...categories,
 ...[ ['Read a few pages','green'],['Move for 30 minutes','blue'],['Plan tomorrow','orange'] ].map(([title,category],i)=>({id:`habit-${i}`,kind:'habit' as const,title,category})),
 ...Array.from({length:7},(_,day)=>[
  {start:0,end:2,category:'green'}, {start:2,end:10,category:'gray'},
  ...([0,2].includes(day)?[{start:10,end:16,category:'red'}]:[{start:10,end:11,category:'mint'},{start:13,end:16,category:'orange'}]),
  {start:16,end:17,category:'blue'}, {start:17,end:24,category:day===6?'yellow':'green'}
 ].map((b,i)=>({id:`block-${day}-${i}`,kind:'block' as const,days:[day],...b}))).flat()];
export const timeLabel=(v:number)=>`${String(Math.floor(v)).padStart(2,'0')}:${v%1?'30':'00'}`;
