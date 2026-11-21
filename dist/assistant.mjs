import {getLanguage} from './i18n.mjs';
import {GUIDE_TOPICS,guideAnswer} from './help.mjs';

const assistantCopy={
  title:['问一问','Ask a question'],subtitle:['有疑问，就从这里开始。','A little help, right when you need it.'],
  guide:['内置帮助','Built-in help'],ai:['AI 问答','AI chat'],loading:['正在连接…','Connecting…'],
  intro:['还没有接入 AI 模型。目前由内置指南回答操作问题；通用编程问答将在配置模型后开放。','AI is not connected yet. Built-in guides can explain classroom tasks. General programming Q&A will be available after a model is configured.'],
  aiIntro:['可以问课堂操作或编程概念。我会结合当前任务说明回答。','Ask about classroom tasks or programming concepts. I can use the current assignment instructions.'],
  placeholder:['输入你的问题…','Type your question…'],send:['发送','Send'],close:['收起问答','Close chat'],
  reset:['新对话','New chat'],welcome:['你好，有什么想了解的？','Hi! What would you like to know?'],
  thinking:['正在思考…','Thinking…'],you:['你','You'],source:['内置指南','Built-in guide'],model:['AI 回复','AI reply'],
  note:['对话仅保留在当前页面。','Chat stays in this page only.'],aiNote:['发送问题、最近对话与当前任务说明，不附带成绩或身份口令。','Sends your question, recent chat and assignment instructions, without grades or recovery keys.'],
  join:['进入教师或学生课堂后，即可使用 AI 问答。现在也可以查看快捷操作帮助。','Join a classroom as a teacher or student to use AI chat. The quick help topics remain available.'],
  statusError:['暂时无法检查 AI 连接，当前仅提供内置帮助。','Unable to check the AI connection. Built-in help is available.'],
  genericError:['暂时没有收到回复，请稍后重试。','No reply was received. Please try again later.'],
  timeout:['等待回复超时，请稍后重试。','The reply timed out. Please try again later.'],
  label:['问答内容','Chat messages'],inputLabel:['你的问题','Your question'],error:['未完成','Not completed'],
  questionLimit:['每次最多 1000 个字符。','Up to 1,000 characters per message.']
};
const chatErrorTranslations={
  'AI 尚未配置，目前可使用内置操作帮助。':'AI is not configured yet. Built-in help is available.',
  '问题需为 1–1000 个字符。':'Questions must contain 1–1,000 characters.',
  '会话内容过长，请开始新对话。':'The conversation is too long. Start a new chat.',
  '问答次数已达当前时段上限，请稍后再试。':'The request limit has been reached. Please try again later.',
  'AI 服务繁忙，请稍后再试。':'The AI service is busy. Please try again later.',
  'AI 服务暂不可用，请稍后重试。':'The AI service is unavailable. Please try again later.',
  'AI 回复超时，请稍后重试。':'The AI reply timed out. Please try again later.',
  '请先进入课堂。':'Please enter a classroom first.',
  '课堂身份已失效，请使用恢复口令重新进入。':'Restore your classroom identity with your recovery key.',
  '找不到该课堂的作业。':'This assignment is not available in your classroom.'
};
const chatEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chatIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-7a8 8 0 1 1 18-3Z"/><path d="M8 10h8M8 14h5"/></svg>';

export function mountAssistant({getContext}){
  const root=document.getElementById('assistant-root');
  if(!root)return {sync(){}};
  const state={open:false,messages:[],draft:'',configured:false,loading:false,statusError:false,pending:false,identity:getContext().identity,language:getLanguage(),serial:0,controller:null};
  const text=key=>assistantCopy[key][getLanguage()==='en'?1:0];
  const displayError=message=>getLanguage()==='en'?(chatErrorTranslations[message]||text('genericError')):message;
  function render(scroll=false){
    const focused=document.activeElement?.id==='assistant-question';
    const selection=focused?[document.activeElement.selectionStart,document.activeElement.selectionEnd]:null;
    root.innerHTML=`<button type="button" class="assistant-launcher" data-chat-action="toggle" aria-expanded="${state.open}" aria-controls="assistant-panel">${chatIcon}<span>${text('title')}</span></button>
      <section id="assistant-panel" class="assistant-panel" role="region" aria-labelledby="assistant-heading" ${state.open?'':'hidden'}>
        <header class="assistant-header"><div class="assistant-emblem">${chatIcon}</div><div class="assistant-heading"><h2 id="assistant-heading">${text('title')}</h2><p>${text('subtitle')}</p></div>
          <button type="button" class="assistant-icon-button" data-chat-action="close" aria-label="${text('close')}">×</button></header>
        <div class="assistant-mode"><span class="assistant-mode-label ${state.configured?'connected':''}">${state.loading?text('loading'):text(state.configured?'ai':'guide')}</span><button type="button" data-chat-action="reset" ${state.pending?'disabled':''}>${text('reset')}</button></div>
        <div class="assistant-scroll"><p class="assistant-intro">${state.statusError?text('statusError'):text(state.configured?'aiIntro':'intro')}</p>
          <div class="assistant-topics">${GUIDE_TOPICS.slice(0,4).map(topic=>`<button type="button" data-chat-topic="${topic.id}" ${state.pending||state.loading?'disabled':''}>${chatEscape(topic.question[getLanguage()==='en'?1:0])}</button>`).join('')}</div>
          <div class="assistant-messages" role="log" aria-label="${text('label')}" aria-live="polite">${state.messages.length?state.messages.map(message=>`<article class="assistant-message ${message.role==='user'?'from-user':'from-assistant'} ${message.mode==='error'?'chat-error':''}"><small>${text(message.role==='user'?'you':message.mode==='ai'?'model':message.mode==='error'?'error':'source')}</small><p>${chatEscape(message.content)}</p></article>`).join(''):`<div class="assistant-welcome">${chatIcon}<p>${text('welcome')}</p></div>`}${state.pending?`<p class="assistant-thinking" role="status"><span></span><span></span><span></span>${text('thinking')}</p>`:''}</div>
        </div><form id="assistant-form" class="assistant-form"><label class="assistant-sr" for="assistant-question">${text('inputLabel')}</label><textarea id="assistant-question" rows="2" maxlength="1000" placeholder="${text('placeholder')}" aria-describedby="assistant-limit">${chatEscape(state.draft)}</textarea>
          <div class="assistant-send-row"><span id="assistant-limit">${text('questionLimit')}</span><button type="submit" ${state.pending||state.loading||!state.draft.trim()?'disabled':''}>${text('send')}</button></div></form>
        <p class="assistant-footnote">${text(state.configured?'aiNote':'note')}</p>
      </section>`;
    if(focused&&state.open){const field=root.querySelector('#assistant-question');field.focus({preventScroll:true});field.setSelectionRange(...selection);}
    if(scroll){const log=root.querySelector('.assistant-scroll');log.scrollTop=log.scrollHeight;}
  }
  async function checkStatus(){
    if(state.loading)return;
    state.loading=true;render();
    try{
      const response=await fetch('/api/assistant/status',{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error();
      const value=await response.json();state.configured=value.configured===true;state.statusError=false;
    }catch{state.configured=false;state.statusError=true;}
    finally{state.loading=false;render();}
  }
  function reset(){state.serial++;state.controller?.abort();state.controller=null;state.messages=[];state.pending=false;state.draft='';render();}
  async function send(question){
    question=question.trim();if(!question||question.length>1000||state.pending||state.loading)return;
    const context=getContext();
    if(context.identity!==state.identity){state.identity=context.identity;reset();return;}
    const serial=++state.serial;
    const history=state.messages.filter(message=>message.mode==='ai').slice(-6).map(({role,content})=>({role,content:content.slice(0,2000)}));
    state.messages=state.messages.slice(-38);state.messages.push({role:'user',content:question,mode:state.configured?'ai':'guide'});state.draft='';
    if(!state.configured){state.messages.push({role:'assistant',content:guideAnswer(question,getLanguage()),mode:'guide'});render(true);return;}
    if(!context.token){state.messages.push({role:'assistant',content:text('join'),mode:'error'});render(true);return;}
    state.pending=true;const controller=state.controller=new AbortController();render(true);
    const timer=setTimeout(()=>controller.abort(),35000);
    try{
      const response=await fetch('/api/assistant/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+context.token},body:JSON.stringify({question,history,language:getLanguage(),page:context.page,assignmentId:context.assignmentId||null}),signal:controller.signal});
      const value=await response.json();if(!response.ok)throw new Error(value.error||text('genericError'));
      if(serial!==state.serial||context.identity!==getContext().identity)return;
      if(typeof value.answer!=='string')throw new Error(text('genericError'));
      state.messages.push({role:'assistant',content:value.answer,mode:'ai'});
    }catch(error){if(serial===state.serial)state.messages.push({role:'assistant',content:error.name==='AbortError'?text('timeout'):displayError(error.message),mode:'error'});}
    finally{clearTimeout(timer);if(serial===state.serial){state.pending=false;state.controller=null;render(true);}}
  }
  root.addEventListener('click',event=>{
    const topicButton=event.target.closest('[data-chat-topic]');
    if(topicButton){const topic=GUIDE_TOPICS.find(item=>item.id===topicButton.dataset.chatTopic);if(topic)void send(topic.question[getLanguage()==='en'?1:0]);return;}
    const action=event.target.closest('[data-chat-action]')?.dataset.chatAction;
    if(action==='reset'){reset();return;}
    if(action==='toggle'||action==='close'){
      state.open=action==='toggle'?!state.open:false;render();
      if(state.open){void checkStatus();root.querySelector('#assistant-question')?.focus();}
      else root.querySelector('.assistant-launcher')?.focus();
    }
  });
  root.addEventListener('input',event=>{if(event.target.id!=='assistant-question')return;state.draft=event.target.value;root.querySelector('button[type="submit"]').disabled=state.pending||state.loading||!state.draft.trim();});
  root.addEventListener('submit',event=>{if(event.target.id!=='assistant-form')return;event.preventDefault();void send(state.draft);});
  root.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.target.id==='assistant-question'){event.preventDefault();void send(state.draft);}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.open&&!document.querySelector('#modal-root [role="dialog"]')){state.open=false;render();root.querySelector('.assistant-launcher')?.focus();}});
  render();
  return {sync(){const context=getContext(),language=getLanguage();let changed=language!==state.language;if(context.identity!==state.identity){state.identity=context.identity;reset();changed=true;}state.language=language;if(changed)render();}};
}
