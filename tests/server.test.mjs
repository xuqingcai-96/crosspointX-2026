import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

async function start(dataDir){
  const child=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,HOST:'127.0.0.1',PORT:'0',DATA_DIR:dataDir,PUBLIC_ORIGIN:'https://classroom.example'},stdio:['ignore','pipe','pipe']});
  const exited=once(child,'exit');let output='';
  const base=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error('Server did not start: '+output));},10000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.stderr.on('data',chunk=>{output+=chunk;});
    child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/Local: (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exited '+code+': '+output));});
  });
  return {base,async stop(){child.kill('SIGTERM');await exited;}};
}

test('independent host preserves classrooms across restarts and respects the HTTPS origin',async()=>{
  const dataDir=await mkdtemp(path.join(tmpdir(),'course-host-'));let server;
  try{
    server=await start(dataDir);
    assert.equal((await fetch(server.base+'/api/health')).status,200);
    const response=await fetch(server.base+'/api/classrooms',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://classroom.example'},body:JSON.stringify({teacherName:'迁移验收教师',courseName:'独立部署测试'})});
    assert.equal(response.status,201);const teacher=await response.json();
    const foreign=await fetch(server.base+'/api/classrooms',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{}'});assert.equal(foreign.status,403);
    assert.equal((await fetch(server.base+'/worker/api.mjs')).status,404);
    assert.equal((await fetch(server.base+'/',{method:'HEAD'})).status,200);
    await server.stop();server=null;server=await start(dataDir);
    const restored=await fetch(server.base+'/api/session',{headers:{Authorization:'Bearer '+teacher.token}});
    assert.equal(restored.status,200);assert.equal((await restored.json()).room.code,teacher.room.code);
  }finally{if(server)await server.stop();assert.equal(path.dirname(dataDir),path.resolve(tmpdir()));assert.ok(path.basename(dataDir).startsWith('course-host-'));await rm(dataDir,{recursive:true,force:true});}
});
