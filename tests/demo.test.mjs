import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../worker/api.mjs';
import {openLocalDatabase} from '../worker/local-db.mjs';
import {PRESETS,testsFor} from '../dist/classroom.mjs';
import {syncDemoGeneration} from '../dist/demo-state.mjs';

test('a new reset invalidates all saved roles in that classroom, including recovery on another device',()=>{
 const local={profiles:[{key:'teacher:t',room:{id:'demo'}},{key:'student:b',room:{id:'demo'}},{key:'student:x',room:{id:'other'}}],drafts:{'teacher:t:task':{},'student:b:task':{code:'old solution'},'student:x:task':{code:'keep'}},demoGenerations:{demo:0}};
 const value={room:{id:'demo'},demo:{generation:1}};
 assert.equal(syncDemoGeneration(local,value),true);assert.deepEqual(Object.keys(local.drafts),['student:x:task']);
 local.drafts['student:b:task']={code:'new work'};
 assert.equal(syncDemoGeneration(local,value),false);assert.equal(local.drafts['student:b:task'].code,'new work');
 assert.equal(syncDemoGeneration(local,{room:{id:'other'},demo:null}),false);
 assert.equal(syncDemoGeneration(local,{room:{id:'demo'},demo:{generation:2}}),true);
});

async function fixture(){
 const DB=openLocalDatabase();
 async function call(path,body,token){const response=await handleApi(new Request('https://demo.example'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json',Origin:'https://demo.example'}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB});return {status:response.status,body:await response.json()};}
 const teacher=(await call('/api/classrooms',{teacherName:'演示教师',courseName:'演示课程'})).body;
 await DB.prepare('UPDATE classrooms SET code=? WHERE id=?').bind('YVXU5M6V',teacher.room.id).run();
 const students=[];for(let i=1;i<=3;i++)students.push((await call('/api/classrooms/join',{code:'YVXU5M6V',name:'演示学生'+i,studentNumber:'DEMO0'+i})).body);
 const task=(await call('/api/assignments',{title:'求和演示',description:PRESETS.sum.description,preset:'sum',filePrefix:'JS_L01'},teacher.token)).body.assignments[0];
 return {DB,call,teacher,students,task};
}
test('demo reset preserves four identities; A/C graded but hidden, B unsubmitted; repeat resets keep snapshots',async t=>{
 const f=await fixture();t.after(()=>f.DB.close());
 let response=await f.call('/api/demo/reset',{confirm:true},f.teacher.token);assert.equal(response.status,200);let view=response.body;
 assert.equal(view.submissions.length,2);assert.equal(view.demo.generation,1);assert.equal(view.demo.canReset,true);
 assert.deepEqual(view.submissions.map(s=>s.score).sort(),[93,95]);assert.ok(view.submissions.every(s=>s.status==='verified'&&!s.grade_published));
 for(const index of [0,2]){const student=(await f.call('/api/session',null,f.students[index].token)).body;assert.equal(student.submissions.length,1);assert.equal(student.submissions[0].score,null);assert.equal(student.demo.canReset,false);}
 let b=(await f.call('/api/session',null,f.students[1].token)).body;assert.equal(b.submissions.length,0);assert.equal((await f.call('/api/assignments/'+f.task.id+'/peer-reviews',null,f.students[1].token)).body.status,'locked');
 const code=PRESETS.sum.solution,evalId='EVAL-DEMO';
 const work={demoGeneration:1,nonce:crypto.randomUUID(),code,filename:'JS_L01_DEMO02.js',course:b.room.course_name,task:f.task.title,evaluationId:evalId,note:'演示学生完成代码并提交全部测试结果',evaluation:{id:evalId,code,passed:true,results:testsFor('sum').map(x=>({...x,actual:x.expected,passed:true}))}};
 assert.equal((await f.call('/api/assignments/'+f.task.id+'/submit',work,f.students[1].token)).status,201);
 let peer=(await f.call('/api/assignments/'+f.task.id+'/peer-reviews',null,f.students[1].token)).body;assert.equal(peer.submittedCount,0);assert.equal(peer.reviews.filter(r=>r.draft).length,2);
 assert.equal((await f.call('/api/assignments/'+f.task.id+'/peer-reviews/submit',{confirm:true,demoGeneration:1},f.students[1].token)).body.submittedCount,2);
 const oldId=view.submissions[0].id;
 assert.equal((await f.call('/api/submissions/'+oldId+'/publish-grade',{confirm:true,demoGeneration:1},f.teacher.token)).status,200);
 response=await f.call('/api/demo/reset',{confirm:true},f.teacher.token);assert.equal(response.status,200);assert.equal(response.body.demo.generation,2);assert.equal(response.body.submissions.length,2);assert.ok(response.body.submissions.every(s=>!s.grade_published));
 b=(await f.call('/api/session',null,f.students[1].token)).body;assert.equal(b.submissions.length,0);
 const backups=(await f.DB.prepare('SELECT snapshot_json FROM demo_reset_snapshots ORDER BY generation').all()).results;assert.equal(backups.length,2);const previous=JSON.parse(backups[1].snapshot_json);assert.equal(previous.submissions.length,3);assert.equal(previous.grade_publications.length,1);
 const stale=await f.call('/api/assignments/'+f.task.id+'/submit',work,f.students[1].token);assert.equal(stale.status,409);assert.equal(stale.body.resetRequired,true);
 assert.equal((await f.call('/api/session',null,f.teacher.token)).body.students.length,3);
});
test('reset is teacher-only, fixed-class-only, explicit, and preserves additional students',async t=>{
 const f=await fixture();t.after(()=>f.DB.close());
 assert.equal((await f.call('/api/demo/reset',{confirm:true})).status,401);
 assert.equal((await f.call('/api/demo/reset',{confirm:true},f.students[0].token)).status,403);
 assert.equal((await f.call('/api/demo/reset',{},f.teacher.token)).status,400);
 const other=(await f.call('/api/classrooms',{teacherName:'其他教师',courseName:'其他课堂'})).body;
 assert.equal((await f.call('/api/demo/reset',{confirm:true},other.token)).status,403);
 assert.equal((await f.call('/api/session',null,other.token)).body.demo,null);
 const extra=(await f.call('/api/classrooms/join',{code:'YVXU5M6V',name:'额外学生',studentNumber:'EXTRA01'})).body;
 assert.equal((await f.call('/api/demo/reset',{confirm:true},f.teacher.token)).status,200);
 assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM students').first()).count,4);
 assert.equal((await f.call('/api/session',null,other.token)).body.submissions.length,0);
 const code=PRESETS.sum.solution,evalId='EVAL-EXTRA';
 const work={nonce:crypto.randomUUID(),code,filename:'JS_L01_EXTRA01.js',course:extra.room.course_name,task:f.task.title,evaluationId:evalId,note:'其他同学自己的提交应完整保留',evaluation:{id:evalId,code,passed:true,results:testsFor('sum').map(x=>({...x,actual:x.expected,passed:true}))}};
 assert.equal((await f.call('/api/assignments/'+f.task.id+'/submit',work,extra.token)).status,201);
 const original=(await f.call('/api/session',null,extra.token)).body.submissions;
 assert.equal((await f.call('/api/demo/reset',{confirm:true},f.teacher.token)).status,200);
 assert.deepEqual((await f.call('/api/session',null,extra.token)).body.submissions,original);
 assert.equal((await f.call('/api/assignments/'+f.task.id+'/peer-reviews/start',{},extra.token)).status,200);
 const previousPeers=(await f.call('/api/assignments/'+f.task.id+'/peer-reviews',null,extra.token)).body;
 assert.equal((await f.call('/api/demo/reset',{confirm:true},f.teacher.token)).status,200);
 assert.deepEqual((await f.call('/api/assignments/'+f.task.id+'/peer-reviews',null,extra.token)).body,previousPeers);
});
