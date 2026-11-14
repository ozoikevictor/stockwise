import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {newDb} from 'pg-mem';
import request from 'supertest';
import type {Pool} from 'pg';
import {createApp} from '../src/app.js';
import type {RecoveryMail} from '../src/recovery-mail.js';
async function fixture(t:any,configured=true){
  const db=newDb();for(const file of ['001_initial','002_offline_sales','003_password_recovery'])db.public.none(await readFile(new URL('../migrations/'+file+'.sql',import.meta.url),'utf8'));
  const {Pool}=db.adapters.createPg();const pool=new Pool() as unknown as Pool;t.after(()=>pool.end());const mail:RecoveryMail[]=[];
  const app=createApp(pool,[],configured?{origin:'https://shop.example',send:async m=>{mail.push(m);}}:undefined);
  const register=async(email:string)=>{await request(app).post('/api/auth/register').send({email,name:'Owner',shopName:'Shop',password:'OwnerPass123'}).expect(201);return (await request(app).post('/api/auth/login').send({email,password:'OwnerPass123'}).expect(200)).body.token as string;};
  const owner=await register('owner@example.com');const staff=(await request(app).post('/api/staff').auth(owner,{type:'bearer'}).send({email:'cashier@example.com',name:'Cashier',password:'StaffPass123'}).expect(201)).body;
  const cashier=(await request(app).post('/api/auth/login').send({email:'cashier@example.com',password:'StaffPass123'}).expect(200)).body.token;
  return {app,pool,mail,owner,staff,cashier,register};
}
async function resetLink(f:Awaited<ReturnType<typeof fixture>>,email='owner@example.com'){
  const reply=await request(f.app).post('/api/auth/forgot-password').send({email}).expect(202);await new Promise(setImmediate);const link=f.mail.at(-1)!;assert.ok(link);const token=new URL(link.url).hash.slice('#reset='.length);assert.match(token,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(reply.body).includes(token));return token;
}
test('email recovery is generic, stores only token hashes and revokes sessions on one-use reset',async t=>{
  const f=await fixture(t);const token=await resetLink(f);
  const unknown=await request(f.app).post('/api/auth/forgot-password').send({email:'missing@example.com'}).expect(202);assert.equal(Object.keys(unknown.body).join(','),'message');assert.equal(f.mail.length,1);
  const saved=await f.pool.query('SELECT token_hash FROM password_resets');assert.equal(saved.rows[0].token_hash,createHash('sha256').update(token).digest('hex'));
  await request(f.app).post('/api/auth/reset-password').send({token,password:'NewOwnerPass123'}).expect(200);
  await request(f.app).get('/api/me').auth(f.owner,{type:'bearer'}).expect(401);
  await request(f.app).post('/api/auth/login').send({email:'owner@example.com',password:'OwnerPass123'}).expect(401);
  await request(f.app).post('/api/auth/login').send({email:'owner@example.com',password:'NewOwnerPass123'}).expect(200);
  await request(f.app).post('/api/auth/reset-password').send({token,password:'AnotherPass123'}).expect(400);
});
test('expired links fail, cashier email recovery works and duplicate requests do not send twice',async t=>{
  const f=await fixture(t);const token=await resetLink(f,'cashier@example.com');
  await request(f.app).post('/api/auth/forgot-password').send({email:'cashier@example.com'}).expect(202);assert.equal(f.mail.length,1);
  await f.pool.query('UPDATE password_resets SET expires_at=$1',[new Date(Date.now()-1000)]);
  await request(f.app).post('/api/auth/reset-password').send({token,password:'NewStaffPass123'}).expect(400);
  await request(f.app).get('/api/me').auth(f.cashier,{type:'bearer'}).expect(200);
});
test('cashier reset requires own-shop owner and current owner password, then revokes cashier sessions',async t=>{
  const f=await fixture(t);
  const reset=(actor:string,id:string,ownerPassword='OwnerPass123')=>request(f.app).post('/api/staff/'+id+'/password').auth(actor,{type:'bearer'}).send({ownerPassword,password:'NewStaffPass123'});
  await reset(f.cashier,f.staff.id).expect(403);await reset(f.owner,f.staff.id,'incorrect').expect(401);
  const other=await f.register('other@example.com');await reset(other,f.staff.id).expect(404);
  await reset(f.owner,f.staff.id).expect(200);
  await request(f.app).get('/api/me').auth(f.cashier,{type:'bearer'}).expect(401);await request(f.app).get('/api/me').auth(f.owner,{type:'bearer'}).expect(200);
  await request(f.app).post('/api/auth/login').send({email:'cashier@example.com',password:'NewStaffPass123'}).expect(200);
});
test('unconfigured recovery reports unavailable instead of pretending to send email',async t=>{
  const f=await fixture(t,false);await request(f.app).post('/api/auth/forgot-password').send({email:'owner@example.com'}).expect(503);
});
