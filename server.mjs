import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
let port=Number(process.env.PORT||4173);
const server=http.createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if (!target.startsWith(root)) {res.writeHead(403);res.end();return;}
    const data=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
  } catch {res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{
  if(error.code==='EADDRINUSE' && !process.env.PORT && port<4183){port++;server.listen(port,'127.0.0.1');}
  else {console.error('Cannot start preview:',error.message);process.exitCode=1;}
});
server.on('listening',()=>console.log('Local: http://127.0.0.1:'+port));
server.listen(port,'127.0.0.1');
