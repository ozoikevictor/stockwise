const {test}=require('node:test');
const assert=require('node:assert/strict');
const {onlineTarget}=require('./online-target.cjs');
test('accepts hosted HTTPS and loopback development addresses',()=>{
  assert.equal(onlineTarget('https://shop.example/'),'https://shop.example');
  assert.equal(onlineTarget(),'http://127.0.0.1:3003');
});
test('rejects insecure remote targets, credentials, paths and non-HTTP schemes',()=>{
  for(const value of ['http://shop.example','https://user:secret@shop.example','https://shop.example/api','https://shop.example?x=1','file:///etc/passwd','https://shop.example/#x'])assert.throws(()=>onlineTarget(value));
});
