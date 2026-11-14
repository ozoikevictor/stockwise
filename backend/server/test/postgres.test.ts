import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../src/app.js';

test('real PostgreSQL: concurrent tills, duplicate retry and multi-line rollback', {skip:!process.env.TEST_DATABASE_URL}, async t=>{
  // TEST_DATABASE_URL must point to a disposable development database.
  const schema='stockwise_test_'+randomUUID().replaceAll('-','');
  const admin=new Pool({connectionString:process.env.TEST_DATABASE_URL});
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:6});
  t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
  await pool.query(await readFile(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
  const app=createApp(pool);
  await request(app).post('/api/auth/register').send({shopName:'Concurrency test',name:'Owner',email:'owner@example.com',password:'OwnerPass123'}).expect(201);
  const login=await request(app).post('/api/auth/login').send({email:'owner@example.com',password:'OwnerPass123'}).expect(200);
  const token=login.body.token;
  const makeProduct=async(quantity:number)=>{const r=await request(app).post('/api/products').auth(token,{type:'bearer'}).send({name:'Test',sku:randomUUID(),priceMinor:150000,costMinor:100000,quantity}).expect(201);return r.body.id as string;};
  const sell=(key:string,lines:{productId:string;quantity:number}[])=>request(app).post('/api/sales').auth(token,{type:'bearer'}).send({idempotencyKey:key,payment:'Cash',lines});
  const last=await makeProduct(1);
  const results=await Promise.all([sell(randomUUID(),[{productId:last,quantity:1}]),sell(randomUUID(),[{productId:last,quantity:1}])]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const retryProduct=await makeProduct(2);const key=randomUUID();
  const retries=await Promise.all([sell(key,[{productId:retryProduct,quantity:1}]),sell(key,[{productId:retryProduct,quantity:1}])]);
  assert.deepEqual(retries.map(r=>r.status).sort(),[200,201]);assert.equal(retries[0].body.id,retries[1].body.id);
  const available=await makeProduct(3);const unavailable=await makeProduct(0);
  await sell(randomUUID(),[{productId:available,quantity:1},{productId:unavailable,quantity:1}]).expect(409);
  const rows=await pool.query('SELECT id,quantity FROM products');
  assert.equal(rows.rows.find(p=>p.id===last).quantity,0);
  assert.equal(rows.rows.find(p=>p.id===retryProduct).quantity,1);
  assert.equal(rows.rows.find(p=>p.id===available).quantity,3);
  assert.equal((await pool.query('SELECT count(*) AS count FROM sales')).rows[0].count,'2');
});
