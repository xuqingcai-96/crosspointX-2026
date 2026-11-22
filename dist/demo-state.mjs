// A reset changes cloud records and must invalidate stale drafts on every device.
export function syncDemoGeneration(local,value){
  if(!value.demo)return false;
  local.demoGenerations??={};
  const roomId=value.room.id,generation=value.demo.generation;
  const changed=generation>0&&local.demoGenerations[roomId]!==generation;
  if(changed){
    const prefixes=local.profiles.filter(p=>p.room.id===roomId&&(p.role==='teacher'||!p.student||['DEMO01','DEMO02','DEMO03'].includes(p.student.student_number))).map(p=>p.key+':');
    for(const key of Object.keys(local.drafts))if(prefixes.some(prefix=>key.startsWith(prefix)))delete local.drafts[key];
  }
  local.demoGenerations[roomId]=generation;
  return changed;
}
