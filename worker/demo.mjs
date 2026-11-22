import {PRESETS,testsFor} from '../dist/classroom.mjs';

export const DEMO_CLASS_CODE='YVXU5M6V';
const demoFail=(message,status=409)=>Object.assign(new Error(message),{status});
export async function demoInfo(db,session){
  if(session.room.code!==DEMO_CLASS_CODE)return null;
  if(session.role==='student'&&!['DEMO01','DEMO02','DEMO03'].includes(session.student?.student_number))return null;
  const result=await db.prepare('SELECT COALESCE(MAX(generation),0) AS generation FROM demo_reset_snapshots WHERE classroom_id=?').bind(session.room.id).first();
  return {generation:result.generation,canReset:session.role==='teacher',liveStudentNumber:'DEMO02'};
}
export async function resetDemo(db,session){
  if(session.role!=='teacher'||session.room.code!==DEMO_CLASS_CODE)throw demoFail('只有指定演示课堂的教师可以恢复路演开场。',403);
  const roomId=session.room.id;
  const members=(await db.prepare("SELECT * FROM students WHERE classroom_id=? AND student_number IN ('DEMO01','DEMO02','DEMO03') ORDER BY student_number").bind(roomId).all()).results;
  if(members.length!==3||members.map(s=>s.student_number).join(',')!=='DEMO01,DEMO02,DEMO03')throw demoFail('演示课堂成员已变化，已停止重置，请先核对三名演示学生。');
  const assignments=(await db.prepare('SELECT * FROM assignments WHERE classroom_id=?').bind(roomId).all()).results;
  const tasks=assignments.filter(a=>a.preset==='sum');
  if(tasks.length!==1)throw demoFail('需要唯一的求和演示任务，请先核对课堂。');
  const task=tasks.find(a=>a.id==='TASK_f0c71487-e792-4897-a362-081d999ce6e5')||(tasks.length===1?tasks[0]:null),info=await demoInfo(db,session);
  if(!task)throw demoFail('请核对原求和演示任务。');
  const snapshot={assignments};
  const memberFilter="SELECT id FROM students WHERE classroom_id=? AND student_number IN ('DEMO01','DEMO02','DEMO03')";
  const submissionFilter='SELECT id FROM submissions WHERE student_id IN ('+memberFilter+')';
  const filters={submissions:'student_id IN ('+memberFilter+')',peer_review_sets:'reviewer_id IN ('+memberFilter+')',grade_publications:'submission_id IN ('+submissionFilter+')',review_events:'submission_id IN ('+submissionFilter+')'};
  for(const [table,where] of Object.entries(filters))snapshot[table]=(await db.prepare('SELECT * FROM '+table+' WHERE '+where).bind(roomId).all()).results;
  const now=new Date().toISOString(),statements=[db.prepare('INSERT INTO demo_reset_snapshots (classroom_id,previous_generation,snapshot_json,created_at) VALUES (?,?,?,?)').bind(roomId,info.generation,JSON.stringify(snapshot),now)];
  statements.push(db.prepare('DELETE FROM peer_review_sets WHERE '+filters.peer_review_sets).bind(roomId));
  statements.push(db.prepare('UPDATE submissions SET demo_archived=1 WHERE '+filters.submissions).bind(roomId));
  statements.push(db.prepare("UPDATE assignments SET status='published',due_at=NULL,published_at=? WHERE id=? AND classroom_id=?").bind(now,task.id,roomId));
  const workIds=[];
  for(const [index,score] of [[0,95],[2,93]]){
    const member=members[index],submissionId='SUB_'+crypto.randomUUID(),evaluationId='EVAL-DEMO-'+crypto.randomUUID();workIds.push(submissionId);
    const code=PRESETS.sum.solution,evaluation={id:evaluationId,passed:true,code,results:testsFor('sum').map(t=>({...t,actual:t.expected,passed:true}))};
    statements.push(db.prepare("INSERT INTO submissions (id,assignment_id,student_id,version,nonce,code,filename,note,evaluation_json,status,score,feedback,submitted_at,reviewed_at,grade_release_required) VALUES (?,?,?,(SELECT COALESCE(MAX(version),0)+1 FROM submissions WHERE assignment_id=? AND student_id=?),?,?,?,?,?,'verified',?,?,?,?,1)").bind(submissionId,task.id,member.id,task.id,member.id,'DEMO-'+crypto.randomUUID(),code,task.file_prefix+'_'+member.student_number+'.js','虚构路演预置提交，供重复演示。',JSON.stringify(evaluation),score,'演示评分已保存，等待教师逐条发布。',now,now));
    statements.push(db.prepare("INSERT INTO review_events (id,submission_id,decision,score,feedback,created_at) VALUES (?,?,'verified',?,?,?)").bind('REV_'+crypto.randomUUID(),submissionId,score,'虚构路演预置核实记录。',now));
  }
  const review=JSON.stringify({scores:[4,5,4],feedback:'虚构路演互评草稿：函数返回正确，建议补充边界说明。'});
  statements.push(db.prepare('INSERT INTO peer_review_sets (assignment_id,reviewer_id,first_submission_id,second_submission_id,first_review,second_review) VALUES (?,?,?,?,?,?)').bind(task.id,members[1].id,workIds[0],workIds[1],review,review));
  try{await db.batch(statements);}catch(error){if(String(error).includes('UNIQUE constraint failed: demo_reset_snapshots'))throw demoFail('另一处已恢复开场，请刷新查看。');throw error;}
  return demoInfo(db,session);
}
