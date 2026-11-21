import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleApi} from './worker/api.mjs';
import {openLocalDatabase} from './worker/local-db.mjs';
const dataDir=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):fileURLToPath(new URL('./.local-data/',import.meta.url));
await mkdir(dataDir,{recursive:true});
const db=openLocalDatabase(path.join(dataDir,'classroom.sqlite'));
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const host=process.env.HOST||'127.0.0.1';
const configuredOrigin=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL;
const publicOrigin=configuredOrigin?new URL(configuredOrigin).origin:null;
if(publicOrigin&&!/^https?:\/\//.test(publicOrigin))throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin.');
let port=Number(process.env.PORT||4173);
const server=http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.startsWith('/api/')){
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>120000){res.writeHead(413);res.end('{"error":"请求过大"}');return;}chunks.push(chunk);}
      // Use an explicitly configured external origin behind TLS termination.
      // Do not trust arbitrary forwarded headers for the API's same-origin check.
      const request=new Request((publicOrigin||'http://'+req.headers.host)+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
      const response=await handleApi(request,{DB:db,DIFY_API_KEY:process.env.DIFY_API_KEY,DIFY_BASE_URL:process.env.DIFY_BASE_URL,AI_ENABLED:process.env.AI_ENABLED,AI_DAILY_LIMIT:process.env.AI_DAILY_LIMIT});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    if(pathname.startsWith('/server/')){res.writeHead(404);res.end();return;}
    const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if (!target.startsWith(root)) {res.writeHead(403);res.end();return;}
    const data=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(req.method==='HEAD'?undefined:data);
  } catch {res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{
  if(error.code==='EADDRINUSE' && !process.env.PORT && port<4183){port++;server.listen(port,host);}
  else {console.error('Cannot start server:',error.message);db.close();process.exitCode=1;}
});
server.on('listening',()=>console.log('Local: http://127.0.0.1:'+server.address().port));
let shuttingDown=false;
function shutdown(){if(shuttingDown)return;shuttingDown=true;server.close(()=>{db.close();});server.closeIdleConnections();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
server.listen(port,host);
