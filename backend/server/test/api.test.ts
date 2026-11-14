import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { newDb } from 'pg-mem';
import request from 'supertest';
import type { Pool } from 'pg';
import { createApp } from '../src/app.js';

async function fixture(t: any) {
  const db=newDb();db.public.none(await readFile(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
  const {Pool}=db.adapters.createPg();const pool=new Pool() as unknown as Pool;t.after(()=>pool.end());
  const app=createApp(pool,['http://localhost:5173']);
  const register=async(email:string)=>{await request(app).post('/api/auth/register').send({shopName:'Test shop',name:'Owner',email,password:'OwnerPass123'}).expect(201);const r=await request(app).post('/api/auth/login').send({email,password:'OwnerPass123'}).expect(200);return r.body.token as string;};
  const owner=await register('owner@example.com');
  const staff=await request(app).post('/api/staff').auth(owner,{type:'bearer'}).send({name:'Staff A',email:'a@example.com',password:'CashierPass123'}).expect(201);
  const login=await request(app).post('/api/auth/login').send({email:'a@example.com',password:'CashierPass123'}).expect(200);
  const p=await request(app).post('/api/products').auth(owner,{type:'bearer'}).send({name:'Test shoes',sku:'SHOE-1',costMinor:100000,priceMinor:150000,quantity:10}).expect(201);
  return {app,pool,owner,staff:login.body.token as string,staffId:staff.body.id as string,product:p.body,register};
}
test('health, authentication, origin checks and owner/cashier product permissions',async t=>{
  const f=await fixture(t);await request(f.app).get('/api/health').expect(200);
  await request(f.app).get('/online-api/health').expect(200);
  await request(f.app).get('/online-api/auth/accounts').auth(f.owner,{type:'bearer'}).expect(200);
  await request(f.app).get('/api/products').expect(401);
  await request(f.app).get('/api/products').set('Origin','https://other.example').auth(f.owner,{type:'bearer'}).expect(403);
  const staff=await request(f.app).get('/api/products').auth(f.staff,{type:'bearer'}).expect(200);
  assert.equal(staff.body[0].costMinor,undefined);assert.equal(staff.body[0].priceMinor,150000);
  await request(f.app).post('/api/products').auth(f.staff,{type:'bearer'}).send({}).expect(403);
  await request(f.app).post('/api/staff').auth(f.staff,{type:'bearer'}).send({}).expect(403);
  await request(f.app).post('/api/auth/login').send({email:'a@example.com',password:'WrongPassword'}).expect(401);
});
test('sales preserve server prices, hide costs, deduplicate retries and isolate cashiers',async t=>{
  const f=await fixture(t);const input={idempotencyKey:randomUUID(),payment:'Cash',lines:[{productId:f.product.id,quantity:2}]};
  const first=await request(f.app).post('/api/sales').auth(f.staff,{type:'bearer'}).send(input).expect(201);
  assert.equal(first.body.totalMinor,300000);assert.equal(first.body.costMinor,undefined);assert.equal(first.body.items[0].unitCostMinor,undefined);
  const replay=await request(f.app).post('/api/sales').auth(f.staff,{type:'bearer'}).send(input).expect(200);assert.equal(first.body.id,replay.body.id);
  await request(f.app).post('/api/sales').auth(f.staff,{type:'bearer'}).send({...input,payment:'POS'}).expect(409);
  await request(f.app).post('/api/sales').auth(f.staff,{type:'bearer'}).send({...input,idempotencyKey:randomUUID(),costMinor:0}).expect(400);
  const p=await request(f.app).get('/api/products').auth(f.owner,{type:'bearer'}).expect(200);assert.equal(p.body[0].quantity,8);
  const owner=await request(f.app).get('/api/sales').auth(f.owner,{type:'bearer'}).expect(200);assert.equal(owner.body[0].profitMinor,100000);
  await request(f.app).post('/api/staff').auth(f.owner,{type:'bearer'}).send({name:'Staff B',email:'b@example.com',password:'CashierPass123'}).expect(201);
  const b=await request(f.app).post('/api/auth/login').send({email:'b@example.com',password:'CashierPass123'}).expect(200);
  const sales=await request(f.app).get('/api/sales').auth(b.body.token,{type:'bearer'}).expect(200);assert.deepEqual(sales.body,[]);
});
test('shop isolation and disabling staff invalidate existing sessions',async t=>{
  const f=await fixture(t);const other=await f.register('other@example.com');
  const products=await request(f.app).get('/api/products').auth(other,{type:'bearer'}).expect(200);assert.deepEqual(products.body,[]);
  await request(f.app).post('/api/sales').auth(other,{type:'bearer'}).send({idempotencyKey:randomUUID(),payment:'Cash',lines:[{productId:f.product.id,quantity:1}]}).expect(404);
  await request(f.app).patch('/api/staff/'+f.staffId).auth(other,{type:'bearer'}).send({active:false}).expect(404);
  await request(f.app).patch('/api/staff/'+f.staffId).auth(f.owner,{type:'bearer'}).send({active:false}).expect(200);
  await request(f.app).get('/api/products').auth(f.staff,{type:'bearer'}).expect(401);
  await request(f.app).post('/api/auth/login').send({email:'a@example.com',password:'CashierPass123'}).expect(401);
});

test('restock is owner-only, repeat-safe, and receipts omit financial data',async t=>{
  const f=await fixture(t);const input={quantity:5,idempotencyKey:randomUUID()};
  await request(f.app).post('/api/products/'+f.product.id+'/restock').auth(f.staff,{type:'bearer'}).send(input).expect(403);
  const first=await request(f.app).post('/api/products/'+f.product.id+'/restock').auth(f.owner,{type:'bearer'}).send(input).expect(200);
  assert.equal(first.body.quantity,15);
  const again=await request(f.app).post('/api/products/'+f.product.id+'/restock').auth(f.owner,{type:'bearer'}).send(input).expect(200);assert.equal(again.body.quantity,15);
  await request(f.app).post('/api/products/'+f.product.id+'/restock').auth(f.owner,{type:'bearer'}).send({...input,quantity:6}).expect(409);
  const sale=await request(f.app).post('/api/sales').auth(f.staff,{type:'bearer'}).send({idempotencyKey:randomUUID(),payment:'Cash',lines:[{productId:f.product.id,quantity:2}]}).expect(201);
  const receipt=await request(f.app).get('/api/sales/'+sale.body.id+'/receipt').auth(f.staff,{type:'bearer'}).expect(200);
  assert.equal(receipt.body.shopName,'Test shop');assert.equal(receipt.body.cashierName,'Staff A');assert.equal(receipt.body.totalMinor,300000);assert.equal(receipt.body.costMinor,undefined);assert.equal(receipt.body.items[0].unitCostMinor,undefined);
  const other=await f.register('other-receipt@example.com');
  await request(f.app).get('/api/sales/'+sale.body.id+'/receipt').auth(other,{type:'bearer'}).expect(404);
  await request(f.app).post('/api/staff').auth(f.owner,{type:'bearer'}).send({name:'Staff B',email:'receipt-b@example.com',password:'CashierPass123'}).expect(201);
  const b=await request(f.app).post('/api/auth/login').send({email:'receipt-b@example.com',password:'CashierPass123'}).expect(200);
  await request(f.app).get('/api/sales/'+sale.body.id+'/receipt').auth(b.body.token,{type:'bearer'}).expect(404);
});

test('account switching requires target password, stays in shop and revokes old session',async t=>{
  const f=await fixture(t);
  const people=await request(f.app).get('/api/auth/accounts').auth(f.owner,{type:'bearer'}).expect(200);
  assert.equal(people.body.length,2);assert.equal(people.body[0].password_hash,undefined);
  await request(f.app).post('/api/auth/switch').auth(f.owner,{type:'bearer'}).send({userId:f.staffId,password:'wrong'}).expect(401);
  await request(f.app).get('/api/me').auth(f.owner,{type:'bearer'}).expect(200);
  const other=await f.register('other-switch@example.com');
  const foreign=await request(f.app).get('/api/me').auth(other,{type:'bearer'}).expect(200);
  await request(f.app).post('/api/auth/switch').auth(f.owner,{type:'bearer'}).send({userId:foreign.body.id,password:'OwnerPass123'}).expect(401);
  const switched=await request(f.app).post('/api/auth/switch').auth(f.owner,{type:'bearer'}).send({userId:f.staffId,password:'CashierPass123'}).expect(200);
  assert.equal(switched.body.user.role,'cashier');
  await request(f.app).get('/api/me').auth(f.owner,{type:'bearer'}).expect(401);
  await request(f.app).post('/api/products').auth(switched.body.token,{type:'bearer'}).send({}).expect(403);
  const ownerAccount=people.body.find((p:any)=>p.role==='owner');
  const back=await request(f.app).post('/api/auth/switch').auth(switched.body.token,{type:'bearer'}).send({userId:ownerAccount.id,password:'OwnerPass123'}).expect(200);
  assert.equal(back.body.user.role,'owner');
});
