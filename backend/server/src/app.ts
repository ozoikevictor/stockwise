import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Pool, PoolClient } from 'pg';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';

const derive = promisify(scrypt);
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function encode(password: string) { const salt = randomBytes(16).toString('hex'); return `scrypt$${salt}$${(await derive(password, salt, 64) as Buffer).toString('hex')}`; }
async function verify(password: string, encoded: string) {
  const [algorithm, salt, digest] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !/^[a-f0-9]{128}$/.test(digest ?? '')) return false;
  return timingSafeEqual(await derive(password, salt, 64) as Buffer, Buffer.from(digest, 'hex'));
}
type Actor = { id: string; shop_id: string; name: string; role: 'owner' | 'cashier' };
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const email = z.string().trim().email().max(254).transform(s => s.toLowerCase());
const password = z.string().min(8).max(128);
const short = z.string().trim().min(1).max(200);
const minor = z.number().int().min(0).max(1_000_000_000);
const saleInput = z.object({ idempotencyKey:z.string().uuid(), payment:z.enum(['Cash','Transfer','POS','Other']), recordedAt:z.string().datetime().refine(s=>Date.parse(s)<=Date.now()+5*60*1000,'Device clock is ahead of server time').optional(), lines:z.array(z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(10000),expectedPriceMinor:minor.optional()}).strict()).min(1).max(100) }).strict();
async function transaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const value = await fn(client); await client.query('COMMIT'); return value; }
  catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
const safeUser = (u: Actor) => ({id:u.id,shopId:u.shop_id,name:u.name,role:u.role});
function productDTO(p: any, owner: boolean) { return {id:p.id,name:p.name,sku:p.sku,priceMinor:Number(p.price_minor),quantity:p.quantity,archived:p.archived,...(owner ? {costMinor:Number(p.cost_minor)} : {})}; }
function saleDTO(s: any, items: any[], owner: boolean) { return {id:s.id,cashierId:s.cashier_id,totalMinor:Number(s.total_minor),payment:s.payment,createdAt:s.recorded_at??s.created_at,syncedAt:s.created_at,...(owner ? {costMinor:Number(s.cost_minor),profitMinor:Number(s.total_minor)-Number(s.cost_minor)} : {}),items:items.map(i=>({productId:i.product_id,productName:i.product_name,quantity:i.quantity,unitPriceMinor:Number(i.unit_price_minor),...(owner?{unitCostMinor:Number(i.unit_cost_minor)}:{})}))}; }

export function createApp(pool: Pool, origins: string[] = []) {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  // Browser and API share one origin; the desktop proxy uses /api directly.
  app.use((req,_res,next)=>{if(req.url.startsWith('/online-api/'))req.url='/api/'+req.url.slice('/online-api/'.length);next();});
  app.use((req,res,next)=>{
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    const origin=req.headers.origin;
    if(origin && !origins.includes(origin) && origin !== process.env.PUBLIC_ORIGIN) { res.status(403).json({error:'Origin not allowed'}); return; }
    if(origin) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');}
    if(req.method==='OPTIONS') {res.sendStatus(204);return;} next();
  });
  app.use(express.json({limit:'128kb'}));
  const attempts=new Map<string,{count:number;until:number}>();
  const limit=(req:Request,res:Response,next:NextFunction)=>{
    const now=Date.now(); for(const [key,value] of attempts) if(value.until<=now) attempts.delete(key);
    const key=req.ip ?? 'unknown'; const current=attempts.get(key) ?? {count:0,until:now+60000};
    if(current.count>=20) {res.setHeader('Retry-After','60');res.status(429).json({error:'Too many attempts. Try again shortly.'});return;}
    if(attempts.size>=10000&&!attempts.has(key)){res.status(429).json({error:'Try again shortly.'});return;}
    current.count++;attempts.set(key,current);next();
  };
  const auth=async(req:Request,res:Response,next:NextFunction)=>{
    try {const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)throw new HttpError(401,'Sign in required');
      const {rows}=await pool.query('SELECT u.id,u.shop_id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > $2 AND u.active=TRUE',[hash(token),new Date()]);
      if(!rows[0])throw new HttpError(401,'Session expired or account disabled');res.locals.actor=rows[0];next();
    } catch(e){next(e);}
  };
  const owner=(_req:Request,res:Response,next:NextFunction)=>res.locals.actor.role==='owner'?next():next(new HttpError(403,'Owner access required'));
  async function audit(c:PoolClient,a:Actor,action:string,id:string){await c.query('INSERT INTO audit_log(id,shop_id,actor_id,action,record_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),a.shop_id,a.id,action,id]);}
  app.get('/api/health',async(_req,res,next)=>{try{await pool.query('SELECT 1');res.json({ok:true,service:'stockwise-online',offlineSalesVersion:1});}catch(e){next(e);}});
  app.post('/api/auth/register',limit,async(req,res,next)=>{try{
    const input=z.object({shopName:short,name:short,email,password}).strict().parse(req.body);
    const digest=await encode(input.password); const shopId=randomUUID();const userId=randomUUID();
    await transaction(pool,async c=>{await c.query('INSERT INTO shops(id,name) VALUES($1,$2)',[shopId,input.shopName]);await c.query("INSERT INTO users(id,shop_id,email,name,role,password_hash) VALUES($1,$2,$3,$4,'owner',$5)",[userId,shopId,input.email,input.name,digest]);});
    res.status(201).json({id:userId,shopId});
  }catch(e){next(e);}});
  app.post('/api/auth/login',limit,async(req,res,next)=>{try{
    const input=z.object({email,password:z.string().min(1).max(128)}).strict().parse(req.body);
    const {rows}=await pool.query('SELECT * FROM users WHERE email=$1 AND active=TRUE',[input.email]);const u=rows[0];
    const dummy='scrypt$00000000000000000000000000000000$'+'0'.repeat(128);
    if(!await verify(input.password,u?.password_hash ?? dummy)||!u)throw new HttpError(401,'Incorrect email or password');
    const token=randomBytes(32).toString('hex');const expiresAt=new Date(Date.now()+8*60*60*1000);
    await pool.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[hash(token),u.id,expiresAt]);
    res.json({token,expiresAt,user:safeUser(u)});
  }catch(e){next(e);}});
  app.post('/api/auth/logout',auth,async(req,res,next)=>{try{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash(req.headers.authorization!.slice(7))]);res.sendStatus(204);}catch(e){next(e);}});
  app.get('/api/auth/accounts',auth,async(_req,res,next)=>{try{
    const {rows}=await pool.query('SELECT id,name,role FROM users WHERE shop_id=$1 AND active=TRUE ORDER BY name',[res.locals.actor.shop_id]);res.json(rows);
  }catch(e){next(e);}});
  app.post('/api/auth/switch',auth,limit,async(req,res,next)=>{try{
    const input=z.object({userId:z.string().uuid(),password:z.string().min(1).max(128)}).strict().parse(req.body);
    const token=randomBytes(32).toString('hex');const expiresAt=new Date(Date.now()+8*60*60*1000);
    const user=await transaction(pool,async c=>{
      const {rows}=await c.query('SELECT * FROM users WHERE id=$1 AND shop_id=$2 AND active=TRUE FOR UPDATE',[input.userId,res.locals.actor.shop_id]);const u=rows[0];
      const dummy='scrypt$00000000000000000000000000000000$'+'0'.repeat(128);
      if(!await verify(input.password,u?.password_hash??dummy)||!u)throw new HttpError(401,'Incorrect account or password');
      await c.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[hash(token),u.id,expiresAt]);
      await c.query('DELETE FROM sessions WHERE token_hash=$1',[hash(req.headers.authorization!.slice(7))]);return safeUser(u);
    });res.json({token,expiresAt,user});
  }catch(e){next(e);}});
  app.get('/api/me',auth,(_req,res)=>res.json(safeUser(res.locals.actor)));
  app.post('/api/staff',auth,owner,limit,async(req,res,next)=>{try{
    const input=z.object({name:short,email,password}).strict().parse(req.body);const a:Actor=res.locals.actor;const id=randomUUID();const digest=await encode(input.password);
    await transaction(pool,async c=>{await c.query("INSERT INTO users(id,shop_id,email,name,role,password_hash) VALUES($1,$2,$3,$4,'cashier',$5)",[id,a.shop_id,input.email,input.name,digest]);await audit(c,a,'staff.created',id);});res.status(201).json({id,name:input.name,role:'cashier'});
  }catch(e){next(e);}});
  app.patch('/api/staff/:id',auth,owner,async(req,res,next)=>{try{
    const id=z.string().uuid().parse(req.params.id);const {active}=z.object({active:z.boolean()}).strict().parse(req.body);const a:Actor=res.locals.actor;
    await transaction(pool,async c=>{const r=await c.query("UPDATE users SET active=$1 WHERE id=$2 AND shop_id=$3 AND role='cashier' RETURNING id",[active,id,a.shop_id]);if(!r.rows[0])throw new HttpError(404,'Staff not found');if(!active)await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);await audit(c,a,active?'staff.enabled':'staff.disabled',id);});res.json({id,active});
  }catch(e){next(e);}});
  app.get('/api/products',auth,async(_req,res,next)=>{try{const a:Actor=res.locals.actor;const {rows}=await pool.query('SELECT * FROM products WHERE shop_id=$1 AND archived=FALSE ORDER BY name LIMIT 1000',[a.shop_id]);res.json(rows.map(p=>productDTO(p,a.role==='owner')));}catch(e){next(e);}});
  app.post('/api/products',auth,owner,async(req,res,next)=>{try{
    const input=z.object({name:short,sku:short,costMinor:minor,priceMinor:minor,quantity:z.number().int().min(0).max(1000000)}).strict().parse(req.body);const a:Actor=res.locals.actor;const id=randomUUID();
    const p=await transaction(pool,async c=>{const {rows}=await c.query('INSERT INTO products(id,shop_id,name,sku,cost_minor,price_minor,quantity) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id,a.shop_id,input.name,input.sku,input.costMinor,input.priceMinor,input.quantity]);await audit(c,a,'product.created',id);return rows[0];});res.status(201).json(productDTO(p,true));
  }catch(e){next(e);}});
  app.post('/api/products/:id/restock',auth,owner,async(req,res,next)=>{try{
    const id=z.string().uuid().parse(req.params.id);const input=z.object({quantity:z.number().int().min(1).max(1000000),idempotencyKey:z.string().uuid()}).strict().parse(req.body);const a:Actor=res.locals.actor;const action='stock.restock:'+input.quantity;
    const run=()=>transaction(pool,async c=>{
      const prior=await c.query('SELECT * FROM audit_log WHERE id=$1',[input.idempotencyKey]);
      if(prior.rows[0]){const entry=prior.rows[0];if(entry.shop_id!==a.shop_id||entry.actor_id!==a.id||entry.record_id!==id||entry.action!==action)throw new HttpError(409,'Restock key already used');const existing=await c.query('SELECT * FROM products WHERE id=$1 AND shop_id=$2',[id,a.shop_id]);return existing.rows[0];}
      await c.query('INSERT INTO audit_log(id,shop_id,actor_id,action,record_id) VALUES($1,$2,$3,$4,$5)',[input.idempotencyKey,a.shop_id,a.id,action,id]);
      const changed=await c.query('UPDATE products SET quantity=quantity+CAST($1 AS INTEGER) WHERE id=$2 AND shop_id=$3 AND archived=FALSE AND quantity <= 1000000-CAST($1 AS INTEGER) RETURNING *',[input.quantity,id,a.shop_id]);
      if(!changed.rows[0])throw new HttpError(409,'Product unavailable or stock limit exceeded');return changed.rows[0];
    });
    let p;try{p=await run();}catch(e){if((e as any).code!=='23505')throw e;p=await run();}res.json(productDTO(p,true));
  }catch(e){next(e);}});
  app.get('/api/sales/:id/receipt',auth,async(req,res,next)=>{try{
    const id=z.string().uuid().parse(req.params.id);const a:Actor=res.locals.actor;
    const {rows}=await pool.query('SELECT * FROM sales WHERE id=$1 AND shop_id=$2',[id,a.shop_id]);const s=rows[0];if(!s||(a.role!=='owner'&&s.cashier_id!==a.id))throw new HttpError(404,'Receipt not found');
    const items=await pool.query('SELECT * FROM sale_items WHERE sale_id=$1',[id]);const shop=await pool.query('SELECT name,timezone FROM shops WHERE id=$1',[a.shop_id]);const cashier=await pool.query('SELECT name FROM users WHERE id=$1',[s.cashier_id]);
    res.json({shopName:shop.rows[0].name,timezone:shop.rows[0].timezone,cashierName:cashier.rows[0]?.name ?? '',...saleDTO(s,items.rows,false)});
  }catch(e){next(e);}});
  app.get('/api/sales',auth,async(_req,res,next)=>{try{const a:Actor=res.locals.actor;const {rows}=await pool.query(a.role==='owner'?'SELECT * FROM sales WHERE shop_id=$1 ORDER BY COALESCE(recorded_at,created_at) DESC LIMIT 200':'SELECT * FROM sales WHERE shop_id=$1 AND cashier_id=$2 ORDER BY COALESCE(recorded_at,created_at) DESC LIMIT 200',a.role==='owner'?[a.shop_id]:[a.shop_id,a.id]);const output=[];for(const s of rows){const items=await pool.query('SELECT * FROM sale_items WHERE sale_id=$1',[s.id]);output.push(saleDTO(s,items.rows,a.role==='owner'));}res.json(output);}catch(e){next(e);}});
  app.post('/api/sales',auth,async(req,res,next)=>{try{
    const input=saleInput.parse(req.body);const a:Actor=res.locals.actor;
    const lines=[...input.lines].sort((x,y)=>x.productId.localeCompare(y.productId));
    if(new Set(lines.map(l=>l.productId)).size!==lines.length)throw new HttpError(400,'Combine duplicate product lines');
    const fingerprint=hash(JSON.stringify({payment:input.payment,lines,...(input.recordedAt?{recordedAt:input.recordedAt}:{})}));
    const run=()=>transaction(pool,async c=>{
      const old=await c.query('SELECT * FROM sales WHERE shop_id=$1 AND idempotency_key=$2',[a.shop_id,input.idempotencyKey]);
      if(old.rows[0]){const s=old.rows[0];if(s.cashier_id!==a.id||s.request_hash!==fingerprint)throw new HttpError(409,'Idempotency key already used');return {sale:s,items:(await c.query('SELECT * FROM sale_items WHERE sale_id=$1',[s.id])).rows,replay:true};}
      // Reserve the unique key before acquiring stock locks. A concurrent retry
      // waits here; after rollback it reads the original committed sale.
      const id=randomUUID();
      await c.query('INSERT INTO sales(id,shop_id,cashier_id,idempotency_key,request_hash,total_minor,cost_minor,payment) VALUES($1,$2,$3,$4,$5,0,0,$6)',[id,a.shop_id,a.id,input.idempotencyKey,fingerprint,input.payment]);
      const items=[];let total=0;let cost=0;
      for(const line of lines){const {rows}=await c.query('SELECT * FROM products WHERE id=$1 AND shop_id=$2 AND archived=FALSE FOR UPDATE',[line.productId,a.shop_id]);const p=rows[0];if(!p)throw new HttpError(404,'Product not found');if(line.expectedPriceMinor!==undefined&&Number(p.price_minor)!==line.expectedPriceMinor)throw new HttpError(409,'Selling price changed. Review this offline sale with the owner.');if(p.quantity<line.quantity)throw new HttpError(409,'Insufficient stock');const changed=await c.query('UPDATE products SET quantity=quantity-CAST($1 AS INTEGER) WHERE id=$2 AND shop_id=$3 AND quantity >= CAST($1 AS INTEGER) RETURNING id',[line.quantity,line.productId,a.shop_id]);if(!changed.rows[0])throw new HttpError(409,'Insufficient stock');total+=Number(p.price_minor)*line.quantity;cost+=Number(p.cost_minor)*line.quantity;items.push({product_id:p.id,product_name:p.name,quantity:line.quantity,unit_price_minor:Number(p.price_minor),unit_cost_minor:Number(p.cost_minor)});}
      if(!Number.isSafeInteger(total)||!Number.isSafeInteger(cost))throw new HttpError(400,'Sale is too large');
      const {rows}=await c.query('UPDATE sales SET total_minor=$1,cost_minor=$2,recorded_at=$3 WHERE id=$4 RETURNING *',[total,cost,input.recordedAt??null,id]);
      for(const i of items)await c.query('INSERT INTO sale_items(id,sale_id,product_id,product_name,quantity,unit_price_minor,unit_cost_minor) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,i.product_id,i.product_name,i.quantity,i.unit_price_minor,i.unit_cost_minor]);
      await audit(c,a,'sale.recorded',id);return {sale:rows[0],items,replay:false};
    });
    // A simultaneous duplicate may lose the UNIQUE race. Retry after rollback,
    // then return the committed result without deducting stock again.
    let result;try{result=await run();}catch(e){if((e as any).code!=='23505')throw e;result=await run();}
    res.status(result.replay?200:201).json(saleDTO(result.sale,result.items,a.role==='owner'));
  }catch(e){next(e);}});
  if (process.env.WEB_ROOT) {
    const root=path.resolve(process.env.WEB_ROOT);
    app.use(express.static(root,{index:false,maxAge:0}));
    app.get(['/', '/online'],(_req,res)=>res.sendFile(path.join(root,'index.html')));
  }
  app.use((_req,res)=>res.status(404).json({error:'Not found'}));
  app.use((error:any,_req:Request,res:Response,_next:NextFunction)=>{
    if(error instanceof z.ZodError){res.status(400).json({error:'Invalid request',fields:error.issues.map(i=>i.path.join('.'))});return;}
    if(error instanceof HttpError){res.status(error.status).json({error:error.message});return;}
    if(error.code==='23505'){res.status(409).json({error:'Record already exists'});return;}
    if(error.type==='entity.parse.failed'||error.type==='entity.too.large'){res.status(400).json({error:'Invalid request body'});return;}
    console.error('Online backend request failed:',error.code ?? error.name);res.status(503).json({error:'Service temporarily unavailable'});
  });
  return app;
}




