// Run against a disposable profile; never uses a shop owner's database.
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stockwise-desktop-test-'));
app.setPath('userData', profile);
process.argv.push('--smoke-test');
let finished = false;
const timeout = setTimeout(() => finish(new Error('Desktop test timed out')), 30000);
function finish(error) {
  if (finished) return;
  finished = true; clearTimeout(timeout);
  if (error) console.error(error.stack || error);
  else console.log('PASS: desktop loads, IPC saves a sale, reload locks the app, and saved stock is restored.');
  app.exit(error ? 1 : 0);
}
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    try {
      const result = await window.webContents.executeJavaScript(`(async () => {
        const api = window.stockwiseDesktop;
        if (!api) throw new Error('Desktop preload did not load');
        const call = (cmd, ...args) => { const r = api.request(cmd, args); if (!r.ok) throw new Error(r.error); return r; };
        call('register', {name:'Desktop Test',email:'desktop@example.com',phone:'08012345678',password:'DesktopPass123'});
        call('setupShop', {name:'Desktop Test Shop',address:'',currency:'NGN',timezone:'Africa/Lagos',receiptNote:''}, false);
        const p = call('addTestProduct').result;
        const sale = call('recordSale', {lines:[{productId:p.id,variantId:p.variants[0].id,quantity:2}],discount:0,payment:'Cash'}).result;
        if (sale.total !== 3000) throw new Error('Incorrect total');
        call('lock');
        return true;
      })()`);
      if (!result) throw new Error('Desktop command test failed');
      await window.webContents.loadURL(window.webContents.getURL().replace(/\/$/, '') + '/dashboard');
      await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const deadline = Date.now() + 10000;
        const poll = () => {
          if (document.body.textContent.includes('StockWise is locked')) {
            const r = window.stockwiseDesktop.request('snapshot', []);
            if (!r.ok || r.state.data.products[0].variants[0].quantity !== 8) return reject(new Error('Saved stock missing'));
            return resolve(true);
          }
          if (Date.now() > deadline) return reject(new Error('Dashboard did not render the lock screen: ' + document.body.textContent.slice(0,500)));
          setTimeout(poll, 100);
        };
        poll();
      })`);
      finish();
    } catch (error) { finish(error); }
  });
});
require('./main.cjs');
