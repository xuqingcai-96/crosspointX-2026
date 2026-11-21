import test from 'node:test';
import assert from 'node:assert/strict';
import {handleApi} from '../worker/api.mjs';
import {openLocalDatabase} from '../worker/local-db.mjs';
import {PRESETS,testsFor} from '../dist/classroom.mjs';

function fixture(){
  const DB=openLocalDatabase();
  async function call(path,body,token){const request=new Request('https://classroom.example'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json',Origin:'https://classroom.example'}:{})},...(body?{body:JSON.stringify(body)}:{})});const response=await handleApi(request,{DB});return {status:response.status,body:await response.json()};}
  return {DB,call};
}
async function setup({publish=true}={}){
  const f=fixture(),teacher=(await f.call('/api/classrooms',{teacherName:'测试教师',courseName:'JavaScript 程序设计'})).body;
  const student=(await f.call('/api/classrooms/join',{code:teacher.room.code,name:'学生甲',studentNumber:'20260001'})).body;
  let created=await f.call('/api/assignments',{title:'第 1 关：两个数的和',description:PRESETS.sum.description,preset:'sum',filePrefix:'JS_L01'},teacher.token);
  assert.equal(created.status,201);const assignment=created.body.assignments[0];
  if(publish)assert.equal((await f.call('/api/assignments/'+assignment.id+'/publish',{},teacher.token)).status,200);
  return {...f,teacher,student,assignment};
}
function submission(f,nonce=crypto.randomUUID()){
  const code=PRESETS.sum.solution,results=testsFor('sum').map(t=>({...t,actual:t.expected,passed:true}));
  return {nonce,code,filename:'JS_L01_20260001.js',course:f.teacher.room.course_name,task:f.assignment.title,evaluationId:'EVAL-TEST',note:'已经完成函数实现并通过全部测试用例',evaluation:{id:'EVAL-TEST',passed:true,code,results}};
}
test('drafts stay teacher-only; students cannot publish or create assignments',async()=>{
  const f=await setup({publish:false});
  assert.equal((await f.call('/api/session',null,f.student.token)).body.assignments.length,0);
  assert.equal((await f.call('/api/assignments/'+f.assignment.id+'/publish',{},f.student.token)).status,403);
  assert.equal((await f.call('/api/assignments',{},f.student.token)).status,403);
  assert.equal((await f.call('/api/assignments/'+f.assignment.id+'/publish',{},f.teacher.token)).status,200);
  assert.equal((await f.call('/api/session',null,f.student.token)).body.assignments.length,1);f.DB.close();
});
test('reviewed scores and feedback stay private until individually published',async()=>{
  const f=await setup(),body=submission(f),submitted=await f.call('/api/assignments/'+f.assignment.id+'/submit',body,f.student.token);
  assert.equal(submitted.status,201);const s=submitted.body.submissions[0];assert.equal(s.status,'pending');assert.equal(s.score,null);
  assert.equal((await f.call('/api/submissions/'+s.id+'/review',{decision:'verified',score:96,checkedCode:true,checkedMaterial:true},f.student.token)).status,403);
  assert.equal((await f.call('/api/submissions/'+s.id+'/review',{decision:'verified',score:96,checkedCode:false,checkedMaterial:true},f.teacher.token)).status,400);
  const reviewed=await f.call('/api/submissions/'+s.id+'/review',{decision:'verified',score:96,checkedCode:true,checkedMaterial:true,feedback:'代码与材料一致，核实通过。'},f.teacher.token);assert.equal(reviewed.status,200);
  let result=(await f.call('/api/session',null,f.student.token)).body.submissions[0];assert.equal(result.status,'verified');assert.equal(result.score,null);assert.equal(result.feedback,'');assert.equal(result.grade_published,false);assert.equal(reviewed.body.submissions[0].score,96);
  const released=await f.call('/api/submissions/'+s.id+'/publish-grade',{confirm:true,score:1},f.teacher.token);assert.equal(released.status,200);
  result=(await f.call('/api/session',null,f.student.token)).body.submissions[0];assert.equal(result.score,96);assert.equal(result.feedback,'代码与材料一致，核实通过。');assert.equal(result.grade_published,true);assert.ok(result.grade_published_at);assert.equal(result.code,body.code);f.DB.close();
});
test('return and resubmit preserve versions, reasons and old code',async()=>{
  const f=await setup();let r=await f.call('/api/assignments/'+f.assignment.id+'/submit',submission(f),f.student.token);const first=r.body.submissions[0];
  assert.equal((await f.call('/api/submissions/'+first.id+'/review',{decision:'returned',feedback:'短'},f.teacher.token)).status,400);
  assert.equal((await f.call('/api/submissions/'+first.id+'/review',{decision:'returned',feedback:'请补充归档说明中的测试依据。'},f.teacher.token)).status,200);
  const next=submission(f);next.code='function solve(a,b){ return b+a; }';next.evaluation.code=next.code;
  r=await f.call('/api/assignments/'+f.assignment.id+'/submit',next,f.student.token);assert.equal(r.status,201);assert.equal(r.body.submissions.length,2);assert.equal(r.body.submissions[0].version,2);assert.equal(r.body.submissions[0].status,'pending');assert.equal(r.body.submissions[1].status,'returned');assert.notEqual(r.body.submissions[0].code,r.body.submissions[1].code);f.DB.close();
});
test('classroom isolation applies to teacher review and student submission',async()=>{
  const f=await setup();const other=(await f.call('/api/classrooms',{teacherName:'其他教师',courseName:'另一个课堂'})).body;
  assert.equal((await f.call('/api/assignments/'+f.assignment.id+'/close',{},other.token)).status,404);
  const outsider=(await f.call('/api/classrooms/join',{code:other.room.code,name:'外班学生',studentNumber:'20260001'})).body;
  assert.equal((await f.call('/api/assignments/'+f.assignment.id+'/submit',submission(f),outsider.token)).status,404);
  const r=await f.call('/api/assignments/'+f.assignment.id+'/submit',submission(f),f.student.token),s=r.body.submissions[0];
  assert.equal((await f.call('/api/submissions/'+s.id+'/review',{decision:'returned',feedback:'不应允许跨班操作'},other.token)).status,404);f.DB.close();
});
test('students see only their own code; teacher sees roster and submissions',async()=>{
  const f=await setup();const second=(await f.call('/api/classrooms/join',{code:f.teacher.room.code,name:'学生乙',studentNumber:'20260002'})).body;
  await f.call('/api/assignments/'+f.assignment.id+'/submit',submission(f),f.student.token);
  assert.equal((await f.call('/api/session',null,second.token)).body.submissions.length,0);
  const teacher=(await f.call('/api/session',null,f.teacher.token)).body;assert.equal(teacher.students.length,2);assert.equal(teacher.submissions.length,1);assert.ok(teacher.submissions[0].code);assert.ok(!JSON.stringify(teacher).includes('token_hash'));f.DB.close();
});
test('retries are idempotent, and pending work cannot be overwritten',async()=>{
  const f=await setup(),body=submission(f),path='/api/assignments/'+f.assignment.id+'/submit';
  const first=await f.call(path,body,f.student.token),second=await f.call(path,body,f.student.token);assert.equal(second.status,200);assert.equal(first.body.submissionId,second.body.submissionId);assert.equal(second.body.submissions.length,1);
  assert.equal((await f.call(path,submission(f),f.student.token)).status,409);f.DB.close();
});
test('closed and overdue assignments reject new submissions',async()=>{
  const f=await setup();assert.equal((await f.call('/api/assignments/'+f.assignment.id+'/close',{},f.teacher.token)).status,200);
  assert.equal((await f.call('/api/assignments/'+f.assignment.id+'/submit',submission(f),f.student.token)).status,409);
  assert.equal((await f.call('/api/assignments/'+f.assignment.id+'/reopen',{},f.teacher.token)).status,200);
  await f.DB.prepare('UPDATE assignments SET due_at=? WHERE id=?').bind('2020-01-01T00:00:00.000Z',f.assignment.id).run();
  assert.equal((await f.call('/api/assignments/'+f.assignment.id+'/submit',submission(f),f.student.token)).status,409);f.DB.close();
});
test('invalid or stale evaluation cannot be submitted',async()=>{
  const f=await setup(),body=submission(f),path='/api/assignments/'+f.assignment.id+'/submit';body.evaluation.code='old code';assert.equal((await f.call(path,body,f.student.token)).status,400);
  body.evaluation.code=body.code;body.evaluation.results[0].actual=999;assert.equal((await f.call(path,body,f.student.token)).status,400);f.DB.close();
});
test('anonymous callers cannot read a classroom or impersonate a role',async()=>{const f=fixture();assert.equal((await f.call('/api/session')).status,401);assert.equal((await f.call('/api/session',null,'0'.repeat(64))).status,401);f.DB.close();});
test('review concurrency creates exactly one decision and audit event',async()=>{
  const f=await setup(),r=await f.call('/api/assignments/'+f.assignment.id+'/submit',submission(f),f.student.token),s=r.body.submissions[0];const payload={decision:'verified',score:88,checkedCode:true,checkedMaterial:true};
  const responses=await Promise.all([f.call('/api/submissions/'+s.id+'/review',payload,f.teacher.token),f.call('/api/submissions/'+s.id+'/review',payload,f.teacher.token)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await f.DB.prepare('SELECT COUNT(*) AS n FROM review_events').first()).n,1);f.DB.close();
});
test('students can submit tested code directly and receive a receipt', async t => {
  const f = await setup();
  t.after(() => f.DB.close());
  const {nonce, code, evaluation} = submission(f);
  const path = '/api/assignments/' + f.assignment.id;
  const stale = await f.call(path + '/submit', {nonce, code: code + '\n// changed', evaluation}, f.student.token);
  assert.equal(stale.status, 400);
  const submitted = await f.call(path + '/submit', {nonce, code, evaluation}, f.student.token);
  assert.equal(submitted.status, 201);
  const [record] = submitted.body.submissions;
  assert.equal(record.id, submitted.body.submissionId);
  assert.equal(record.filename, 'JS_L01_20260001.js');
  assert.equal(record.code, code);
  assert.equal(record.note, '');
  assert.equal((await f.call(path + '/peer-reviews', null, f.student.token)).body.status, 'waiting');
});
test('transient D1 read failures retry without repeating any writes',async()=>{
  const f=await setup();let failures=0,writes=0;
  const DB={prepare(sql){const statement=f.DB.prepare(sql);const wrapped={bind(...args){statement.bind(...args);return wrapped;},first(){if(sql.includes('teacher_token_hash')&&failures<2){failures++;throw new Error('D1_ERROR: internal error; reference = synthetic-read-failure');}return statement.first();},all(){return statement.all();},run(){writes++;return statement.run();}};return wrapped;}};
  const response=await handleApi(new Request('https://classroom.example/api/session',{headers:{Authorization:'Bearer '+f.teacher.token}}),{DB});
  assert.equal(response.status,200);assert.equal(failures,2);assert.equal(writes,0);f.DB.close();
});
test('grade publication requires own teacher, reviewed work and an explicit checkbox',async()=>{
  const f=await setup(),r=await f.call('/api/assignments/'+f.assignment.id+'/submit',submission(f),f.student.token),s=r.body.submissions[0];
  const path='/api/submissions/'+s.id+'/publish-grade';
  assert.equal((await f.call(path,{confirm:true},f.student.token)).status,403);
  assert.equal((await f.call(path,{confirm:true},f.teacher.token)).status,409);
  await f.call('/api/submissions/'+s.id+'/review',{decision:'verified',score:90,checkedCode:true,checkedMaterial:true},f.teacher.token);
  assert.equal((await f.call(path,{confirm:false},f.teacher.token)).status,400);
  const other=(await f.call('/api/classrooms',{teacherName:'其他教师',courseName:'另一个课堂'})).body;
  assert.equal((await f.call(path,{confirm:true},other.token)).status,404);
  assert.equal((await f.call(path,{confirm:true},f.teacher.token)).status,200);
  assert.equal((await f.call(path,{confirm:true},f.teacher.token)).status,409);f.DB.close();
});
test('three reviewed students require three distinct publications',async()=>{
  const f=await setup(),students=[f.student];
  for(let i=2;i<=3;i++)students.push((await f.call('/api/classrooms/join',{code:f.teacher.room.code,name:'学生'+i,studentNumber:'2026000'+i})).body);
  const records=[];
  for(let i=0;i<students.length;i++){
    const input=submission(f);input.filename='JS_L01_'+students[i].student.student_number+'.js';
    const r=await f.call('/api/assignments/'+f.assignment.id+'/submit',input,students[i].token);assert.equal(r.status,201);
    const s=r.body.submissions[0];records.push(s);
    assert.equal((await f.call('/api/submissions/'+s.id+'/review',{decision:'verified',score:88+i,checkedCode:true,checkedMaterial:true,feedback:'第 '+(i+1)+' 位学生的核实反馈'},f.teacher.token)).status,200);
  }
  assert.equal((await f.call('/api/submissions/publish-grades',{ids:records.map(s=>s.id),confirm:true},f.teacher.token)).status,404);
  for(let i=0;i<records.length;i++){
    assert.equal((await f.call('/api/submissions/'+records[i].id+'/publish-grade',{confirm:true},f.teacher.token)).status,200);
    for(let j=0;j<students.length;j++){
      const s=(await f.call('/api/session',null,students[j].token)).body.submissions[0];
      assert.equal(s.grade_published,j<=i);assert.equal(s.score,j<=i?88+j:null);assert.equal(s.feedback,j<=i?'第 '+(j+1)+' 位学生的核实反馈':'');
    }
  }
  assert.equal((await f.DB.prepare('SELECT COUNT(*) AS n FROM grade_publications').first()).n,3);f.DB.close();
});
test('concurrent per-record grade releases create one audit entry',async()=>{
  const f=await setup(),r=await f.call('/api/assignments/'+f.assignment.id+'/submit',submission(f),f.student.token),s=r.body.submissions[0];
  await f.call('/api/submissions/'+s.id+'/review',{decision:'verified',score:80,checkedCode:true,checkedMaterial:true},f.teacher.token);
  const path='/api/submissions/'+s.id+'/publish-grade';const result=await Promise.all([f.call(path,{confirm:true},f.teacher.token),f.call(path,{confirm:true},f.teacher.token)]);
  assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);assert.equal((await f.DB.prepare('SELECT COUNT(*) AS n FROM grade_publications').first()).n,1);f.DB.close();
});
test('previously visible legacy grades stay visible without backfilling data',async()=>{
  const f=await setup(),r=await f.call('/api/assignments/'+f.assignment.id+'/submit',submission(f),f.student.token),s=r.body.submissions[0];
  await f.DB.prepare("UPDATE submissions SET status='verified',score=96,feedback='此前已经发布',grade_release_required=0 WHERE id=?").bind(s.id).run();
  const legacy=(await f.call('/api/session',null,f.student.token)).body.submissions[0];assert.equal(legacy.grade_published,true);assert.equal(legacy.score,96);assert.equal(legacy.feedback,'此前已经发布');f.DB.close();
});

test('peer reviews unlock after submission, assign anonymous classmates, and finalize drafts together', async t => {
  const f = await setup();
  t.after(() => f.DB.close());
  const assignmentPath = '/api/assignments/' + f.assignment.id;
  const path = assignmentPath + '/peer-reviews';
  const read = () => f.call(path, null, f.student.token);
  const write = (action, body = {}) => f.call(path + '/' + action, body, f.student.token);
  assert.equal((await read()).body.status, 'locked');
  assert.equal((await write('start')).status, 409);
  assert.equal((await f.call(path, null, f.teacher.token)).status, 403);
  assert.equal((await f.call(assignmentPath + '/submit', submission(f), f.student.token)).status, 201);
  assert.equal((await read()).body.status, 'waiting');

  const peerCodes = [];
  for (const [name, studentNumber, expression] of [
    ['同学乙', '20260002', 'b + a'],
    ['同学丙', '20260003', 'Number(a) + Number(b)']
  ]) {
    const {body: peer} = await f.call('/api/classrooms/join', {code: f.teacher.room.code, name, studentNumber});
    const code = 'function solve(a, b) { return ' + expression + '; }';
    const work = submission(f);
    const response = await f.call(assignmentPath + '/submit', {
      ...work, code, filename: 'JS_L01_' + studentNumber + '.js',
      evaluation: {...work.evaluation, code}
    }, peer.token);
    assert.equal(response.status, 201);
    peerCodes.push(code);
  }
  assert.equal((await read()).body.status, 'ready');

  const [assigned, retry] = await Promise.all([write('start'), write('start')]);
  assert.equal(assigned.status, 200);
  assert.deepEqual(assigned.body, retry.body);
  assert.deepEqual(assigned.body.reviews.map(review => review.code).sort(), peerCodes.sort());
  assert.deepEqual(Object.keys(assigned.body.reviews[0]).sort(), ['code', 'draft', 'slot']);
  assert.equal((await write('submit', {confirm: true})).status, 409);
  assert.equal((await write('save', {slot: 1, scores: [6, 5, 5], feedback: '评分超出范围'})).status, 400);
  assert.equal((await write('save', {slot: 1, scores: [4, 5, 5], feedback: '   '})).status, 400);

  const scores = [4, 5, 5];
  for (const [slot, feedback] of [[1, '可以把代码意图写成注释。'], [2, '函数简洁，建议说明输入范围。']]) {
    const saved = await write('save', {slot, scores, feedback});
    assert.equal(saved.status, 200);
    assert.equal(saved.body.submittedCount, 0);
    assert.deepEqual(saved.body.reviews[slot - 1].draft, {scores, feedback});
  }
  assert.equal((await read()).body.reviews.filter(review => review.draft).length, 2);
  assert.equal((await write('submit')).status, 400);
  const completed = await write('submit', {confirm: true});
  assert.equal(completed.status, 200);
  assert.equal(completed.body.submittedCount, 2);
  assert.equal(completed.body.status, 'submitted');
  assert.deepEqual((await read()).body, completed.body);
  assert.deepEqual((await write('submit', {confirm: true})).body, completed.body);
  assert.equal((await write('save', {slot: 1, scores, feedback: '提交后再改'})).status, 409);
  const ownSubmission = (await f.call('/api/session', null, f.student.token)).body.submissions[0];
  assert.equal(ownSubmission.status, 'pending');
  assert.equal(ownSubmission.score, null);
});
