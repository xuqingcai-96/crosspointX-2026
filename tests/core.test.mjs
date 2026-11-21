import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {freshState,SOLUTION,TESTS,currentPass,archiveErrors,makeReceipt} from '../dist/core.mjs';

const workerSource=await readFile(new URL('../dist/runner.worker.js',import.meta.url),'utf8');
function evaluate(code,timeout=1500){
  return new Promise(resolve=>{
    const boot=`const {parentPort}=require('node:worker_threads');global.self={postMessage:message=>parentPort.postMessage(message)};${workerSource}\nparentPort.on('message',data=>self.onmessage({data}));`;
    const w=new Worker(boot,{eval:true});
    const timer=setTimeout(()=>{w.terminate();resolve({error:'timeout',results:[]});},timeout);
    w.once('message',result=>{clearTimeout(timer);w.terminate();resolve(result);});
    w.once('error',error=>{clearTimeout(timer);w.terminate();resolve({error:error.message,results:[]});});
    w.postMessage({requestId:'test',code,tests:TESTS});
  });
}
function validState(){
  const s=freshState();s.code=SOLUTION;s.evaluation={id:'EVAL-VALID',code:SOLUTION,passed:true};
  s.submission={filename:'JS_L01_20260001.js',course:'JavaScript 程序设计',task:'第 1 关：两个数的和',evaluationId:'EVAL-VALID',note:'完成求和函数并通过全部八个测试用例',attachment:{content:SOLUTION,size:80,name:'main.js'}};
  return s;
}
test('actual evaluator accepts equivalent correct implementations',async()=>{
  for(const code of [SOLUTION,'const solve = (x,y) => y + x;','function solve(a,b){let total=a;total+=b;return total;}']){
    const r=await evaluate(code);assert.equal(r.error,null);assert.equal(r.results.length,8);assert.ok(r.results.every(t=>t.passed));
  }
});
test('starter subtraction does not falsely pass',async()=>{const r=await evaluate(freshState().code);assert.ok(r.results.some(t=>!t.passed));});
test('string answers are rejected even when visually similar',async()=>{const r=await evaluate('function solve(a,b){return String(a+b)}');assert.ok(r.results.every(t=>!t.passed));});
test('syntax and missing function errors return diagnostic information',async()=>{
  assert.ok((await evaluate('function solve( {')).error);
  assert.match((await evaluate('const answer=3;')).error,/solve/);
});
test('an infinite loop can be terminated without blocking the host',async()=>{const r=await evaluate('function solve(){while(true){}}',200);assert.equal(r.error,'timeout');});
test('unassessed and changed code cannot be archived',()=>{
  assert.equal(currentPass(freshState()),false);assert.ok(archiveErrors(freshState()).length>=6);
  const s=validState();s.code='function solve(a,b){return 999}';assert.equal(currentPass(s),false);assert.ok(archiveErrors(s).some(e=>e.includes('代码')));
});
test('complete valid submission produces a receipt with the actual code',()=>{
  const s=validState();assert.deepEqual(archiveErrors(s),[]);const receipt=makeReceipt(s,new Date('2026-11-21T02:30:00Z'));assert.equal(receipt.score,100);assert.equal(receipt.evaluationId,'EVAL-VALID');assert.equal(receipt.code,SOLUTION);assert.equal(receipt.filename,'JS_L01_20260001.js');
});
test('incorrect reference, mismatched attachment and large file remain recoverable',()=>{
  const s=validState();s.submission.evaluationId='stale';s.submission.attachment.content='old code';s.submission.attachment.size=40000;
  const errors=archiveErrors(s);assert.ok(errors.some(e=>e.includes('编号')));assert.ok(errors.some(e=>e.includes('不一致')));assert.ok(errors.some(e=>e.includes('32 KB')));assert.throws(()=>makeReceipt(s));
  s.submission.evaluationId='EVAL-VALID';s.submission.attachment.content=SOLUTION;s.submission.attachment.size=80;assert.deepEqual(archiveErrors(s),[]);
});
test('state can be serialized and restored with receipt intact',()=>{const s=validState();s.receipt=makeReceipt(s);const restored=JSON.parse(JSON.stringify(s));assert.equal(restored.receipt.id,s.receipt.id);assert.equal(currentPass(restored),true);});
