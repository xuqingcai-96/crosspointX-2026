import {PRESETS,validateAssignment,testsFor} from '../dist/classroom.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const id=prefix=>prefix+'_'+crypto.randomUUID();
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const exec=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const roomView=room=>({id:room.id,code:room.code,course_name:room.course_name,teacher_name:room.teacher_name});
async function payload(request){
  if(Number(request.headers.get('content-length'))>120000)throw fail('请求材料超过大小限制。',413);
  const text=await request.text();if(new TextEncoder().encode(text).length>120000)throw fail('请求材料超过大小限制。',413);
  try{return JSON.parse(text);}catch{throw fail('请求格式不正确。');}
}
async function authorize(request,db){
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!token||!/^[a-f0-9]{64}$/.test(token))throw fail('请先进入课堂。',401);
  const digest=await hash(token);
  const room=await one(db,'SELECT * FROM classrooms WHERE teacher_token_hash = ?',digest);
  if(room)return {role:'teacher',room};
  const student=await one(db,'SELECT * FROM students WHERE token_hash = ?',digest);
  if(!student)throw fail('课堂身份已失效，请使用恢复口令重新进入。',401);
  return {role:'student',student,room:await one(db,'SELECT * FROM classrooms WHERE id = ?',student.classroom_id)};
}
function requireTeacher(session){if(session.role!=='teacher')throw fail('此操作仅限该课堂教师。',403);}
async function assignmentFor(db,session,assignmentId){
  const assignment=await one(db,'SELECT * FROM assignments WHERE id = ? AND classroom_id = ?',assignmentId,session.room.id);
  if(!assignment||(session.role==='student'&&assignment.status==='draft'))throw fail('找不到该课堂的作业。',404);
  return assignment;
}
async function snapshot(db,session){
  const {room,role,student}=session;
  const assignments=await rows(db,"SELECT * FROM assignments WHERE classroom_id = ? AND (? = 'teacher' OR status <> 'draft') ORDER BY created_at DESC",room.id,role);
  const submissions=await rows(db,`SELECT s.*, st.name AS student_name, st.student_number, a.title AS assignment_title
    FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN students st ON st.id = s.student_id
    WHERE a.classroom_id = ? AND (? = 'teacher' OR s.student_id = ?) ORDER BY s.submitted_at DESC`,room.id,role,student?.id||'');
  const students=role==='teacher'?await rows(db,'SELECT id,name,student_number,created_at FROM students WHERE classroom_id = ? ORDER BY created_at',room.id):[];
  for(const submission of submissions){submission.evaluation=JSON.parse(submission.evaluation_json);delete submission.evaluation_json;}
  return {room:roomView(room),role,student:student?{id:student.id,name:student.name,student_number:student.student_number}:null,assignments,submissions,students,serverTime:new Date().toISOString()};
}
export async function handleApi(request,env){
  try{
    if(!env.DB)throw fail('课堂数据库尚未就绪。',503);
    const db=env.DB,url=new URL(request.url),path=url.pathname;
    if(!['GET','POST'].includes(request.method))return json({error:'不支持的请求方式。'},405);
    if(request.method==='POST'){
      const origin=request.headers.get('Origin');
      if(origin&&origin!==url.origin)throw fail('不接受跨站写入。',403);
    }
    if(path==='/api/health')return json({ok:true,version:2});
    if(path==='/api/classrooms'&&request.method==='POST'){
      const input=await payload(request),name=String(input.teacherName||'').trim(),course=String(input.courseName||'').trim();
      if(name.length<1||name.length>30||course.length<2||course.length>60)throw fail('请填写教师称呼（1–30 字）和课程名称（2–60 字）。');
      const token=secret(),roomId=id('ROOM'),now=new Date().toISOString();
      const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');
      await exec(db,'INSERT INTO classrooms (id,code,course_name,teacher_name,teacher_token_hash,created_at) VALUES (?,?,?,?,?,?)',roomId,code,course,name,await hash(token),now);
      return json({token,...await snapshot(db,{role:'teacher',room:await one(db,'SELECT * FROM classrooms WHERE id = ?',roomId)})},201);
    }
    if(path==='/api/classrooms/join'&&request.method==='POST'){
      const input=await payload(request),code=String(input.code||'').trim().toUpperCase(),name=String(input.name||'').trim(),number=String(input.studentNumber||'').trim();
      if(!/^[A-Z2-9]{8}$/.test(code)||!name||name.length>30||!/^[A-Za-z0-9]{2,24}$/.test(number))throw fail('请填写有效课堂码、称呼，以及 2–24 位字母数字学号。');
      const room=await one(db,'SELECT * FROM classrooms WHERE code = ?',code);if(!room)throw fail('课堂码不存在，请核对教师提供的邀请信息。',404);
      if(await one(db,'SELECT id FROM students WHERE classroom_id = ? AND student_number = ?',room.id,number))throw fail('该学号已加入课堂。请在原设备切换身份，或使用学生恢复口令进入。',409);
      const token=secret(),studentId=id('STU');
      try{await exec(db,'INSERT INTO students (id,classroom_id,name,student_number,token_hash,created_at) VALUES (?,?,?,?,?,?)',studentId,room.id,name,number,await hash(token),new Date().toISOString());}
      catch(error){if(String(error).includes('UNIQUE'))throw fail('该学号已加入，请使用恢复口令。',409);throw error;}
      return json({token,...await snapshot(db,{role:'student',room,student:await one(db,'SELECT * FROM students WHERE id = ?',studentId)})},201);
    }
    const session=await authorize(request,db);
    if(path==='/api/session'&&request.method==='GET')return json(await snapshot(db,session));
    if(path==='/api/assignments'&&request.method==='POST'){
      requireTeacher(session);const input=validateAssignment(await payload(request)),assignmentId=id('TASK');
      await exec(db,"INSERT INTO assignments (id,classroom_id,title,description,preset,file_prefix,status,due_at,created_at) VALUES (?,?,?,?,?,?,'draft',?,?)",assignmentId,session.room.id,input.title,input.description,input.preset,input.filePrefix,input.dueAt,new Date().toISOString());
      return json({assignmentId,...await snapshot(db,session)},201);
    }
    const actionMatch=path.match(/^\/api\/assignments\/([^/]+)\/(publish|close|reopen)$/);
    if(actionMatch&&request.method==='POST'){
      requireTeacher(session);const assignment=await assignmentFor(db,session,actionMatch[1]);const action=actionMatch[2];
      if(action==='publish'&&assignment.status!=='draft')throw fail('只有草稿可以发布。',409);
      if(action==='close'&&assignment.status!=='published')throw fail('只有发布中的作业可以关闭。',409);
      if(action==='reopen'&&assignment.status!=='closed')throw fail('该作业当前未关闭。',409);
      if(action!=='close'&&assignment.due_at&&Date.parse(assignment.due_at)<=Date.now())throw fail('作业已过截止时间，无法发布或重新开放。',409);
      await exec(db,'UPDATE assignments SET status = ?, published_at = COALESCE(published_at, ?) WHERE id = ?',action==='close'?'closed':'published',new Date().toISOString(),assignment.id);
      return json(await snapshot(db,session));
    }
    const submitMatch=path.match(/^\/api\/assignments\/([^/]+)\/submit$/);
    if(submitMatch&&request.method==='POST'){
      if(session.role!=='student')throw fail('请使用学生身份提交作业。',403);
      const assignment=await assignmentFor(db,session,submitMatch[1]),input=await payload(request);
      if(assignment.status!=='published'||(assignment.due_at&&Date.parse(assignment.due_at)<Date.now()))throw fail('该作业已关闭或已截止，无法提交。',409);
      if(typeof input.nonce!=='string'||!/^[a-zA-Z0-9-]{16,64}$/.test(input.nonce))throw fail('缺少有效的提交请求编号。');
      const duplicate=await one(db,'SELECT id FROM submissions WHERE student_id = ? AND nonce = ?',session.student.id,input.nonce);
      if(duplicate)return json({submissionId:duplicate.id,...await snapshot(db,session)});
      const latest=await one(db,'SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ? ORDER BY version DESC LIMIT 1',assignment.id,session.student.id);
      if(latest&&latest.status!=='returned')throw fail('本次作业已提交，教师退回后才可以重新提交。',409);
      const code=String(input.code||''),note=String(input.note||'').trim(),evaluation=input.evaluation;
      if(!code.trim()||new TextEncoder().encode(code).length>32768||note.length<12||note.length>2000)throw fail('请提供有效代码（不超过 32 KB）和 12–2000 字的归档说明。');
      const expectedFilename=assignment.file_prefix+'_'+session.student.student_number+'.js';
      if(input.filename!==expectedFilename)throw fail('归档文件名应为 '+expectedFilename+'。');
      if(input.course!==session.room.course_name||input.task!==assignment.title)throw fail('课程或作业全称与发布内容不一致。');
      if(!evaluation?.passed||evaluation.code!==code||typeof evaluation.id!=='string'||input.evaluationId!==evaluation.id)throw fail('评测记录与当前代码不一致。');
      const expectedTests=testsFor(assignment.preset);
      if(!Array.isArray(evaluation.results)||evaluation.results.length!==expectedTests.length||!evaluation.results.every((r,i)=>r.passed===true&&r.actual===expectedTests[i].expected))throw fail('请先通过当前作业的全部评测用例。');
      // The browser evaluation is supporting evidence. Only teacher review creates a final score.
      const evidence={id:evaluation.id,passed:true,results:evaluation.results.map((r,i)=>({...expectedTests[i],actual:r.actual,passed:true})),code};
      const submissionId=id('SUB'),version=(latest?.version||0)+1;
      try{await exec(db,"INSERT INTO submissions (id,assignment_id,student_id,version,nonce,code,filename,note,evaluation_json,status,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,'pending',?)",submissionId,assignment.id,session.student.id,version,input.nonce,code,input.filename,note,JSON.stringify(evidence),new Date().toISOString());}
      catch(error){if(String(error).includes('UNIQUE'))throw fail('提交状态已改变，请刷新查看最新记录。',409);throw error;}
      return json({submissionId,...await snapshot(db,session)},201);
    }
    const reviewMatch=path.match(/^\/api\/submissions\/([^/]+)\/review$/);
    if(reviewMatch&&request.method==='POST'){
      requireTeacher(session);const input=await payload(request);
      const submission=await one(db,'SELECT s.* FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ? AND a.classroom_id = ?',reviewMatch[1],session.room.id);
      if(!submission)throw fail('找不到本课堂的提交。',404);
      if(submission.status!=='pending')throw fail('这份提交已经核实，请刷新查看状态。',409);
      if(!['verified','returned'].includes(input.decision))throw fail('请选择核实通过或退回。');
      const feedback=String(input.feedback||'').trim(),score=input.decision==='verified'?Number(input.score):null;
      if(feedback.length>2000)throw fail('反馈不能超过 2000 字。');
      if(input.decision==='returned'&&feedback.length<4)throw fail('退回时请填写至少 4 个字符的修改原因。');
      if(input.decision==='verified'&&(!Number.isInteger(score)||score<0||score>100))throw fail('成绩必须为 0–100 的整数。');
      if(input.decision==='verified'&&(input.checkedCode!==true||input.checkedMaterial!==true))throw fail('请完成代码和材料两项核实。');
      const now=new Date().toISOString(),eventId=id('REV');
      const result=await db.batch([
        db.prepare("UPDATE submissions SET status=?,score=?,feedback=?,reviewed_at=? WHERE id=? AND status='pending'").bind(input.decision,score,feedback,now,submission.id),
        db.prepare('INSERT INTO review_events (id,submission_id,decision,score,feedback,created_at) SELECT ?,?,?,?,?,? WHERE changes() = 1').bind(eventId,submission.id,input.decision,score,feedback,now)
      ]);
      if(!result[0].meta.changes)throw fail('核实状态已改变，请刷新查看。',409);
      return json(await snapshot(db,session));
    }
    return json({error:'接口不存在。'},404);
  }catch(error){if(!error.status&&!/作业标题|任务说明|评测模板|归档前缀|截止时间/.test(error.message))console.error('Classroom API error',error.message);return json({error:error.status?error.message:(/作业标题|任务说明|评测模板|归档前缀|截止时间/.test(error.message)?error.message:'服务暂时无法处理，请稍后重试。')},error.status||(/作业标题|任务说明|评测模板|归档前缀|截止时间/.test(error.message)?400:500));}
}
