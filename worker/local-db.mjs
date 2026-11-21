import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function openLocalDatabase(filename=':memory:'){
  const sqlite=new DatabaseSync(filename);sqlite.exec('PRAGMA foreign_keys=ON;');
  const exists=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='classrooms'").get();
  if(!exists)sqlite.exec(readFileSync(new URL('../drizzle/0000_classroom.sql',import.meta.url),'utf8'));
  const prepare=sql=>{
    const statement=sqlite.prepare(sql);let values=[];
    return {bind(...args){values=args;return this;},async first(){return statement.get(...values)??null;},async all(){return {results:statement.all(...values)};},async run(){const result=statement.run(...values);return {success:true,meta:{changes:Number(result.changes)}};}};
  };
  let pending=Promise.resolve();
  return {prepare,batch(statements){const operation=pending.then(async()=>{sqlite.exec('BEGIN IMMEDIATE');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}});pending=operation.catch(()=>{});return operation;},close(){sqlite.close();}};
}
