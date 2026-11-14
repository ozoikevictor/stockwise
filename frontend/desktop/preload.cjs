const { contextBridge, ipcRenderer } = require("electron");

// Expose one constrained command API, never Node, database paths, or raw IPC.
// Commands stay synchronous to preserve the existing form/receipt action contract.
// Each command is bounded, validated, and committed locally before returning.
contextBridge.exposeInMainWorld("stockwiseDesktop", {
  request: (command, args) => ipcRenderer.sendSync("stockwise:request", command, args),
  offlineData: (value) => ipcRenderer.invoke("stockwise:offline-data", value),
  onlineConfig: (value) => ipcRenderer.invoke("stockwise:online-config", value),
  printReceipt: (saleId) => ipcRenderer.invoke("stockwise:print", saleId),
});

// Record input delivery and element flags only. Never capture typed text or keys.
window.addEventListener("DOMContentLoaded", () => {
  const counts = { pointer: 0, keyboard: 0, input: 0 };
  const report = () => {
    const element = document.activeElement;
    ipcRenderer.send("stockwise:input-status", {
      path: location.pathname,
      hasFocus: document.hasFocus(),
      bridgeAvailable: true,
      activeTag: element?.tagName,
      activeId: element?.id,
      bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
      modalCount: document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length,
      fields: [...document.querySelectorAll("input")].map((field) => ({
        id: field.id, disabled: field.disabled, readOnly: field.readOnly,
        pointerEvents: getComputedStyle(field).pointerEvents,
        inert: !!field.closest("[inert]"),
      })),
      ...counts,
    });
  };
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; report(); }, 250);
  };
  document.addEventListener("pointerdown", () => { counts.pointer++; schedule(); }, true);
  document.addEventListener("keydown", () => { counts.keyboard++; schedule(); }, true);
  document.addEventListener("input", () => { counts.input++; schedule(); }, true);
  window.addEventListener("focus", schedule);
  setTimeout(report, 1500);
});
