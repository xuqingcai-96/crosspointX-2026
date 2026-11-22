import {ui, getLanguage, setLanguage} from './i18n.mjs';
import {PRESETS,testsFor,newDraft} from './classroom.mjs';
import {MECHANISMS} from './core.mjs';
import {mountAssistant} from './assistant.mjs';
import {syncDemoGeneration} from './demo-state.mjs';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString(getLanguage(),{hour12:false}):ui('不限时');
const KEY='course-classrooms.v2';
let local;try{local=JSON.parse(localStorage.getItem(KEY))||{};}catch{local={};}
local.profiles??=[];local.drafts??={};local.demoGenerations??={};
let profile=local.profiles.find(p=>p.key===local.active)||null,data=null,busy=false,modal=null,syncError='',toastTimer;
let teacherForm={title:exerciseTitle(PRESETS.sum),description:ui(PRESETS.sum.description),preset:'sum',filePrefix:'JS_L01',dueAt:''};
let reviews={},queueFilter='pending',pendingReview=null;
let qaAssistant=null;
const peerReviews = new Map();
const peerCriteria = ['内容完成度', '分析与论证', '表达清晰度'];
const runPurposes = {
  test: '验证本次代码实现',
  revision: '检查修改后的代码',
  confirm: '确认代码仍然正确'
};
function exerciseTitle(preset) {
  return ui('第 1 关：') + (getLanguage() === 'en' ? ' ' : '') + ui(preset.label);
}
function languageSwitch() {
  const value = getLanguage();
  return `<div class="language-switch" role="group" aria-label="${ui('选择语言')}">
    <button type="button" data-action="language" data-language="zh-CN" aria-pressed="${value === 'zh-CN'}" lang="zh-CN">中文</button>
    <button type="button" data-action="language" data-language="en" aria-pressed="${value === 'en'}" lang="en">English</button>
  </div>`;
}
function changeLanguage(next) {
  if (next === getLanguage() || modal) return;
  const oldDefaultCourse = ui('JavaScript 程序设计');
  const preset = PRESETS[teacherForm.preset];
  const hasDefaultTitle = teacherForm.title === exerciseTitle(preset);
  const hasDefaultDescription = teacherForm.description === ui(preset.description);
  const forms = [...document.querySelectorAll('#create-room, #join-room, #peer-review-form')];
  const values = forms.map(form => [form.id, [...form.elements]
    .filter(field => field.name && !field.disabled && (field.type !== 'textarea' || !field.readOnly))
    .map(field => [field.name, field.value])]);
  setLanguage(next);
  if (hasDefaultTitle) teacherForm.title = exerciseTitle(preset);
  if (hasDefaultDescription) teacherForm.description = ui(preset.description);
  render();
  for (const [id, fields] of values) {
    const form = document.getElementById(id);
    if (!form) continue;
    for (const [name, value] of fields) {
      if (name === 'courseName' && value === oldDefaultCourse) continue;
      form.elements.namedItem(name).value = value;
    }
  }
  document.querySelector('[data-language="' + next + '"]')?.focus();
}
function activityDetail(detail) {
  const purposePrefix = '用途：';
  const reasonPrefix = '理由：';
  if (detail.startsWith(purposePrefix)) {
    const purpose = detail.slice(purposePrefix.length);
    return ui(purposePrefix) + ui(runPurposes[purpose] ?? purpose);
  }
  if (detail.startsWith(reasonPrefix)) return ui(reasonPrefix) + detail.slice(reasonPrefix.length);
  return ui(detail);
}
const route=()=>location.hash.replace(/^#\/?/,'')||'dashboard';
const go=p=>{location.hash='/'+p;};
const task=()=>data?.assignments.find(a=>a.id===route().split('/')[1]);
const latest=id=>data?.submissions.find(s=>s.assignment_id===id)||null;
function canSubmit(assignment, previous) {
  return assignment.status === 'published' &&
    (!assignment.due_at || Date.parse(assignment.due_at) >= Date.now()) &&
    (!previous || previous.status === 'returned');
}
function draftFor(id){const k=profile.key+':'+id;return local.drafts[k]??=newDraft(data.assignments.find(a=>a.id===id));}
const draft=()=>task()?draftFor(task().id):null;
function persist(){try{localStorage.setItem(KEY,JSON.stringify(local));}catch{toast(ui('本机草稿存储空间不足，请先导出代码。云端提交不受影响。'));}}
function toast(s){$('#toast').textContent=ui(s);$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4500);}
async function api(path,{method='GET',body,token=profile?.token}={}){const r=await fetch(path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify({...body,...(data?.demo?{demoGeneration:data.demo.generation}:{})})}:{})});let value;try{value=await r.json();}catch{throw new Error(ui('服务暂未就绪，请稍后刷新。'));}if(!r.ok){if(value.resetRequired)await refresh();throw new Error(value.error||ui('操作未完成。'));}return value;}
function saveProfile(result){const key=result.role+':'+(result.student?.id||result.room.id);profile={key,token:result.token,role:result.role,room:result.room,student:result.student};local.profiles=local.profiles.filter(p=>p.key!==key);local.profiles.push(profile);local.active=key;acceptSnapshot(result);persist();}
function syncLabel(){const e=$('#sync-status');if(e)e.textContent=syncError?ui('同步失败 · 点击刷新'):ui('云端已同步');}
async function refresh(quiet=false){if(!profile)return;const key=profile.key;try{const value=await api('/api/session');if(profile?.key!==key)return;const changed=JSON.stringify({...data,serverTime:''})!==JSON.stringify({...value,serverTime:''});const reset=acceptSnapshot(value);syncError='';if(reset){busy=false;closeModal();go('dashboard');render();toast(getLanguage()==='en'?'Demo opening restored. Local drafts cleared.':'路演开场已恢复，本浏览器旧草稿已清理。');return;}if(!quiet||changed&&!modal&&!busy&&!document.activeElement?.matches('input,textarea,select')&&!/^(lab|submit|peer-review|teacher\/create|teacher\/review\/)/.test(route()))render();else syncLabel();}catch(e){syncError=e.message;syncLabel();if(!quiet)toast(e.message);}}

function acceptSnapshot(value){
  const reset=syncDemoGeneration(local,value);
  if(reset){
    peerReviews.clear();reviews={};pendingReview=null;queueFilter='unpublished';
  }
  data=value;persist();return reset;
}
function demoTools(){
  if(!data?.demo?.canReset||profile?.role!=='teacher'||busy)return;
  const en=getLanguage()==='en';
  openModal('demo-tools',modalHead(en?'Restore demo opening':'恢复路演开场',en?'Private rehearsal tools':'隐藏演示工具')+
    `<p class="modal-description">${en?'Keep all four recovery keys. A and C: submitted, graded 95/93, not published. B: no submission, fresh code draft. B’s peer-review drafts are prepared and unlock after submission.':'保留教师及甲乙丙四个身份和恢复口令。甲、丙：已交作业，教师评分 95/93 已保存但未发布；乙：未提交，重新开始现场写代码。乙的两份互评草稿会在提交作业后解锁。'}</p>`+
    `<p class="small-print">${en?'Previous classroom state is saved in a private server snapshot. Other classrooms are unchanged.':'旧课堂状态先保存为服务端私密快照，其他课堂不受影响。其他浏览器刷新后自动清理旧草稿。'}</p>`+
    `<div class="modal-actions">${btn(en?'Restore opening now':'一键恢复演示前状态','demo-reset')}</div>`);
}

const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',book:'M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3z M12 6v15',folder:'M3 7V4h6l3 3h9v13H3z',file:'M5 3h9l5 5v13H5z M14 3v6h5 M9 13h6 M9 17h4',chart:'M4 3v18h17 M8 16v-5 M13 16V7 M18 16v-8',clock:'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',code:'m8 7-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16',help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17v1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',check:'m5 12 4 4L19 6',chevron:'m9 5 7 7-7 7',play:'m8 4 13 8-13 8z',settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',close:'m6 6 12 12 M6 18 18 6',clipboard:'M9 5H5v16h14V5h-4 M9 3h6v4H9z',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M15 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'};
const icon=n=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[n]||paths.file}"/></svg>`;
const badge=(s,type='neutral')=>`<span class="badge ${type}">${esc(s)}</span>`;
const btn=(s,a,type='primary',attrs='')=>`<button class="btn ${type}" data-action="${a}" ${attrs}>${s}</button>`;
const link=(s,p,type='secondary')=>`<a class="btn ${type}" href="#/${p}">${s}</a>`;
const status=s=>s?badge({pending:ui('待教师核实'),verified:ui('核实通过'),returned:ui('已退回'),draft:ui('草稿'),published:ui('已发布'),closed:ui('已关闭')}[s]||s,{pending:'warning',verified:'success',returned:'danger',published:'success'}[s]||'neutral'):badge(ui('未提交'));
const gradeStatus=s=>s?.status==='verified'?(s.grade_published?badge(ui('成绩已发布'),'success'):badge(ui('已核实 · 待发布'),'warning')):status(s?.status);
const heading=(k,t,d,a='')=>`<div class="page-heading"><div><div class="eyebrow">${k}</div><h1>${esc(t)}</h1><p>${esc(d)}</p></div><div class="heading-actions">${a}</div></div>`;
const empty=(t,d,a='')=>`<div class="empty-state">${icon('folder')}<h3>${esc(t)}</h3><p>${esc(d)}</p><div class="empty-action">${a}</div></div>`;
function header(){const teacher=profile?.role==='teacher';return ui`<header class="topbar"><a class="brand" href="#/dashboard"><span class="brand-icon">${icon('file')}</span><span>交了没？${getLanguage()==='zh-CN'?'<span class="brand-en" lang="en">DID IT SUBMIT?</span>':''}</span></a><nav class="top-links" aria-label="全局导航">${teacher?ui('<a href="#/teacher/tasks">教学事务</a><a href="#/teacher/reviews">成果核实</a>'):ui('<a href="#/courses">课程中心</a><a href="#/course">教学课堂</a><a href="#/learning">学习中心</a>')}</nav><div class="top-right">${languageSwitch()}${profile?ui`<button class="sync-control" data-action="refresh" id="sync-status">${syncError?ui('同步失败 · 点击刷新'):ui('云端已同步')}</button><button class="role-switch" data-action="identity">${teacher?ui('教师端'):ui('学生端')} · 切换身份</button><span class="avatar">${esc((teacher?profile.room.teacher_name:profile.student.name).slice(0,1))}</span>`:ui('<span class="semester">公开赛事原型 · 双端协作</span>')}</div></header>`;}
function sidebar(){const teacher=profile.role==='teacher',r=route();const nav=(s,p,i)=>`<a class="nav-item ${r===p?'active':''}" href="#/${p}">${icon(i)}<span>${s}</span></a>`;return ui`<aside class="sidebar"><div class="workspace-label">${teacher?ui('教师工作空间'):ui('学生工作空间')} <span>V0.3</span></div>${nav(ui('工作台'),'dashboard','grid')}<div class="nav-label">教学空间</div>${teacher?nav(ui('教学任务备案'),'teacher/tasks','book')+nav(ui('新建作业'),'teacher/create','file')+nav(ui('学生名册'),'teacher/students','users'):nav(ui('我的课程'),'courses','book')+nav(ui('教学课堂'),'course','folder')+nav(ui('学习中心'),'learning','folder')}<div class="nav-label">成果事务</div>${teacher?nav(ui('成果核实队列'),'teacher/reviews','clipboard'):nav(ui('实践记录'),'records','code')+nav(ui('提交记录'),'submissions','clipboard')+nav(ui('事务记录'),'transactions','clock')+nav(ui('成绩管理'),'grades','chart')}<div class="sidebar-bottom"><div class="term-card"><span class="live-dot"></span>课堂码 ${esc(data.room.code)}<small>${esc(data.room.course_name)}<br>${teacher?ui('发布、核实与退回'):ui('提交后等待教师核实')}</small></div>${btn(icon('users')+ui('<span>课堂与身份</span>'),'identity','nav-item')}${btn(icon('help')+ui('<span>办事指南</span>'),'help','nav-item')}<div class="prototype-label">逆向体验挑战<br>公开演示 · 课堂数据云端共享</div></div></aside>`;}
function joinForm(code=''){return ui`<form id="join-room"><label class="field">课堂码<input name="code" required minlength="8" maxlength="8" value="${esc(code)}" placeholder="教师提供的 8 位课堂码"></label><div class="form-grid"><label class="field">学生称呼<input name="name" required maxlength="30" placeholder="例如：林同学"></label><label class="field">学号<input name="studentNumber" required pattern="[A-Za-z0-9]{2,24}" placeholder="例如：20260001"></label></div><button class="btn primary full" type="submit">加入课堂</button></form>`;}
function profileButton(p){return `<button class="profile-row" data-action="activate" data-key="${esc(p.key)}"><span class="avatar">${esc((p.role==='teacher'?p.room.teacher_name:p.student.name).slice(0,1))}</span><span class="grow"><strong>${p.role==='teacher'?ui('教师 · ')+esc(p.room.teacher_name):ui('学生 · ')+esc(p.student.name)}</strong><small>${esc(p.room.course_name)} · ${esc(p.room.code)}</small></span>${icon('chevron')}</button>`;}
function lobby(){return ui`<main class="lobby"><div class="lobby-intro"><div class="eyebrow">同一个课堂，师生两端，多道手续。</div><h1>老师发作业，<br>学生交手续。</h1><p>欢迎使用「交了没？」。选择一个身份，<br>一起走完「发布—提交—核实」的完整流程。</p><div class="lobby-tags">${badge(ui('跨设备共享课堂'),'success')}${badge(MECHANISMS.length+ui(' 类核心流程摩擦'))}${badge(ui('公开赛事演示'))}</div></div><div class="lobby-grid"><section class="panel padded"><div class="lobby-icon">${icon('book')}</div><h2>我是教师</h2><p class="body-copy">创建课堂，发布作业，核实学生提交。</p><form id="create-room"><label class="field">教师称呼<input name="teacherName" required maxlength="30" placeholder="例如：王老师"></label><label class="field">课程名称<input name="courseName" required minlength="2" maxlength="60" value="JavaScript 程序设计"></label><button class="btn primary full" type="submit">创建教学课堂</button></form></section><section class="panel padded"><div class="lobby-icon student">${icon('code')}</div><h2>我是学生</h2><p class="body-copy">使用教师的课堂码加入，完成并提交作业。</p>${joinForm(new URL(location.href).searchParams.get('class')||'')}</section></div>${local.profiles.length?ui`<section class="panel saved-identities"><h2>继续已有身份</h2><div class="profile-list">${local.profiles.map(profileButton).join('')}</div></section>`:''}<div class="lobby-foot">${btn(ui('使用恢复口令进入已有课堂'),'recover','secondary')}<p>这是演示身份系统。恢复口令代表对应身份，请自行保留；可使用昵称与演示学号。</p></div></main>`;}
const stat=(s,n,i,note)=>`<div class="stat-card">${icon(i)}<span>${s}</span><strong>${n}</strong><p>${note}</p></div>`;
function teacherDashboard(){const pending=data.submissions.filter(s=>s.status==='pending');return heading(ui('教师总览'),data.room.teacher_name+ui('，欢迎回到课堂。'),data.room.course_name+ui(' · 课堂码 ')+data.room.code,btn(ui('复制学生邀请链接'),'invite','secondary'))+ui`<section class="teacher-hero"><div><span class="hero-kicker">教学事务 · 实时课堂</span><h2>作业发布以后，<br>流程才刚刚开始。</h2><p>检查学生代码和提交记录，核实评分、逐条发布或退回修改。</p><div>${link(ui('新建作业'),'teacher/create','lime')}${link(ui('进入核实队列'),'teacher/reviews','dark-secondary')}</div></div><div class="teacher-room-code"><small>本课堂邀请码</small><strong>${esc(data.room.code)}</strong><span>学生使用该码加入课堂</span></div></section><div class="stats-grid">${stat(ui('课堂学生'),data.students.length,'users',ui('跨设备共享本课堂'))}${stat(ui('已发布作业'),data.assignments.filter(a=>a.status==='published').length,'book',ui('草稿对学生不可见'))}${stat(ui('待核实提交'),pending.length,'clipboard',ui('核实后仍需逐条发布'))}${stat(ui('核实通过'),data.submissions.filter(s=>s.status==='verified').length,'check',ui('保留各版本与反馈'))}</div><section class="panel margin-top"><div class="panel-head"><h2>最近提交</h2>${link(ui('全部核实事务'),'teacher/reviews','secondary small')}</div>${reviewTable(data.submissions.slice(0,5))}</section>`;}
function dashboard(){if(profile.role==='teacher')return teacherDashboard();const submitted=data.assignments.filter(a=>latest(a.id));return heading(ui('学生总览'),profile.student.name+ui('，流程还没走完。'),ui('课堂码 ')+data.room.code+' · '+data.room.teacher_name+ui(' · 学号 ')+profile.student.student_number)+ui`<section class="hero"><div class="hero-copy"><span class="hero-kicker"><span class="live-dot"></span>本课堂学习提醒</span><h2>代码通过了，<br>还要等老师发布。</h2><p>完成评测和作业提交，再等待教师核实与成绩发布。<br>提交回执与最终成绩分别生成。</p>${link(ui('进入学习中心'),'learning','lime')}</div><div class="hero-art" aria-hidden="true"><div class="orbit"></div><div class="paper back-paper"></div><div class="paper front-paper"><div class="paper-top">课堂实训记录 <span>02</span></div><div class="paper-code">function <b>solve</b>(a, b) {<br>&nbsp; return a + b;<br>}</div><div class="paper-line"></div><div class="stamp">待核实</div></div><span class="floating-label label-one">评测通过 ≠ 成绩发布</span></div></section><div class="stats-grid">${stat(ui('已发布任务'),data.assignments.length,'book',ui('教师发布后即可看到'))}${stat(ui('尚未提交'),data.assignments.length-submitted.length,'code',ui('请完成作业提交'))}${stat(ui('待教师核实'),submitted.filter(a=>latest(a.id).status==='pending').length,'clipboard',ui('提交回执已生成'))}${stat(ui('核实通过'),submitted.filter(a=>latest(a.id).status==='verified').length,'check',ui('成绩以教师核实为准'))}</div><section class="panel margin-top"><div class="panel-head"><h2>本课堂作业</h2>${link(ui('查看实践记录'),'records','secondary small')}</div>${assignmentTable()}</section>`;}
function assignmentTable(){if(!data.assignments.length)return empty(ui('教师尚未发布作业'),ui('草稿不会显示在学生端。教师发布后，刷新即可查看。'),btn(ui('刷新课堂'),'refresh','secondary'));return ui`<div class="table-wrap"><table><thead><tr><th>任务名称</th><th>开放状态</th><th>截止时间</th><th>我的提交</th><th>操作</th></tr></thead><tbody>${data.assignments.map(a=>{const s=latest(a.id);return `<tr><td><strong>${esc(a.title)}</strong><small>${ui(PRESETS[a.preset].label)}</small></td><td>${status(a.status)}</td><td>${date(a.due_at)}</td><td>${status(s?.status)}</td><td>${link(s&&s.status!=='returned'?ui('查看提交'):ui('进入实训'),'lab/'+a.id,'primary small')}</td></tr>`;}).join('')}</tbody></table></div>`;}
function records(){return heading(ui('实训任务'),ui('实践记录'),data.room.course_name+ui(' · 代码评测、正式提交、教师核实分别管理。'))+ui`<section class="panel"><div class="panel-head"><h2>课堂实训任务</h2>${badge(data.assignments.length+ui(' 项'))}</div>${assignmentTable()}</section>`;}
function courses(){return heading(ui('课程概况'),ui('我的课程'),ui('当前身份已加入的课堂。'))+ui`<article class="course-card single-course"><div class="course-cover mint"><span>JS</span><span class="course-cover-caption">多练习<br>才有进步。</span>${icon('code')}</div><div class="course-body">${badge(ui('课堂码 ')+data.room.code)}<h2>${esc(data.room.course_name)}</h2><p>${esc(data.room.teacher_name)} · ${data.assignments.length} 项作业</p><div class="course-card-bottom"><span>学生 ${esc(profile.student.student_number)}</span>${link(ui('查看课堂'),'course','primary small')}</div></div></article>`;}
function course(){return heading(ui('课堂概况'),data.room.course_name,ui('教师 ')+data.room.teacher_name+ui(' · 课堂码 ')+data.room.code)+ui`<div class="tabs"><span class="tab active">课堂概览</span><a class="tab" href="#/learning">课程事务</a><a class="tab" href="#/grades">学习成果</a></div><section class="panel padded"><h2>实践任务按课程事务分别办理。</h2><p class="body-copy">任务书、接口和示例由不同模块维护。完成评测并提交后，请等待教师核实，待教师逐条发布后再查询最终成绩。</p><div class="margin-top">${link(ui('办理课程事务'),'learning','primary')}</div></section>`;}
function learning(){return heading(ui('学习服务'),ui('学习中心'),ui('课程学习、事务办理与成果认定分别管理。'))+`<div class="directory-grid">${[[ui('课程事务'),ui('查看课程事项与实践记录。'),'affairs','folder'],[ui('课程学习'),ui('浏览课程概览和课堂信息。'),'courses','book'],[ui('学习成果'),ui('查询教师已核实的最终成绩。'),'grades','chart']].map(c=>ui`<a class="directory-card" href="#/${c[2]}">${icon(c[3])}<span class="section-eyebrow">课堂服务</span><h2>${c[0]}</h2><p>${c[1]}</p><span class="text-link">查看事项</span></a>`).join('')}</div>`;}
function affairs(){return heading(ui('课程办理'),ui('课程事务'),ui('请按事项类型办理。'))+ui`<section class="panel"><a class="affair-row" href="#/records"><span class="course-icon mint">${icon('code')}</span><div class="grow"><h3>实践记录</h3><p>查找任务、进入实训、评测并提交代码。</p></div>${icon('chevron')}</a><a class="affair-row" href="#/grades"><span class="course-icon mint">${icon('chart')}</span><div class="grow"><h3>成果认定</h3><p>查询待核实、退回及已认定成绩。</p></div>${icon('chevron')}</a></section>`;}
const taskHeading=(a,t,k=ui('实训作业'))=>heading(k,t,data.room.course_name+' · '+a.title,link(ui('返回实践记录'),'records','secondary small'));
const missingTask=()=>empty(ui('当前作业不可用'),ui('请刷新课堂或返回实践记录选择作业。'),link(ui('返回实践记录'),'records'));
function materials(){const a=task();if(!a)return missingTask();return taskHeading(a,ui('教学资料'),ui('课堂资料'))+ui`<section class="panel padded"><div class="section-eyebrow">资料 01 / 编程接口</div><h2>${ui(PRESETS[a.preset].label)}</h2><p class="body-copy">${esc(ui(PRESETS[a.preset].description))}无需读取标准输入，也无需打印答案。</p><pre class="light-code">function solve(a, b) {
  // 根据任务要求返回结果
}</pre><p class="body-copy">教师任务说明和测试示例在课堂公告中。</p>${link(ui('任务要求与示例公告'),'notices/'+a.id,'secondary small')}</section><div class="margin-top">${link(ui('返回实训'),'lab/'+a.id)}</div>`;}
function notices(){const a=task();if(!a)return missingTask();return taskHeading(a,ui('课堂公告'),ui('教学通知'))+ui`<section class="panel padded"><div class="notice-meta">${esc(data.room.teacher_name)} · ${date(a.published_at||a.created_at)}</div><h2>${esc(a.title)}：任务要求</h2><p class="body-copy pre-line">${esc(a.description)}</p><div class="example-grid">${testsFor(a.preset).slice(0,2).map(t=>ui`<div><small>输入</small><code>a = ${t.args[0]}, b = ${t.args[1]}</code><small>返回值</small><code>${t.expected}</code></div>`).join('')}</div><p class="body-copy">评测通过不代表最终成绩。正式提交后，由教师核实评分。</p></section><div class="margin-top">${link(ui('返回实训'),'lab/'+a.id)}</div>`;}
function evaluationView(e){if(!e)return '<div class="terminal-empty">'+icon('play')+ui('<p>尚未发起评测</p><span>请先填写运行资源申请。</span></div>');return ui`<div class="eval-summary"><div>${badge(e.passed?ui('评测通过'):ui('评测未通过'),e.passed?'success':'danger')}<span>${e.results.filter(t=>t.passed).length} / 8</span></div></div>${e.error?`<p class="runtime-error">${esc(ui(e.error))}</p>`:''}<div class="test-chips">${e.results.map((r,i)=>`<span class="${r.passed?'pass':'fail'}">${r.passed?'✓':'×'} ${i+1}</span>`).join('')}</div><div class="result-id">结果编号 <code>${esc(e.id)}</code>${btn(ui('复制'),'copy-evaluation','secondary small')}</div><details class="test-details"><summary>评测明细</summary><div class="table-wrap"><table><thead><tr><th>输入</th><th>预期</th><th>实际</th></tr></thead><tbody>${e.results.map(r=>`<tr><td>${r.args.join(', ')}</td><td>${r.expected}</td><td>${esc(r.actual)}</td></tr>`).join('')}</tbody></table></div></details>`;}
function lab(){const a=task();if(!a)return missingTask();const d=draft(),passed=d.evaluation?.passed&&d.evaluation.code===d.code,previous=latest(a.id),submissionOpen=canSubmit(a,previous);return taskHeading(a,a.title)+(previous?.status==='returned'?ui`<p class="teacher-feedback">退回原因：${esc(previous.feedback)}</p>`:'')+ui`<div class="lab-grid"><section class="panel task-panel"><div class="panel-head"><h2>任务书</h2>${status(a.status)}</div><div class="task-body"><div class="section-eyebrow">${esc(a.file_prefix)}</div><h2>${ui(PRESETS[a.preset].label)}</h2><p>实现本关函数，通过评测后提交作业。</p><div class="task-callout">编程接口与课堂示例分别维护，可在提交前查阅。</div><a class="resource-row" href="#/materials/${a.id}">${icon('file')}编程接口 ${icon('chevron')}</a><a class="resource-row" href="#/notices/${a.id}">${icon('book')}任务要求与示例公告 ${icon('chevron')}</a><div class="task-foot"><span class="subtle">提交截止</span><strong>${date(a.due_at)}</strong></div></div></section><div class="coding-column"><section class="editor-panel"><div class="editor-top"><span>${icon('code')} main.js</span><span>JavaScript · 浏览器 Worker</span></div><div class="code-area"><div class="line-numbers" id="line-numbers">${d.code.split('\n').map((_,i)=>i+1).join('\n')}</div><textarea id="code-editor" aria-label="JavaScript 代码编辑器" spellcheck="false">${esc(d.code)}</textarea></div><div class="editor-bottom"><span id="draft-status">草稿保存在当前浏览器</span><div>${btn(ui('保存草稿'),'save','dark-secondary')}${btn(icon('play')+ui(' 申请运行'),'run','lime')}</div></div></section><section class="panel results-panel"><div class="panel-head"><h2>评测结果 <span id="current-pass">${passed?badge(ui('当前版本通过'),'success'):''}</span></h2>${btn(ui('导出代码'),'export-code','secondary small')}</div><div class="result-body">${evaluationView(d.evaluation)}<div class="eval-next"><span>评测通过后，可直接提交当前代码。</span>${btn(previous?.status==='returned'?ui('重新提交作业'):ui('提交作业'),'submit-assignment','primary small',submissionOpen&&passed?'id="submit-assignment"':'id="submit-assignment" disabled')}${link(ui('提交记录'),'submissions','secondary small')}</div></div></section></div></div>${peerReviewEntry(a)}`;}
function receipt(a,s){return taskHeading(a,ui('提交记录详情'),ui('回执详情'))+ui`<section class="panel padded"><div class="panel-head flush"><h2>提交回执</h2>${gradeStatus(s)}</div><div class="receipt-meta"><div><small>回执 / 版本</small><strong>${esc(s.id)}<br>第 ${s.version} 次</strong></div><div><small>成绩</small><strong>${s.grade_published?s.score+' / 100':s.status==='verified'?ui('教师已核实，成绩尚未发布'):ui('尚无已发布成绩')}</strong></div><div><small>作业 / 学生</small><strong>${esc(a.title)}<br>${esc(profile.student.name)} · ${esc(profile.student.student_number)}</strong></div><div><small>提交时间 / 成绩发布时间</small><strong>${date(s.submitted_at)}<br>${s.grade_published?(s.grade_published_at?date(s.grade_published_at):ui('此前已发布')):ui('尚未发布')}</strong></div></div>${s.feedback?ui`<p class="teacher-feedback">教师反馈：${esc(s.feedback)}</p>`:''}<details class="test-details"><summary>查看本次提交的代码快照</summary><pre class="review-code">${esc(s.code)}</pre></details><div class="receipt-actions">${btn(ui('下载提交回执'),'download-receipt')}${link(ui('全部提交记录'),'submissions')}${link(ui('返回编辑页'),'lab/'+a.id)}${link(ui('同伴互评'),'peer-review/'+a.id)}</div></section>`;}
function grades(){return heading(ui('成绩查询'),ui('成绩管理'),ui('教师核实与成绩发布分别办理。只有逐条发布后的成绩才对学生可见。'))+ui`<section class="panel"><div class="panel-head"><h2>我的作业成绩</h2>${btn(ui('刷新成绩状态'),'refresh','secondary small')}</div>${data.assignments.length?ui`<div class="table-wrap"><table><thead><tr><th>作业</th><th>版本</th><th>成绩状态</th><th>成绩</th><th>已发布反馈 / 退回原因</th><th>操作</th></tr></thead><tbody>${data.assignments.map(a=>{const s=latest(a.id);return `<tr><td><strong>${esc(a.title)}</strong></td><td>${s?ui('第 ')+s.version+ui(' 次'):'—'}</td><td>${gradeStatus(s)}</td><td>${s?.grade_published?s.score:'—'}</td><td class="feedback-cell">${esc(s?.feedback||'—')}</td><td>${link(s?ui('查看记录'):ui('进入实训'),s?'receipt/'+s.id:'lab/'+a.id,'secondary small')}</td></tr>`;}).join('')}</tbody></table></div>`:empty(ui('暂无作业'),ui('等待教师发布。'))}</section>`;}
function transactions(){const logs=[];for(const a of data.assignments)for(const l of draftFor(a.id).logs)logs.push({...l,assignment:a.title});logs.sort((a,b)=>b.time.localeCompare(a.time));return heading(ui('办理记录'),ui('事务记录'),ui('保留申请、评测和提交检查的处理明细。提交错误同时会直接说明修正方法。'))+ui`<section class="panel"><div class="panel-head"><h2>本机处理记录</h2>${badge(logs.length+ui(' 条'))}</div>${logs.length?logs.map(l=>ui`<details class="transaction"><summary><span class="transaction-icon ${l.error?'error':''}">${icon('file')}</span><span class="grow"><strong>${esc(ui(l.title))}</strong><small>${esc(l.assignment)} · ${date(l.time)}</small></span><span class="text-link">处理详情</span></summary><div class="transaction-details">${l.details.map(t=>'<p>'+esc(activityDetail(t))+'</p>').join('')}</div></details>`).join(''):empty(ui('暂无事务记录'),ui('申请和评测后会保留处理明细。'))}</section>`;}
function teacherTasks(){return heading(ui('任务发布'),ui('教学任务备案'),ui('先保存草稿，再单独发布。草稿对学生不可见。'),link(ui('新建作业'),'teacher/create','primary'))+ui`<section class="panel"><div class="panel-head"><h2>作业清单</h2>${badge(data.assignments.length+ui(' 项'))}</div>${data.assignments.length?ui`<div class="table-wrap"><table><thead><tr><th>作业</th><th>评测模板</th><th>状态</th><th>截止时间</th><th>提交次数</th><th>操作</th></tr></thead><tbody>${data.assignments.map(a=>ui`<tr><td><strong>${esc(a.title)}</strong><small>文件名前缀 ${esc(a.file_prefix)}</small></td><td>${ui(PRESETS[a.preset].label)}</td><td>${status(a.status)}</td><td>${date(a.due_at)}</td><td>${data.submissions.filter(s=>s.assignment_id===a.id).length}</td><td>${btn(a.status==='draft'?ui('发布给学生'):a.status==='published'?ui('结束收取'):ui('重新开放'),a.status==='draft'?'publish-task':a.status==='published'?'close-task':'reopen-task',a.status==='draft'?'primary small':'secondary small',`data-id="${a.id}"`)}</td></tr>`).join('')}</tbody></table></div>`:empty(ui('还没有作业'),ui('新建一份草稿，再办理发布。'),link(ui('新建作业'),'teacher/create','primary'))}</section>`;}
function teacherCreate(){return heading(ui('任务登记'),ui('新建作业'),ui('支持三种真实可运行的 JavaScript 评测模板。保存草稿不等于发布。'))+ui`<div class="submission-grid"><section class="panel padded"><form id="create-assignment"><label class="field">作业标题<input name="title" data-teacher="title" required minlength="2" maxlength="80" value="${esc(teacherForm.title)}"></label><label class="field">评测模板<select name="preset" data-teacher="preset" aria-label="评测模板">${Object.entries(PRESETS).map(([k,p])=>`<option value="${k}" ${k===teacherForm.preset?'selected':''}>${ui(p.label)}</option>`).join('')}</select></label><label class="field">任务说明<textarea name="description" data-teacher="description" rows="5" required minlength="8" maxlength="4000">${esc(teacherForm.description)}</textarea></label><div class="form-grid"><label class="field">文件名前缀<input name="filePrefix" data-teacher="filePrefix" required pattern="[A-Za-z][A-Za-z0-9_]{1,23}" value="${esc(teacherForm.filePrefix)}"><small>学生文件名：前缀_学号.js</small></label><label class="field">截止时间（可选）<input name="dueAt" data-teacher="dueAt" type="datetime-local" value="${esc(teacherForm.dueAt)}"></label></div><div class="form-actions">${link(ui('返回任务备案'),'teacher/tasks')}<button class="btn primary" type="submit">保存作业草稿</button></div></form></section><aside class="panel padded"><div class="section-eyebrow">发布流程</div><h2>保存 ≠ 发布</h2><p class="body-copy">草稿只有教师可见。请到「教学任务备案」单独发布，学生刷新后即可看到。</p><p class="body-copy">评测模板决定函数目标与测试用例，请保持任务说明一致。已发布题目不再修改，以保留提交依据。</p></aside></div>`;}
function teacherStudents(){return heading(ui('课堂成员'),ui('课堂学生名册'),ui('学生用课堂码加入后显示在此处。'),btn(ui('复制学生邀请链接'),'invite','primary'))+ui`<section class="panel"><div class="panel-head"><h2>课堂码 ${esc(data.room.code)}</h2>${badge(data.students.length+ui(' 位学生'))}</div>${data.students.length?ui`<div class="table-wrap"><table><thead><tr><th>学生</th><th>学号</th><th>加入时间</th><th>提交次数</th></tr></thead><tbody>${data.students.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.student_number)}</td><td>${date(s.created_at)}</td><td>${data.submissions.filter(t=>t.student_id===s.id).length}</td></tr>`).join('')}</tbody></table></div>`:empty(ui('学生还没有加入'),ui('把课堂码或邀请链接提供给学生。'))}</section>`;}
function reviewTable(list){if(!list.length)return empty(ui('暂无对应提交'),ui('可切换待核实、待发布成绩或全部版本。'));return ui`<div class="table-wrap"><table><thead><tr><th>学生 / 学号</th><th>作业 / 版本</th><th>提交时间</th><th>成绩状态</th><th>教师评分</th><th>操作</th></tr></thead><tbody>${list.map(s=>ui`<tr><td><strong>${esc(s.student_name)}</strong><small>${esc(s.student_number)}</small></td><td><strong>${esc(s.assignment_title)}</strong><small>第 ${s.version} 次</small></td><td>${date(s.submitted_at)}</td><td>${gradeStatus(s)}</td><td>${s.score??'—'}</td><td>${link(s.status==='pending'?ui('核实成果'):s.status==='verified'&&!s.grade_published?ui('逐条发布成绩'):ui('查看记录'),'teacher/review/'+s.id,'primary small')}</td></tr>`).join('')}</tbody></table></div>`;}
function teacherReviews(){const matches=(s,k)=>k==='all'||k==='unpublished'&&s.status==='verified'&&!s.grade_published||k==='published'&&s.grade_published||s.status===k;return heading(ui('成绩核实'),ui('成果核实与成绩发布'),ui('先核实评分，再逐一打开记录、勾选并发布。本平台不提供批量发布入口。'),btn(ui('刷新提交列表'),'refresh','secondary'))+`<div class="queue-tabs">${[['pending',ui('待核实')],['unpublished',ui('待发布成绩')],['published',ui('成绩已发布')],['returned',ui('已退回')],['all',ui('全部版本')]].map(([k,t])=>btn(t+' '+data.submissions.filter(s=>matches(s,k)).length,'queue-filter',queueFilter===k?'primary small':'secondary small',`data-filter="${k}"`)).join('')}</div><section class="panel">${reviewTable(data.submissions.filter(s=>matches(s,queueFilter)))}</section>`;}
function teacherReview(){const s=data.submissions.find(s=>s.id===route().split('/')[2]);if(!s)return empty(ui('没有找到提交'),ui('返回队列刷新。'),link(ui('返回核实队列'),'teacher/reviews'));const a=data.assignments.find(a=>a.id===s.assignment_id),f=reviews[s.id]??={score:100,feedback:'',checkedCode:false,checkedMaterial:false};return heading(ui('提交核实'),s.student_name+ui('的学习成果'),a.title+ui(' · 第 ')+s.version+ui(' 次提交'),link(ui('返回核实与发布队列'),'teacher/reviews'))+ui`<div class="review-layout"><section class="panel padded"><div class="panel-head flush"><h2>学生提交代码</h2>${gradeStatus(s)}</div><div class="review-meta"><span>学号 ${esc(s.student_number)}</span><span>${esc(s.filename)}</span><span>${date(s.submitted_at)}</span></div><pre class="review-code">${esc(s.code)}</pre>${s.note?ui`<h3>历史提交说明</h3><p class="body-copy pre-line">${esc(s.note)}</p>`:''}<details class="test-details"><summary>任务要求与浏览器评测记录</summary><p class="body-copy pre-line">${esc(a.description)}</p><div class="table-wrap"><table><thead><tr><th>输入</th><th>预期</th><th>浏览器返回</th></tr></thead><tbody>${s.evaluation.results.map(r=>`<tr><td>${r.args.join(', ')}</td><td>${r.expected}</td><td>${esc(r.actual)}</td></tr>`).join('')}</tbody></table></div></details></section><aside class="panel padded"><div class="section-eyebrow">逐条核实与发布</div><h2>${s.status==='pending'?ui('核实处理'):ui('成绩发布')}</h2><p class="small-print">回执 ${esc(s.id)}</p>${s.status==='pending'?ui`<label class="check-row"><input type="checkbox" data-review="checkedCode" ${f.checkedCode?'checked':''}>已检查学生代码与任务要求。</label><label class="check-row"><input type="checkbox" data-review="checkedMaterial" ${f.checkedMaterial?'checked':''}>已核对本次提交记录和评测结果。</label><label class="field">核实成绩（0–100）<input type="number" min="0" max="100" step="1" data-review="score" value="${esc(f.score)}"></label><label class="field">教师反馈<textarea data-review="feedback" rows="4" maxlength="2000" placeholder="退回时至少填写 4 字符的原因">${esc(f.feedback)}</textarea></label><div class="review-actions">${btn(ui('保存核实评分'),'review-approve')}${btn(ui('退回学生修改'),'review-return','secondary')}</div>`:s.status==='verified'?ui`<div class="review-result">${gradeStatus(s)}<strong>${s.score} 分</strong><p>${esc(s.feedback||ui('无额外反馈。'))}</p><small>核实时间：${date(s.reviewed_at)}</small></div>${!s.grade_published?ui`<p class="modal-description">学生暂时看不到本条分数和评语。请为本条记录单独完成发布。</p><label class="check-row"><input id="grade-release-confirm" type="checkbox">已核对本条成绩与接收学生，确认逐条发布。</label><div class="review-actions">${btn(ui('发布本条成绩'),'publish-grade')}</div>`:`<p class="small-print">${s.grade_published_at?ui('发布时间：')+date(s.grade_published_at):ui('此成绩已在此前版本发布。')}</p>`}`:`<div class="review-result">${status(s.status)}<p>${esc(s.feedback)}</p><small>${date(s.reviewed_at)}</small></div>`}</aside></div>`;}
const studentPages={dashboard,courses,course,learning,affairs,records,materials,notices,lab,submit:lab,grades,transactions,submissions:()=>submissionRecords(),receipt:submissionDetails,'peer-review':peerReviewPage};
const teacherPages={dashboard:teacherDashboard,'teacher/tasks':teacherTasks,'teacher/create':teacherCreate,'teacher/students':teacherStudents,'teacher/reviews':teacherReviews};
function render(){document.documentElement.lang=getLanguage();document.title=ui('交了没？');if(!profile||!data){$('#app').innerHTML=header()+lobby();qaAssistant?.sync();return;}const r=route(),teacher=profile.role==='teacher';const body=teacher?(r.startsWith('teacher/review/')?teacherReview():(teacherPages[r]||teacherDashboard)()):(studentPages[r.split('/')[0]]||dashboard)();document.title=(teacher?ui('教师端'):ui('学生端'))+ui(' · 交了没？');$('#app').innerHTML=header()+sidebar()+ui`<main class="main"><div class="breadcrumbs"><span>${teacher?ui('教师工作空间'):ui('学生工作空间')}</span>${icon('chevron')}<span>${esc(data.room.course_name)}</span></div>${body}<footer class="footer"><span>交了没？ · 双端教学事务平台</span></footer></main>`;qaAssistant?.sync();}
const modalHead=(t,k=ui('事务办理'))=>`<div class="modal-header"><div><div class="section-eyebrow">${k}</div><h2>${esc(t)}</h2></div>${busy?'':btn(icon('close'),'close-modal','icon-button',ui('aria-label="关闭弹窗"'))}</div>`;
function openModal(type,content){modal={type};$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${type}">${content}</section></div>`;$('#modal-root input,#modal-root select,#modal-root button')?.focus();}
function closeModal(){if(busy)return;modal=null;$('#modal-root').innerHTML='';}
function failStudent(errors){const d=draft();if(d){d.stats.errors++;d.logs.unshift({title:'提交未完成',error:true,time:new Date().toISOString(),details:errors});persist();}openModal('error',modalHead(ui('请修正以下内容'))+ui`<div class="clear-errors" role="alert"><ul>${errors.map(error=>'<li>'+esc(ui(error))+'</li>').join('')}</ul></div><p class="modal-description">当前代码已保留，修改后可以重新提交。</p><div class="modal-actions">${btn(ui('返回修改'),'close-modal')}</div>`);}
function identity(){openModal('identity',modalHead(ui('课堂与身份'),ui('课堂身份'))+ui`<p class="modal-description">切换本设备保存的身份。学生身份不能发布或核实作业。</p><div class="profile-list">${local.profiles.map(profileButton).join('')}</div>${profile?ui`<div class="identity-current"><h3>${esc(profile.room.course_name)}</h3><p>课堂码 <strong>${esc(profile.room.code)}</strong></p>${profile.role==='teacher'?btn(ui('复制学生邀请链接'),'invite','secondary small'):''}${btn(ui('复制当前身份恢复口令'),'copy-token','secondary small')}</div>`:''}<div class="modal-actions">${btn(ui('使用恢复口令'),'recover','secondary')}${profile?.role==='teacher'?btn(ui('以新学生身份体验'),'join-current','secondary'):''}${btn(ui('创建或加入其他课堂'),'lobby')}${data?.demo?.canReset&&new URL(location.href).searchParams.get('demo')==='1'?btn(getLanguage()==='en'?'Demo reset':'路演重置','demo-tools','secondary'):''}</div>`);}
function recover(){openModal('recover',modalHead(ui('恢复已有身份'),ui('身份恢复'))+ui`<p class="modal-description">口令对应的角色与课堂由服务端识别。</p><form id="recover-session"><label class="field">身份恢复口令<input name="token" type="password" required pattern="[a-f0-9]{64}" autocomplete="off" placeholder="64 位恢复口令"></label><div class="modal-actions"><button class="btn primary" type="submit">恢复课堂身份</button></div></form>`);}
function showRun(){openModal('run',modalHead(ui('运行资源使用申请'),ui('运行申请'))+ui`<p class="modal-description">请登记用途、预计次数和理由。每次申请完成后需等待六秒处理，再查看本次运行结果。</p><form id="run-form"><label class="field">运行用途<select name="purpose" aria-label="运行用途" required><option value="">请选择</option><option value="test">验证本次代码实现</option><option value="revision">检查修改后的代码</option><option value="confirm">确认代码仍然正确</option></select></label><label class="field">预计运行次数<input name="count" type="number" min="1" max="99" value="1" required></label><label class="field">运行理由<textarea name="reason" required minlength="8" maxlength="300" rows="3" placeholder="至少 8 个字符"></textarea></label><div class="modal-actions"><button class="btn primary" type="submit">提交运行申请</button></div></form>`);}
async function copy(text){try{await navigator.clipboard.writeText(text);toast(ui('已复制到剪贴板。'));}catch{openModal('copy',modalHead(ui('请手动复制'))+`<textarea class="copy-field" readonly>${esc(text)}</textarea>`);$('.copy-field').select();}}
function download(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function runCode(code,tests){return new Promise(resolve=>{let worker;try{worker=new Worker(new URL('./runner.worker.js',import.meta.url));}catch(e){resolve({results:[],error:e.message});return;}const requestId=crypto.randomUUID();let done=false;const finish=v=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();resolve(v);};const timer=setTimeout(()=>finish({results:[],error:ui('执行超过 2 秒，已终止。请检查无限循环。')}),2000);worker.onmessage=e=>{if(e.data.requestId===requestId)finish(e.data);};worker.onerror=e=>{e.preventDefault();finish({results:[],error:e.message});};worker.postMessage({requestId,code,tests});});}
async function startRun(form){const a=task(),d=draft(),v=new FormData(form),code=d.code,runGeneration=data?.demo?.generation;d.stats.applications++;d.logs.unshift({title:'运行申请已登记',time:new Date().toISOString(),details:['用途：'+v.get('purpose'),'理由：'+v.get('reason')]});persist();closeModal();busy=true;openModal('waiting',modalHead(ui('正在处理运行申请'),ui('资源调度'))+ui`<div class="waiting-display"><span id="waiting-number">12</span><small>%</small></div><div class="waiting-track"><span id="waiting-bar" style="width:12%"></span></div><h3 class="center" id="waiting-label">正在分配运行资源…</h3><p class="modal-description center">请保持页面，等待学习成果同步。</p>`);const result=await runCode(code,testsFor(a.preset));$('#waiting-number').textContent='99';$('#waiting-bar').style.width='99%';$('#waiting-label').textContent=ui('正在同步学习成果…');setTimeout(()=>{if(runGeneration!==data?.demo?.generation){busy=false;closeModal();render();return;}d.stats.waitSeconds+=6;const e={id:'EVAL-'+crypto.randomUUID().slice(0,8).toUpperCase(),code,results:result.results,error:result.error,passed:result.results.length===8&&result.results.every(t=>t.passed)&&!result.error,time:new Date().toISOString()};d.evaluation=e;d.history.unshift(e);d.logs.unshift({title:e.passed?'代码评测已通过':'代码评测未通过',time:e.time,details:['结果编号：'+e.id,`通过 ${e.results.filter(t=>t.passed).length} / 8 个用例。`,...(e.error?[e.error]:[])]});persist();busy=false;closeModal();render();toast(e.passed?ui('代码通过，可以提交作业。'):ui('评测未通过，请查看明细。'));},6000);}
async function mutate(path,body={}){if(busy)return;busy=true;try{const result=await api(path,{method:'POST',body});acceptSnapshot(result);syncError='';busy=false;closeModal();render();return result;}catch(e){busy=false;throw e;}}
async function submitAssignment() {
  const assignment = task();
  const current = draft();
  if (!assignment || !canSubmit(assignment, latest(assignment.id))) return;
  if (!current.evaluation?.passed || current.evaluation.code !== current.code) {
    failStudent([ui('请先通过当前代码的全部评测用例。')]);
    return;
  }
  current.nonce ??= crypto.randomUUID();
  persist();
  try {
    await mutate('/api/assignments/' + assignment.id + '/submit', {
      code: current.code,
      evaluation: current.evaluation,
      nonce: current.nonce
    });
    current.nonce = null;
    persist();
  } catch (error) {
    failStudent([error.message]);
  }
}
function peerReviewEntry(assignment) {
  const path = 'peer-review/' + assignment.id;
  return ui`<section class="panel padded margin-top"><div class="panel-head flush"><h2>同伴互评</h2>
    ${latest(assignment.id) ? link(ui('查看同伴互评'), path, 'secondary small') : badge(ui('未解锁'))}</div>
    <p class="body-copy">${latest(assignment.id) ? ui('查看本次作业的匿名互评任务。') : ui('正式提交自己的作业后解锁。')}</p></section>`;
}
function peerReviewKey(assignment) {
  return profile.key + ':' + assignment.id;
}
function peerReviewPath(assignment) {
  return '/api/assignments/' + assignment.id + '/peer-reviews';
}
async function loadPeerReviews(assignment) {
  const key = peerReviewKey(assignment);
  if (peerReviews.get(key)?.loading) return;
  peerReviews.set(key, {loading: true});
  try {
    peerReviews.set(key, await api(peerReviewPath(assignment)));
  } catch (error) {
    peerReviews.set(key, {error: error.message});
  }
  if (profile && key === peerReviewKey(assignment) && task()?.id === assignment.id && route().startsWith('peer-review/')) render();
}
function peerReviewPage() {
  const assignment = task();
  if (!assignment) return missingTask();
  const path = 'peer-review/' + assignment.id;
  const state = peerReviews.get(peerReviewKey(assignment));
  const slot = route().split('/')[2];
  const title = heading(ui('作业互评'), ui('同伴互评'), assignment.title, link(ui('返回作业'), 'lab/' + assignment.id));
  if (!state) void loadPeerReviews(assignment);
  if (!state || state.loading) return title + ui('<section class="panel padded" role="status">正在读取互评记录…</section>');
  if (state.error) return title + `<section class="panel padded"><p>${esc(ui(state.error))}</p>${btn(ui('重新加载'), 'peer-refresh', 'secondary')}</section>`;
  if (state.status === 'locked') return title + empty(ui('互评尚未解锁'), ui('正式提交自己的作业后，可以参加同伴互评。'));
  if (slot && state.reviews.length) {
    const review = state.reviews.find(item => String(item.slot) === slot);
    if (review) return peerReviewForm(assignment, review, state.status === 'submitted');
  }

  const completed = state.status === 'submitted';
  const progress = badge(ui('已提交 ') + state.submittedCount + '/2', completed ? 'success' : 'neutral');
  let contents;
  if (state.status === 'waiting') {
    contents = ui`<p class="body-copy">同课堂至少有两位其他同学提交这份作业后，即可领取。</p>
      ${btn(ui('刷新互评'), 'peer-refresh', 'secondary')}`;
  } else if (state.status === 'ready') {
    contents = ui`<p class="body-copy">可以领取两份匿名同学的作业。</p>${btn(ui('领取互评作业'), 'peer-start')}`;
  } else {
    const allSaved = state.reviews.every(review => review.draft);
    contents = state.reviews.map(review => ui`<div class="affair-row"><div class="grow">
      <h3>作业 ${review.slot === 1 ? 'A' : 'B'}</h3>
      ${completed ? badge(ui('已提交'), 'success') : review.draft ? badge(ui('已保存'), 'success') : badge(ui('待评分'))}</div>
      ${link(completed ? ui('查看评审') : review.draft ? ui('修改评分') : ui('开始评分'), path + '/' + review.slot, 'secondary small')}</div>`).join('');
    if (!completed) contents += `<div class="form-actions">${btn(ui('提交互评'), 'peer-confirm', 'secondary', allSaved ? '' : 'disabled')}</div>`;
  }
  return title + `<section class="panel padded"><div class="panel-head flush"><h2>${completed ? ui('互评已完成') : ui('互评作业')}</h2>${progress}</div>${contents}</section>`;
}
function peerReviewForm(assignment, review, completed) {
  const label = ui('作业 ') + (review.slot === 1 ? 'A' : 'B');
  const title = heading(ui('作业互评'), label, assignment.title, link(ui('返回互评列表'), 'peer-review/' + assignment.id));
  const fields = peerCriteria.map((criterion, index) => ui`<label class="field">${ui(criterion)}
    <select name="score${index}" required ${completed ? 'disabled' : ''}><option value="">请选择 1–5 分</option>
    ${[1, 2, 3, 4, 5].map(score => ui`<option value="${score}" ${review.draft?.scores[index] === score ? 'selected' : ''}>${score} 分</option>`).join('')}</select></label>`).join('');
  return title + ui`<section class="panel padded"><h2>匿名提交代码</h2><pre class="review-code">${esc(review.code)}</pre></section>
    <section class="panel padded margin-top"><div class="panel-head flush"><h2>评分与评语</h2>
    ${completed ? badge(ui('已提交'), 'success') : review.draft ? badge(ui('已保存'), 'success') : ''}</div>
    <form id="peer-review-form" data-slot="${review.slot}">${fields}
      <label class="field">评语<textarea name="feedback" rows="4" maxlength="1000" required ${completed ? 'readonly' : ''}>${esc(review.draft?.feedback)}</textarea></label>
      ${completed ? '' : ui('<div class="form-actions"><button type="submit" class="btn primary">保存评分</button></div>')}
    </form></section>`;
}
async function writePeerReview(action, body, message) {
  const assignment = task();
  if (!assignment || busy) return;
  const key = peerReviewKey(assignment);
  busy = true;
  try {
    const result = await api(peerReviewPath(assignment) + '/' + action, {method: 'POST', body});
    peerReviews.set(key, result);
    busy = false;
    if (profile && key === peerReviewKey(assignment) && task()?.id === assignment.id && route().startsWith('peer-review/')) {
      closeModal();
      render();
      if (message) toast(message);
    }
  } finally {
    busy = false;
  }
}
async function activate(key){const p=local.profiles.find(p=>p.key===key);if(!p)return;closeModal();profile=p;local.active=key;data=null;qaAssistant?.sync();persist();await refresh();if(data){go('dashboard');render();}}
function prepareReview(decision){const s=data.submissions.find(s=>s.id===route().split('/')[2]),f=reviews[s.id];if(decision==='verified'&&(!f.checkedCode||!f.checkedMaterial)){toast(ui('请完成代码与提交记录两项核实。'));return;}if(decision==='returned'&&f.feedback.trim().length<4){toast(ui('退回时至少填写 4 个字符的原因。'));return;}if(decision==='verified'&&(!Number.isInteger(Number(f.score))||Number(f.score)<0||Number(f.score)>100)){toast(ui('成绩必须为 0–100 的整数。'));return;}pendingReview={...f,decision,score:Number(f.score)};openModal('review',modalHead(decision==='verified'?ui('确认核实通过'):ui('确认退回修改'))+ui`<p class="modal-description">${esc(s.student_name)} · ${esc(s.assignment_title)} · 第 ${s.version} 次</p>${decision==='verified'?ui('<p class="modal-description">本次仅保存评分。学生需等待您另外勾选并发布本条成绩。</p>'):''}<div class="confirmation-summary"><strong>${decision==='verified'?ui('成绩：')+pendingReview.score+ui(' 分'):ui('退回原因')}</strong><p class="body-copy">${esc(f.feedback||ui('无额外反馈'))}</p></div><div class="modal-actions">${btn(ui('继续检查'),'close-modal','secondary')}${btn(ui('确认处理'),'review-confirm')}</div>`);}
const actions={'demo-tools':demoTools,'demo-reset':async()=>{await mutate('/api/demo/reset',{confirm:true});go('dashboard');render();toast(getLanguage()==='en'?'Demo opening restored.':'已恢复：乙现场写代码，甲丙已交且评分待发布。');},identity,help:()=>openModal('help',modalHead(ui('师生事务办理指南'))+ui('<ol class="help-list"><li>教师创建课堂，保存作业草稿后单独发布。</li><li>学生使用课堂码加入，从学习中心进入实践记录。</li><li>查资料、写代码、申请运行，完成评测。</li><li>评测通过后，直接点击「提交作业」。</li><li>教师保存核实评分后，还需逐条打开记录、勾选发布；也可填写原因退回。</li><li>学生到提交记录查回执，教师发布后再查成绩；退回后可修改重交。</li></ol>')),recover,'close-modal':closeModal,refresh:()=>refresh(),activate:e=>activate(e.dataset.key),
  language:button=>changeLanguage(button.dataset.language),
  'submit-assignment':submitAssignment,
  'peer-refresh':async()=>{if(!task())return;const request=loadPeerReviews(task());render();await request;},
  'peer-start':()=>writePeerReview('start', {}),
  'peer-confirm':()=>openModal('peer-confirm', modalHead(ui('确认提交互评'))+
    ui`<p class="modal-description">两份评分和评语将一起正式提交，提交后不可修改。</p>
      <div class="modal-actions">${btn(ui('返回'),'close-modal','secondary')}${btn(ui('确认提交'),'peer-submit')}</div>`),
  'peer-submit':()=>writePeerReview('submit', {confirm: true}, ui('互评已完成。')),
  lobby:()=>{closeModal();profile=null;data=null;local.active=null;persist();go('dashboard');render();},
  'join-current':()=>openModal('join',modalHead(ui('以学生身份加入本课堂'))+joinForm(profile.room.code)),
  invite:()=>copy(location.origin+location.pathname+'?class='+profile.room.code),'copy-token':()=>copy(profile.token),
  save:()=>{persist();toast(ui('草稿已保存在当前浏览器，尚未提交。'));},run:showRun,'copy-evaluation':()=>copy(draft().evaluation.id),'export-code':()=>download('main.js',draft().code,'text/javascript'),
  'download-receipt':()=>{const s=data.submissions.find(s=>s.id===route().split('/')[1])||latest(task()?.id);download(s.id+'.json',JSON.stringify({platform:ui('交了没？ · 双端演示'),classroom:data.room,student:profile.student,submission:s},null,2));},
  'queue-filter':e=>{queueFilter=e.dataset.filter;render();},
  'publish-task':e=>openModal('publish',modalHead(ui('发布作业给本课堂学生'))+ui`<p class="modal-description">发布后，本课堂学生即可查看、运行代码并提交。</p><div class="modal-actions">${btn(ui('暂不发布'),'close-modal','secondary')}${btn(ui('确认发布'),'publish-confirm','primary',`data-id="${e.dataset.id}"`)}</div>`),
  'publish-confirm':async e=>{await mutate('/api/assignments/'+e.dataset.id+'/publish');toast(ui('作业已发布，学生刷新后可见。'));},
  'close-task':e=>openModal('close-task',modalHead(ui('结束收取本次作业'))+ui`<p class="modal-description">关闭后不能新增提交，仍可核实已有记录。截止前可以重新开放。</p><div class="modal-actions">${btn(ui('保留开放'),'close-modal','secondary')}${btn(ui('确认结束收取'),'close-task-confirm','primary',`data-id="${e.dataset.id}"`)}</div>`),
  'close-task-confirm':async e=>{await mutate('/api/assignments/'+e.dataset.id+'/close');toast(ui('已结束收取。'));},'reopen-task':async e=>{await mutate('/api/assignments/'+e.dataset.id+'/reopen');toast(ui('作业已重新开放。'));},
  'publish-grade':async()=>{const s=data.submissions.find(s=>s.id===route().split('/')[2]);if(!$('#grade-release-confirm')?.checked){toast(ui('请先勾选本条成绩的发布确认。'));return;}await mutate('/api/submissions/'+s.id+'/publish-grade',{confirm:true});toast(ui('本条成绩已发布。其他记录仍需逐条办理。'));},
  'review-approve':()=>prepareReview('verified'),'review-return':()=>prepareReview('returned'),'review-confirm':async()=>{const s=data.submissions.find(s=>s.id===route().split('/')[2]);await mutate('/api/submissions/'+s.id+'/review',pendingReview);if(pendingReview.decision==='returned')go('teacher/reviews');toast(pendingReview.decision==='verified'?ui('核实评分已保存；还需逐条发布本条成绩。'):ui('已退回，学生可以修改后重新提交。'));}
};
document.addEventListener('click',async e=>{if(e.target.closest('a,button,summary')&&draft())draft().stats.clicks++;const el=e.target.closest('[data-action]');if(!el)return;e.preventDefault();if(busy)return;try{await actions[el.dataset.action]?.(el);}catch(error){toast(error.message);}});
document.addEventListener('input',e=>{const el=e.target,d=draft();if(el.id==='code-editor'&&d){d.code=el.value;persist();$('#line-numbers').textContent=d.code.split('\n').map((_,i)=>i+1).join('\n');$('#draft-status').textContent=ui('草稿已保留 · 当前版本需要重新评测');const passed=d.evaluation?.passed&&d.evaluation.code===d.code;$('#current-pass').innerHTML=passed?badge(ui('当前版本通过'),'success'):'';$('#submit-assignment').disabled=!passed||!canSubmit(task(),latest(task().id));}if(el.dataset.teacher)teacherForm[el.dataset.teacher]=el.value;if(el.dataset.review){const id=route().split('/')[2];if(reviews[id])reviews[id][el.dataset.review]=el.type==='checkbox'?el.checked:el.value;}});
document.addEventListener('change',e=>{const el=e.target;if(el.dataset.teacher==='preset'){const p=PRESETS[el.value];teacherForm.preset=el.value;teacherForm.title=exerciseTitle(p);teacherForm.description=ui(p.description);render();}});
document.addEventListener('submit',async e=>{const f=e.target;if(!['create-room','join-room','recover-session','create-assignment','run-form'].includes(f.id))return;e.preventDefault();if(busy||!f.reportValidity())return;if(f.id==='run-form'){await startRun(f);return;}const v=Object.fromEntries(new FormData(f));busy=true;f.querySelector('button[type="submit"]').disabled=true;try{if(f.id==='create-room'||f.id==='join-room'){const result=await api(f.id==='create-room'?'/api/classrooms':'/api/classrooms/join',{method:'POST',body:v,token:null});saveProfile(result);busy=false;closeModal();go('dashboard');render();toast(result.role==='teacher'?ui('课堂已创建，请在身份面板保留教师恢复口令。'):ui('已加入课堂。'));}if(f.id==='recover-session'){const token=v.token.trim(),result=await api('/api/session',{token});saveProfile({...result,token});busy=false;closeModal();go('dashboard');render();toast(ui('身份已恢复。'));}if(f.id==='create-assignment'){data=await api('/api/assignments',{method:'POST',body:{...v,dueAt:v.dueAt?new Date(v.dueAt).toISOString():null}});busy=false;go('teacher/tasks');render();toast(ui('草稿已保存，还需要单独发布。'));}}catch(error){busy=false;toast(error.message);f.querySelector('button[type="submit"]').disabled=false;}});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (form.id !== 'peer-review-form') return;
  event.preventDefault();
  const saveButton = form.querySelector('button[type="submit"]');
  if (!saveButton || busy || !form.reportValidity()) return;
  const values = new FormData(form);
  const scores = peerCriteria.map((_, index) => Number(values.get('score' + index)));
  saveButton.disabled = true;
  try {
    await writePeerReview('save', {slot: Number(form.dataset.slot), scores, feedback: values.get('feedback')}, ui('评分已保存。'));
  } catch (error) {
    toast(error.message);
  } finally {
    saveButton.disabled = false;
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='Tab'&&e.target.id==='code-editor'&&!e.target.readOnly){e.preventDefault();const el=e.target;el.setRangeText('  ',el.selectionStart,el.selectionEnd,'end');el.dispatchEvent(new Event('input',{bubbles:true}));}});
window.addEventListener('hashchange',()=>{if(!busy)closeModal();render();window.scrollTo(0,0);});
setInterval(()=>{if(profile&&!document.hidden&&!busy)refresh(true);},12000);
qaAssistant=mountAssistant({getContext:()=>({identity:profile?.key||'visitor',token:profile?.token,page:route(),assignmentId:task()?.id||null})});
render();if(profile)refresh();

function submissionRecords(){const records=data.submissions;return heading(ui('提交历史'),ui('提交记录'),ui('以带提交时间、版本号和回执编号的记录核对办理结果。'),btn(ui('刷新提交记录'),'refresh','secondary'))+'<section class="panel">'+(records.length?ui('<div class="table-wrap"><table><thead><tr><th>提交时间</th><th>作业 / 版本</th><th>回执编号</th><th>当前状态</th><th>操作</th></tr></thead><tbody>')+records.map(s=>'<tr><td>'+date(s.submitted_at)+'</td><td><strong>'+esc(s.assignment_title)+ui('</strong><small>第 ')+s.version+ui(' 次提交</small></td><td><code>')+esc(s.id)+'</code></td><td>'+gradeStatus(s)+'</td><td>'+link(ui('查看回执'),'receipt/'+s.id,'secondary small')+'</td></tr>').join('')+'</tbody></table></div>':empty(ui('暂无提交回执'),ui('在实训页提交作业后，请在这里核对提交结果。')))+'</section>';}
function submissionDetails(){const s=data.submissions.find(s=>s.id===route().split('/')[1]);if(!s)return empty(ui('找不到这条提交记录'),ui('请刷新提交记录后重试。'),link(ui('提交记录'),'submissions'));return receipt(data.assignments.find(a=>a.id===s.assignment_id),s);}

document.addEventListener('keydown',e=>{if(e.altKey&&e.shiftKey&&e.code==='KeyR'&&data?.demo?.canReset){e.preventDefault();demoTools();}});
