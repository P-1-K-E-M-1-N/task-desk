const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (cb) => {
  const h = (_e, ...a) => cb(...a);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.removeListener(ch, h);
};

contextBridge.exposeInMainWorld('desk', {
  listTasks: call('tasks:list'),
  getTask: call('task:get'),
  openTask: call('task:open'),
  tick: call('task:tick'),
  paste: call('task:paste'),
  notes: call('task:notes'),
  replan: call('task:replan'),
  snooze: call('task:snooze'),
  finish: call('task:finish'),
  openUrl: call('act:url'),
  copy: call('act:copy'),
  gmail: call('act:gmail'),
  openFile: call('act:file'),
  openFolder: call('act:folder'),
  exists: call('act:exists'),
  emails: call('act:emails'),
  writeEnv: call('act:env'),
  chatStart: call('chat:start'),
  chatWrite: call('chat:write'),
  chatSend: call('chat:send'),
  chatResize: call('chat:resize'),
  chatStop: call('chat:stop'),
  close: call('win:close'),
  minimize: call('win:min'),
  maximize: call('win:max'),
  hide: call('win:hide'),
  collapse: call('win:collapse'),
  menu: call('app:menu'),
  trayBadge: call('tray:badge'),
  saveSync: (...a) => ipcRenderer.sendSync('task:saveSync', ...a),
  lookNow: () => ipcRenderer.sendSync('look:get'),
  setLook: call('look:set'),
  onLook: on('look'),
  onTaskChanged: on('task:changed'),
  onLookOpen: on('look:open'),
  onTasks: on('tasks'),
  onPlan: on('plan'),
  onChatData: on('chat:data'),
  onChatExit: on('chat:exit'),
  onChatInfo: on('chat:info'),
  onChatReset: on('chat:reset'),
});
