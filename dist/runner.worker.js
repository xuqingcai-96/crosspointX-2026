/* A disposable worker is used for each run; the host terminates it after 2 seconds. */
self.onmessage = function(event) {
  const {code,tests,requestId}=event.data;
  const send=self.postMessage.bind(self);
  try {
    const run = new Function('self','postMessage','fetch','XMLHttpRequest','WebSocket','importScripts',
      '"use strict";\n'+code+'\n;if(typeof solve!=="function") throw new Error("请定义 solve(a, b) 函数"); return solve;');
    const solve=run(undefined,undefined,undefined,undefined,undefined,undefined);
    const results=tests.map(test=>{
      try {
        const value=solve(...test.args);
        const actual=typeof value==='number'&&Number.isFinite(value)?value:String(value);
        return {...test,actual,passed:typeof value==='number'&&Object.is(value,test.expected)};
      } catch(error) {return {...test,actual:String(error.message).slice(0,200),passed:false};}
    });
    send({requestId,results,error:null});
  } catch(error) {send({requestId,results:[],error:String(error.message).slice(0,300)});}
};
