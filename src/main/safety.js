// Safety checks the main process shares:
//  - which files the Open buttons may open (documents, never programs),
//  - whether a path really sits inside a folder (after following links),
//  - which environment variables an AI app is started with,
//  - ids that end up in file names.
// Everything a plan, a project file or a synced setting says is treated as
// untrusted: these checks run when the app uses a path, not only when it's saved.
const fs = require('fs');
const path = require('path');

// Documents the Open buttons open with the program Windows picks for them.
// Anything else (programs, scripts, shortcuts, web pages, macro-enabled Office
// files…) is never opened; "Show in folder" still works for it.
const SAFE_TYPES = new Set([
  'md',
  'markdown',
  'txt',
  'log',
  'csv',
  'tsv',
  'json',
  'yaml',
  'yml',
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'heic',
  'mp3',
  'wav',
  'm4a',
  'mp4',
  'mov',
  'webm',
  'docx',
  'xlsx',
  'pptx',
  'odt',
  'ods',
  'odp',
]);

// Network paths (\\server\share) would make Windows sign in to that server, and
// \\?\ paths skip Windows' own name checks: the app opens neither.
const isNetwork = (p) => /^(\\\\|\/\/)/.test(String(p || ''));

// Odd names Windows treats specially: control characters, and "file.txt:more"
// (a hidden stream inside a file; the only colon allowed is the drive's).
function oddName(p) {
  const s = String(p || '');
  return /[\x00-\x1f]/.test(s) || s.replace(/^[a-zA-Z]:/, '').includes(':');
}

// The file's type, the way Windows sees it (it drops trailing dots and spaces: "a.exe. " is "a.exe").
const typeOf = (p) =>
  path
    .extname(path.basename(String(p || '')).replace(/[. ]+$/, ''))
    .slice(1)
    .toLowerCase();

// May an Open button open this file?
const openable = (p) => !!p && !isNetwork(p) && !oddName(p) && SAFE_TYPES.has(typeOf(p));

// The real location of a path, with links followed. For a path that doesn't
// exist yet, its nearest existing folder is followed and the rest added back.
function real(p) {
  let cur = path.resolve(String(p));
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(cur), ...rest);
    } catch {
      const up = path.dirname(cur);
      if (up === cur) return path.resolve(String(p));
      rest.unshift(path.basename(cur));
      cur = up;
    }
  }
}

// Is file inside folder (not the folder itself), once links are followed?
function within(file, folder) {
  if (!file || !folder || isNetwork(file) || isNetwork(folder)) return false;
  const rel = path.relative(real(folder), real(file));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// Ids used in file names (task, project and session ids): letters, digits, _ and -.
const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const safeId = (id) => typeof id === 'string' && SAFE_ID.test(id);

// ---------- what an AI app gets from the environment ----------
// AI apps start with only what Windows and the apps need to run, not every
// variable on this computer: API keys, tokens and cloud logins set for other
// tools stay out. A variable an app really needs can be added per computer with
// "passEnv": ["NAME", ...] in data\machine.json.
const ENV_KEEP = new Set(
  [
    'ALLUSERSPROFILE',
    'APPDATA',
    'COMMONPROGRAMFILES',
    'COMMONPROGRAMFILES(X86)',
    'COMMONPROGRAMW6432',
    'COMPUTERNAME',
    'COMSPEC',
    'DRIVERDATA',
    'HOME',
    'HOMEDRIVE',
    'HOMEPATH',
    'LOCALAPPDATA',
    'LOGONSERVER',
    'NUMBER_OF_PROCESSORS',
    'ONEDRIVE',
    'ONEDRIVECOMMERCIAL',
    'ONEDRIVECONSUMER',
    'OS',
    'PATH',
    'PATHEXT',
    'PROCESSOR_ARCHITECTURE',
    'PROCESSOR_IDENTIFIER',
    'PROCESSOR_LEVEL',
    'PROCESSOR_REVISION',
    'PROGRAMDATA',
    'PROGRAMFILES',
    'PROGRAMFILES(X86)',
    'PROGRAMW6432',
    'PSMODULEPATH',
    'PUBLIC',
    'SESSIONNAME',
    'SYSTEMDRIVE',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'USERDOMAIN',
    'USERDOMAIN_ROAMINGPROFILE',
    'USERNAME',
    'USERPROFILE',
    'WINDIR',
    'NODEFAULTCURRENTDIRECTORYINEXEPATH',
    // Language and time zone
    'LANG',
    'LANGUAGE',
    'TZ',
    // A company network's proxy and certificates (the apps can't reach their service without them)
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'ALL_PROXY',
    'NODE_EXTRA_CA_CERTS',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    // Where each AI app keeps its own settings and sign-in
    'CLAUDE_CONFIG_DIR',
    // Claude Code's default model (a setting, not a secret; the nightly check sets it)
    'ANTHROPIC_MODEL',
    'CLAUDE_CODE_GIT_BASH_PATH',
    'CODEX_HOME',
    'GEMINI_CLI_HOME',
    'GOOGLE_CLOUD_PROJECT',
  ].map((k) => k.toUpperCase())
);

// env: the variables to pick from (process.env); extra: what the app adds on purpose.
function aiEnv(env, extra = {}, passEnv = []) {
  const keep = new Set([...ENV_KEEP, ...(Array.isArray(passEnv) ? passEnv : []).map((k) => String(k).toUpperCase())]);
  const out = {};
  for (const [k, v] of Object.entries(env || {})) {
    const K = k.toUpperCase();
    if (keep.has(K) || K.startsWith('LC_')) out[k] = v;
  }
  return { ...out, ...extra };
}

module.exports = { SAFE_TYPES, openable, typeOf, isNetwork, oddName, real, within, safeId, aiEnv, ENV_KEEP };
