export const PRESETS = {
  sum: {label:'两个数的和',description:'实现 solve(a, b)，返回两个有限数值的和。返回值必须为 number 类型。',starter:'function solve(a, b) {\n  // 返回两个数的和\n  return a - b;\n}\n',solution:'function solve(a, b) {\n  return a + b;\n}\n',tests:[[[1,2],3],[[0,0],0],[[-3,8],5],[[-4,-6],-10],[[12,0],12],[[2.5,1.25],3.75],[[1000000,2000000],3000000],[[17,-17],0]]},
  max: {label:'两个数的最大值',description:'实现 solve(a, b)，返回两个有限数值中的较大值。相等时返回该值，返回值必须为 number 类型。',starter:'function solve(a, b) {\n  // 返回较大的数\n  return a;\n}\n',solution:'function solve(a, b) {\n  return Math.max(a, b);\n}\n',tests:[[[1,2],2],[[0,0],0],[[-3,8],8],[[-4,-6],-4],[[12,0],12],[[2.5,1.25],2.5],[[1000000,2000000],2000000],[[17,-17],17]]},
  multiply: {label:'两个数的乘积',description:'实现 solve(a, b)，返回两个有限数值的乘积。返回值必须为 number 类型。',starter:'function solve(a, b) {\n  // 返回两个数的乘积\n  return a + b;\n}\n',solution:'function solve(a, b) {\n  return a * b;\n}\n',tests:[[[1,2],2],[[0,0],0],[[-3,8],-24],[[-4,-6],24],[[12,0],0],[[2.5,2],5],[[100,200],20000],[[17,-1],-17]]}
};
export const testsFor = preset => PRESETS[preset].tests.map(([args,expected])=>({args,expected}));
export const fileFor = (assignment,student) => `${assignment.file_prefix}_${student.student_number}.js`;
export function newDraft(assignment){return {code:PRESETS[assignment.preset].starter,evaluation:null,history:[],logs:[],filename:'',course:'',task:'',evaluationId:'',note:'',attachment:null,nonce:null,stats:{clicks:0,applications:0,waitSeconds:0,confirmations:0,errors:0}};}
export function studentErrors(draft,assignment,room,student){
  const errors=[];
  if(!draft.evaluation?.passed||draft.evaluation.code!==draft.code)errors.push('当前代码尚未通过评测，或代码已改变。请对当前版本重新申请运行。');
  if(draft.filename!==fileFor(assignment,student))errors.push('归档文件名应为 '+fileFor(assignment,student)+'。规则见教学资料中的归档补充说明。');
  if(!draft.attachment||draft.attachment.content!==draft.code)errors.push('请提取或上传当前代码，附件必须与当前评测版本完全一致。');
  if(new TextEncoder().encode(draft.code).length>32768)errors.push('代码文件不能超过 32 KB。');
  if(draft.course.trim()!==room.course_name)errors.push('课程全称不匹配，应填写：'+room.course_name);
  if(draft.task.trim()!==assignment.title)errors.push('作业全称不匹配，应填写：'+assignment.title);
  if(draft.evaluationId.trim()!==draft.evaluation?.id)errors.push('请抄写当前评测结果编号：'+(draft.evaluation?.id||'尚未评测'));
  if(draft.note.trim().length<12)errors.push('归档说明至少需要 12 个字符。');
  return errors;
}
export function validateAssignment(input){
  const title=String(input.title||'').trim(),description=String(input.description||'').trim();
  const prefix=String(input.filePrefix||'').trim();
  if(title.length<2||title.length>80)throw new Error('作业标题需为 2–80 个字符。');
  if(description.length<8||description.length>4000)throw new Error('任务说明需为 8–4000 个字符。');
  if(!PRESETS[input.preset])throw new Error('请选择支持的评测模板。');
  if(!/^[A-Za-z][A-Za-z0-9_]{1,23}$/.test(prefix))throw new Error('归档前缀需为 2–24 位字母、数字或下划线，并以字母开头。');
  let dueAt=null;
  if(input.dueAt){const value=new Date(input.dueAt);if(!Number.isFinite(value.getTime())||value.getTime()<=Date.now())throw new Error('截止时间必须晚于当前时间。');dueAt=value.toISOString();}
  return {title,description,preset:input.preset,filePrefix:prefix,dueAt};
}
