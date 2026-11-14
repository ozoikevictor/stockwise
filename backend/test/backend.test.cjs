const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openBackend } = require('../dist/backend.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stockwise-test-'));
  const filename = path.join(directory, 'shop.sqlite');
  let backend = openBackend(filename);
  t.after(() => { backend.close(); for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name)); fs.rmdirSync(directory); });
  function call(command, ...args) { const reply = backend.request(command, args); assert.equal(reply.ok, true, reply.error); return reply; }
  call('register', { name: 'Test Owner', email: 'owner@example.com', phone: '08012345678', password: 'OwnerPass123' });
  call('setupShop', { name: 'Test Shop', address: '', currency: 'NGN', timezone: 'Africa/Lagos', receiptNote: 'Thank you' }, false);
  return { call, raw: (...args) => backend.request(...args), filename, directory, reopen() { backend.close(); backend = openBackend(filename); }, backup: (dest) => backend.backup(dest), receipt: (id) => backend.receipt(id) };
}

test('SQLite preserves sale, stock and password-protected session after restart', (t) => {
  const f = fixture(t);
  const product = f.call('addTestProduct').result;
  const sale = f.call('recordSale', { lines: [{ productId: product.id, variantId: product.variants[0].id, quantity: 2 }], discount: 0, payment: 'Cash' }).result;
  assert.equal(sale.total, 3000); assert.equal(sale.cogs, 2000);
  f.reopen();
  const state = f.call('snapshot').state;
  assert.equal(state.locked, true);
  assert.equal(state.data.products.length, 0);
  assert.equal(state.data.sales.length, 0);
  assert.equal(state.auth.users[0].passwordHash, undefined);
  assert.equal(f.raw('addTestProduct').ok, false);
  f.reopen();
  assert.equal(f.call('snapshot').state.locked, true);
  f.call('unlock', 'owner', 'OwnerPass123');
  assert.match(f.receipt(sale.id), /NGN 3,000/);
  const db = new DatabaseSync(f.filename);
  const savedAuth = db.prepare('SELECT value FROM records WHERE key = ?').get('stockwise:auth:v1').value;
  assert.match(savedAuth, /scrypt\$/); assert.doesNotMatch(savedAuth, /OwnerPass123/); db.close();
});

test('overselling rolls back and refunds cannot add stock twice', (t) => {
  const f = fixture(t);
  const p = f.call('addTestProduct').result;
  const input = { lines: [{ productId: p.id, variantId: p.variants[0].id, quantity: 11 }], discount: 0, payment: 'Cash' };
  assert.equal(f.raw('recordSale', [input]).ok, false);
  assert.equal(f.call('snapshot').state.data.products[0].variants[0].quantity, 10);
  assert.equal(f.call('snapshot').state.data.sales.length, 0);
  input.lines[0].quantity = 2;
  const sale = f.call('recordSale', input).result;
  f.call('refundSale', sale.id, true, 'Test return');
  assert.equal(f.raw('refundSale', [sale.id, true, 'Again']).ok, false);
  f.reopen(); f.call('unlock', 'owner', 'OwnerPass123');
  assert.equal(f.call('snapshot').state.data.products[0].variants[0].quantity, 10);
  assert.equal(f.call('snapshot').state.data.sales[0].status, 'refunded');
});

test('backend enforces cashier permissions even when commands bypass the screen', (t) => {
  const f = fixture(t);
  f.call('addStaff', { name: 'Cashier', username: 'cashier', role: 'cashier', password: 'CashierPass123' });
  const staff = f.call('snapshot').state.data.staff[0];
  f.call('lock'); f.call('unlock', staff.id, 'CashierPass123');
  for (const [command, args] of [['addCategory', ['Forbidden']], ['setupShop', [{ name: 'Bad', address: '', currency: 'NGN', timezone: 'UTC', receiptNote: '' }, false]], ['clearData', []], ['exportJSON', []], ['addTestProduct', []]]) {
    assert.equal(f.raw(command, args).ok, false, command);
  }
  assert.throws(() => f.backup(path.join(f.directory, 'forbidden.sqlite')));
  assert.equal(f.call('snapshot').state.data.shop.name, 'Test Shop');
});

test('database backup reopens with the saved products and secure accounts', (t) => {
  const f = fixture(t); f.call('addTestProduct');
  const dest = path.join(f.directory, 'backup.sqlite'); f.backup(dest);
  const restored = openBackend(dest);
  try {
    assert.equal(restored.request('unlock', ['owner', 'OwnerPass123']).ok, true);
    assert.equal(restored.request('snapshot').state.data.products[0].variants[0].quantity, 10);
  } finally { restored.close(); }
});

test('invalid input and unknown commands do not change saved data', (t) => {
  const f = fixture(t);
  assert.equal(f.raw('__proto__', []).ok, false);
  assert.equal(f.raw('addExpense', [{ date: '2026-11-09', category: 'Rent', amount: Infinity, note: '' }]).ok, false);
  assert.equal(f.raw('importJSON', ['{"app":"Other","version":2}']).ok, false);
  assert.equal(f.call('snapshot').state.data.expenses.length, 0);
});

test('staff payloads and results omit financial fields and isolate two cashiers', (t) => {
  const f = fixture(t);
  const p = f.call('addTestProduct').result;
  const a = f.call('addStaff', {name:'Cashier A',username:'a',role:'cashier',password:'CashierPass123'}).state.data.staff.find(s=>s.username==='a');
  const b = f.call('addStaff', {name:'Cashier B',username:'b',role:'cashier',password:'CashierPass123'}).state.data.staff.find(s=>s.username==='b');
  const input = {lines:[{productId:p.id,variantId:p.variants[0].id,quantity:1}],discount:0,payment:'Cash'};
  f.call('lock'); f.call('unlock',a.id,'CashierPass123');
  const replyA = f.call('recordSale',input);
  const check = reply => {
    const text = JSON.stringify(reply);
    for(const key of ['costPrice','unitCost','cogs','supplier','passwordHash']) assert.equal(text.includes('"'+key+'":'),false,key);
    assert.equal(reply.state.data.expenses.length,0);
    assert.equal(reply.state.data.audit.length,0);
    assert.equal(reply.state.data.adjustments.length,0);
  };
  check(replyA);
  assert.equal(replyA.result.total,1500);
  assert.equal(replyA.state.data.sales.length,1);
  f.call('lock'); f.call('unlock',b.id,'CashierPass123');
  assert.equal(f.call('snapshot').state.data.sales.length,0);
  assert.throws(()=>f.receipt(replyA.result.id));
  const replyB = f.call('recordSale',input); check(replyB);
  assert.equal(replyB.state.data.sales.length,1);
  assert.equal(replyB.state.data.sales[0].cashierId,b.id);
  for(const command of ['loadSampleData','exportJSON','addTestProduct']) assert.equal(f.raw(command,[]).ok,false);
  f.call('lock');
  const locked=f.call('snapshot'); check(locked);
  assert.equal(locked.state.data.products.length,0);
  assert.equal(locked.state.data.sales.length,0);
  f.call('unlock','owner','OwnerPass123');
  const owner=f.call('snapshot').state;
  assert.equal(owner.data.sales.length,2);
  assert.equal(owner.data.products[0].variants[0].quantity,8);
  assert.equal(owner.data.sales.reduce((sum,s)=>sum+s.cogs,0),2000);
  assert.equal(owner.data.products[0].variants[0].costPrice,1000);
});
