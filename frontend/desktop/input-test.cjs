// Isolated native input check. Never opens an existing shop profile.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'stockwise-native-input-'));
app.setPath('userData', profile);
const reportFile = path.resolve(process.resourcesPath, '../input-test-result.json');
let stage = 'starting';
let done = false;
let testWindow;
async function report(error) {
  if (done) return;
  done = true;
  let profile;
  try {
    if (testWindow?.webContents.debugger.isAttached()) {
      const result = await Promise.race([testWindow.webContents.debugger.sendCommand('Profiler.stop'), new Promise(resolve => setTimeout(() => resolve(null), 1500))]);
      profile = result?.profile?.nodes?.map(n => ({ name: n.callFrame.functionName, url: n.callFrame.url, hits: n.hitCount })).sort((a,b) => (b.hits || 0) - (a.hits || 0)).slice(0, 15);
    }
  } catch {}
  fs.writeFileSync(reportFile, JSON.stringify({ ok: !error, stage, error: error?.message, profile, at: new Date().toISOString() }, null, 2));
  app.quit();
}
const timeout = setTimeout(() => report(new Error('Native input test timed out')), 25000);
app.on('browser-window-created', (_event, window) => {
  testWindow = window;
  window.webContents.once('did-finish-load', async () => {
    try {
      const origin = new URL(window.webContents.getURL()).origin;
      stage = 'opening plain input';
      await window.webContents.loadURL(origin + '/input-probe.html');
      window.webContents.debugger.attach('1.3');
      await window.webContents.debugger.sendCommand('Profiler.enable');
      await window.webContents.debugger.sendCommand('Profiler.start');
      stage = 'focusing plain input';
      await window.webContents.executeJavaScript(`document.querySelector('#probe').focus()`);
      stage = 'typing plain input';
      await window.webContents.insertText('Plain input works');
      const plain = await window.webContents.executeJavaScript(`document.querySelector('#probe').value`);
      if (plain !== 'Plain input works') throw new Error('Plain input failed');
      stage = 'opening registration';
      await window.webContents.loadURL(origin + '/register');
      stage = 'waiting for form';
      await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const deadline = Date.now() + 5000;
        const poll = () => {
          if (document.querySelector('#name')) return resolve(true);
          if (Date.now() > deadline) return reject(new Error('Registration form did not render'));
          setTimeout(poll, 50);
        }; poll();
      })`);
      stage = 'typing in full name';
      window.show(); window.focus(); window.webContents.focus();
      await window.webContents.executeJavaScript(`document.querySelector('#name').focus()`);
      await window.webContents.insertText('Native Input Test');
      const value = await window.webContents.executeJavaScript(`document.querySelector('#name').value`);
      if (value !== 'Native Input Test') throw new Error('Input field did not retain typed text');
      stage = 'typing in email';
      await window.webContents.executeJavaScript(`document.querySelector('#email').focus()`);
      await window.webContents.insertText('native@example.com');
      const email = await window.webContents.executeJavaScript(`document.querySelector('#email').value`);
      if (email !== 'native@example.com') throw new Error('Email did not retain typed text');
      stage = 'checking response after typing';
      await window.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 500))`);
      stage = 'passed'; clearTimeout(timeout); report();
    } catch (error) { clearTimeout(timeout); report(error); }
  });
});
require('./main.cjs');
