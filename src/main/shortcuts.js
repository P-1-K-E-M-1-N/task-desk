// The Windows shortcuts: desktop, Startup (start with Windows) and Start menu.
// They carry the app id and icon, so pins and the taskbar show Task Desk, not
// plain Electron. Tests never touch this computer's shortcuts.
const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const desk = require('./desk');

const LINK_NAME = 'Task Desk.lnk';

// Shortcuts this app made under another name (older versions): same program and folder.
function oldLinks(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => /\.lnk$/i.test(n) && n !== LINK_NAME);
  } catch {
    return [];
  }
  return names
    .map((n) => path.join(dir, n))
    .filter((f) => {
      try {
        const l = shell.readShortcutLink(f);
        // Ours by its arguments, or a bare "Electron" shortcut carrying our id (Windows
        // would show its plain Electron icon on the taskbar instead of ours).
        return l.target === process.execPath && ((l.args || '').includes(config.APP_ROOT) || l.appUserModelId === desk.APP_ID);
      } catch {
        return false;
      }
    });
}

function startupLink() {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', LINK_NAME);
}
// In the Start menu, so Task Desk can be found by searching and pinned from there.
function startMenuLink() {
  return path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', LINK_NAME);
}
function desktopLink() {
  return path.join(app.getPath('desktop'), LINK_NAME);
}
function writeLink(file, hidden) {
  return shell.writeShortcutLink(file, 'create', {
    target: process.execPath,
    args: `"${config.APP_ROOT}"${hidden ? ' --hidden' : ''}`,
    cwd: config.APP_ROOT,
    icon: desk.ICON_ICO,
    iconIndex: 0,
    description: 'Task Desk',
    appUserModelId: desk.APP_ID,
  });
}
function setAutostart(on) {
  if (on) writeLink(startupLink(), true);
  else
    try {
      fs.unlinkSync(startupLink());
    } catch {}
  config.set({ autostart: on });
}
const autostartOn = () => fs.existsSync(startupLink());

function ensureShortcuts() {
  // Tests leave this computer's shortcuts alone, including the first-start ones.
  if (desk.TESTING) return;
  // The Start menu entry is checked every start. When the app id or icon changes,
  // the existing shortcuts are rewritten so pins and the taskbar pick it up.
  const LINKS = `${desk.APP_ID}/${LINK_NAME}`;
  const stale = config.get().linksFor !== LINKS;
  if (stale || !fs.existsSync(startMenuLink()))
    try {
      writeLink(startMenuLink(), false);
    } catch {}
  // Stray shortcuts with our id (see oldLinks) are removed every start.
  for (const f of oldLinks(path.dirname(startMenuLink())))
    try {
      fs.unlinkSync(f);
    } catch {}
  if (stale) {
    // Rename older shortcuts, and rewrite the current ones for the new id and icon.
    for (const [link, hidden] of [
      [desktopLink(), false],
      [startupLink(), true],
      [startMenuLink(), false],
    ]) {
      const old = oldLinks(path.dirname(link));
      for (const f of old)
        try {
          fs.unlinkSync(f);
        } catch {}
      if (old.length || fs.existsSync(link))
        try {
          writeLink(link, hidden);
        } catch {}
    }
    config.set({ linksFor: LINKS });
  }
  if (config.get().shortcutsDone) return;
  try {
    writeLink(desktopLink(), false);
  } catch {}
  try {
    setAutostart(true);
  } catch {}
  config.set({ shortcutsDone: true });
}

module.exports = { setAutostart, autostartOn, ensureShortcuts };
