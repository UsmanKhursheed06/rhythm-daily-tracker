import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('out');const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{try{const url=new URL(req.url,'http://localhost');let target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root+path.sep)&&target!==root){res.writeHead(403);return res.end();}if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');if(!fs.existsSync(target)){res.writeHead(404);return res.end('Not found');}res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');fs.createReadStream(target).pipe(res);}catch{res.writeHead(400);res.end();}}).listen(5173,'127.0.0.1',()=>console.log('Rhythm preview: http://localhost:5173/'));
