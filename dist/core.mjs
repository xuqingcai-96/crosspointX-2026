export const STORAGE_KEY = 'course-not-submitted.v1';
export const STARTER = `// 第 1 关 · 两个数的和\n// 请实现 solve(a, b)，返回两个数的和。\nfunction solve(a, b) {\n  return a - b;\n}\n`;
export const SOLUTION = `function solve(a, b) {\n  return a + b;\n}\n`;
export const TESTS = [
  {args:[1,2], expected:3}, {args:[0,0], expected:0},
  {args:[-3,8], expected:5}, {args:[-4,-6], expected:-10},
  {args:[12,0], expected:12}, {args:[2.5,1.25], expected:3.75},
  {args:[1000000,2000000], expected:3000000}, {args:[17,-17], expected:0}
];
export const MECHANISMS = [
  ['信息碎片化','目标、接口和示例分散在任务书、教学资料与课堂公告，需要跨页面记忆。','识别优于回忆'],
  ['申请式运行','每次评测先填写用途、次数和理由，再经过固定六秒的申请处理等待。两者合为同一机制。','使用效率与状态反馈'],
  ['结果人工搬运','系统已有评测结果，归档时仍要求用户抄写结果编号、课程名与作业名。','减少记忆负担'],
  ['过度确认','保存仅保存草稿。「申请归档」才是真正提交，之后还要完成三轮确认。','用户控制与效率'],
  ['提交弱反馈','提交后回到相同编辑页，不弹成功页、不清空代码；只有提交记录中新增带时间与版本的回执。','操作结果可见性'],
  ['逐条发布成绩','教师核实评分后，必须逐一打开记录并勾选发布。未发布的分数和评语不会返回给学生。','批量处理与操作效率']
];
export function freshState() {
  return {schema:1, code:STARTER, savedCode:STARTER, savedAt:null, evaluation:null,
    history:[], logs:[], receipt:null, submission:{filename:'',course:'',task:'',evaluationId:'',note:'',attachment:null},
    stats:{clicks:0,applications:0,waitSeconds:0,errors:0,confirmations:0}, startedAt:new Date().toISOString()};
}
export const normalizeCode = code => String(code).replace(/\r\n/g,'\n').trim();
export function currentPass(state) {
  return !!state.evaluation?.passed && normalizeCode(state.evaluation.code) === normalizeCode(state.code);
}
export function archiveErrors(state) {
  const s=state.submission, errors=[];
  if (!currentPass(state)) errors.push('当前代码尚未通过评测，或评测后代码发生改变。请重新评测当前版本。');
  if (s.filename !== 'JS_L01_20260001.js') errors.push('归档文件名必须是 JS_L01_20260001.js。请修改归档文件名；规则见教学资料的归档补充说明。');
  if (!s.attachment) errors.push('缺少代码附件。请提取当前代码，或上传本地 JavaScript 文件。');
  else {
    if (s.attachment.size > 32768) errors.push('代码附件超过 32 KB，请缩减文件后重新上传。');
    if (normalizeCode(s.attachment.content) !== normalizeCode(state.code)) errors.push('附件内容与当前评测代码不一致。请重新提取或上传当前版本。');
  }
  if (s.course.trim() !== 'JavaScript 程序设计') errors.push('课程全称不匹配。请填写 JavaScript 程序设计，保留中间空格。');
  if (s.task.trim() !== '第 1 关：两个数的和') errors.push('作业全称不匹配。请填写 第 1 关：两个数的和。');
  if (!state.evaluation || s.evaluationId.trim() !== state.evaluation.id) errors.push('评测结果编号不匹配。请从事务记录或评测结果中复制最新通过编号。');
  if (s.note.trim().length < 12) errors.push('归档说明不足 12 个字符。请描述本次实现与测试情况。');
  return errors;
}
export function makeReceipt(state, now=new Date()) {
  if (archiveErrors(state).length) throw new Error('归档校验未通过');
  return {id:'ARCH-'+now.getTime().toString(36).toUpperCase(),student:'林同学',studentId:'20260001',
    course:state.submission.course.trim(),task:state.submission.task.trim(),filename:state.submission.filename,
    evaluationId:state.evaluation.id,score:100,submittedAt:now.toISOString(),code:state.code,note:state.submission.note.trim()};
}
