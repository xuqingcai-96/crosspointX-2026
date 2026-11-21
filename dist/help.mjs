export const GUIDE_TOPICS = [
  {id:'submit',question:['怎么提交作业？','How do I submit my work?'],terms:['提交','交作业','回执','submit','receipt'],answer:[
    '先在实训页完成代码，点击“申请运行”并通过全部 8 个测试，再点击“提交作业”。提交后编辑页不会弹出成功提示，请到“提交记录”核对带时间和版本的回执。',
    'Complete the code, use Request run, and pass all 8 tests. Then select Submit assignment. The editor stays in place after submission; check Submissions for a timestamped, versioned receipt.'
  ]},
  {id:'peer',question:['互评保存了，为什么还是 0/2？','Why does peer review still show 0/2?'],terms:['互评','0/2','保存评分','peer','review','saved'],answer:[
    '“保存评分”只保存草稿。两份作业都评分并保存后，返回互评列表，再点击“提交互评”并确认，进度才会变成 2/2。至少需要你和另外两名同学正式提交同一份作业，才能领取两份匿名作业。',
    'Save review stores a draft. Save both reviews, return to the peer-review list, then select Submit peer reviews and confirm. Progress becomes 2/2 only after that step. You and at least two classmates must submit the same assignment before two anonymous reviews can be assigned.'
  ]},
  {id:'grade',question:['为什么看不到成绩？','Why can’t I see my grade?'],terms:['成绩','分数','核实','发布成绩','grade','score','publish grade'],answer:[
    '代码通过测试、提交作业、教师核实和发布成绩是不同步骤。教师保存评分后，你暂时看不到分数；教师还需要逐条打开提交记录，勾选并发布本条成绩。发布后再到“成绩管理”查看。',
    'Passing the tests, submitting, teacher review, and grade publication are separate steps. Saving a teacher’s score does not publish it. The teacher must open each reviewed submission, check the release box, and publish that grade. Students can then see it under Grades.'
  ]},
  {id:'run',question:['怎么运行代码？','How do I run my code?'],terms:['运行','评测','测试','报错','run','test','error','debug'],answer:[
    '在实训编辑器实现 solve(a, b)，点击“申请运行”，填写用途、次数和至少 8 个字符的理由。每次申请有约 6 秒处理等待，然后显示测试结果。展开“评测明细”查看差异；代码改动后需要重新评测。',
    'Implement solve(a, b) in the editor. Select Request run and enter a purpose, count, and a reason of at least 8 characters. After about 6 seconds, inspect the results and expand Test details to check differences. Run the tests again whenever you change the code.'
  ]},
  {id:'publish',question:['教师怎么发布作业？','How does a teacher publish an assignment?'],terms:['发布作业','教师','老师','草稿','teacher','assignment draft','publish assignment'],answer:[
    '教师在“新建作业”填写内容并保存草稿，然后到“教学任务备案”单独点击“发布给学生”。保存草稿不等于发布。发布后把课堂码或邀请链接交给学生，学生加入同一课堂后即可查看。',
    'Create an assignment and save its draft. Open Manage assignments and publish it to students separately. Saving is not publishing. Share the class code or invitation link so students can join the same classroom.'
  ]},
  {id:'identity',question:['怎么加入或恢复课堂？','How do I join or restore a classroom?'],terms:['加入','课堂码','口令','身份','恢复','join','class code','recovery','identity'],answer:[
    '学生用教师提供的 8 位课堂码、称呼和演示学号加入。已有身份可在“课堂与身份”切换；换设备时使用自己的恢复口令。课堂码不能恢复教师身份，教师口令请自行妥善保留。',
    'Students join with the teacher’s 8-character class code, a name, and a demo student ID. Switch saved identities under Classroom and roles. On another device, use your own recovery key. A class code cannot restore a teacher identity; keep the teacher recovery key private.'
  ]}
];

export function guideAnswer(question,language='zh-CN'){
  const index=language==='en'?1:0,text=question.toLowerCase();
  const match=GUIDE_TOPICS.map(topic=>({topic,score:topic.terms.filter(term=>text.includes(term)).reduce((sum,term)=>sum+term.length,0)})).sort((a,b)=>b.score-a.score)[0];
  if(match?.score)return match.topic.answer[index];
  return index===1?'AI is not connected yet. I can currently explain submitting work, peer review, running tests, viewing grades, publishing assignments, and restoring identities. Try a suggested question. General programming questions will be available after a model is configured.':'目前还没有连接 AI 模型。我现在可以说明作业提交、同伴互评、代码运行、成绩查看、教师发布和身份恢复；可以试试上面的快捷问题。通用编程问答需要配置模型后才能使用。';
}
