/**
 * Local-only storage bridge for a deployed (HTTPS) Next.js/Vercel application.
 * A browser can never silently access an arbitrary Windows/OneDrive directory.
 * File System Access API requires an explicit user-selected folder and permission.
 */
const SETTINGS_DB = 'kimbal-drive-settings';
const HANDLE_STORE = 'configuration';
const HANDLE_KEY = 'selected-folder';

export function folderPickerAvailable(api = globalThis) {
  return typeof api.showDirectoryPicker === 'function';
}

function settingsDb() {
  if (typeof indexedDB === 'undefined') throw new Error('Browser database is unavailable.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SETTINGS_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE))
        request.result.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error('Could not open local settings database.'));
  });
}
async function folderSetting(mode, value) {
  const database = await settingsDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(HANDLE_STORE, mode === 'read' ? 'readonly' : 'readwrite');
    const store = tx.objectStore(HANDLE_STORE);
    const req = mode === 'read' ? store.get(HANDLE_KEY) : mode === 'delete' ? store.delete(HANDLE_KEY) : store.put(value, HANDLE_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || Error('Unable to store the folder selection.'));
    tx.oncomplete = () => database.close();
    tx.onabort = () => { database.close(); reject(tx.error || Error('Folder selection transaction aborted.')); };
  });
}

export async function selectLocalFolder(api = globalThis) {
  if (!folderPickerAvailable(api)) throw Error('Use the latest Chrome or Microsoft Edge on HTTPS or localhost to select a local folder.');
  // IMPORTANT: call synchronously from an actual button click: user activation is required.
  const directory = await api.showDirectoryPicker({ id: 'kimbal-report-backups', mode: 'readwrite', startIn: 'documents' });
  await folderSetting('write', directory);
  return directory.name;
}
export const selectedLocalFolder = () => folderSetting('read');
export async function forgetLocalFolder() { await folderSetting('delete'); }

export async function folderAccess(directory, ask = false) {
  if (!directory) return 'not-selected';
  if (typeof directory.queryPermission !== 'function') return 'not-supported';
  const query = {mode:'readwrite'};
  const current = await directory.queryPermission(query);
  if (current === 'granted') return current;
  if (ask && typeof directory.requestPermission === 'function') return await directory.requestPermission(query);
  return current;
}
export async function localFolderStatus() {
  const handle = await selectedLocalFolder();
  return {name: handle?.name || '', permission: await folderAccess(handle, false)};
}
export function backupFileName(item) {
  const date = new Date(item.createdAt || Date.now()).toISOString().replace(/[.:]/g,'-');
  const id = String(item.id || 'report').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,36);
  return `Kimbal_Report_${date}_${id}.json.gz`;
}
export function buildBackup(item, manual = {}, highlights = {}) {
  if (!item || !Array.isArray(item.rows)) throw Error('No valid report to back up.');
  return {format:'kimbal-report-backup',version:1,createdAt:Date.now(),
    snapshot:{...item,rows:item.rows},manualCounts:manual,highlightedRemarks:highlights};
}
export function validateBackup(obj) {
  if (!obj || obj.format !== 'kimbal-report-backup' || obj.version !== 1 || !obj.snapshot || !Array.isArray(obj.snapshot.rows))
    throw Error('Not a valid Kimbal dashboard backup file.');
  if (obj.snapshot.rows.length > 1000000) throw Error('Backup exceeds maximum supported row count.');
  if (!obj.snapshot.rows.every(row => row && typeof row === 'object' && typeof row.meter === 'string'))
    throw Error('Backup has invalid meter rows.');
  return obj;
}
async function writeToFolder(filename, blob, directory) {
  const output = await directory.getFileHandle(filename, {create:true});
  const writer = await output.createWritable();
  try { await writer.write(blob); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch {} throw error; }
}
export async function saveBackupToLocalFolder(item, manual={}, highlights={}, {requestPermission=false}={}) {
  const dir = await selectedLocalFolder();
  if (!dir) return {saved:false,reason:'not-selected'};
  const permission = await folderAccess(dir, requestPermission);
  if (permission !== 'granted') return {saved:false,reason:'permission-'+permission};
  const content = JSON.stringify(buildBackup(item,manual,highlights));
  const json = new Blob([content], {type:'application/json'});
  // Supported in modern Chrome and Edge. Vercel only serves the app; raw files stay local.
  const gzip = typeof CompressionStream !== 'undefined';
  const file = gzip ? await new Response(json.stream().pipeThrough(new CompressionStream('gzip'))).blob() : json;
  const fileName = gzip ? backupFileName(item) : backupFileName(item).replace(/\.gz$/, '');
  await writeToFolder(fileName, file, dir);
  return {saved:true,fileName,folderName:dir.name,bytes:file.size};
}
export async function saveRemarksSettingsToLocalFolder(manual={},highlights={}, {requestPermission=false}={}) {
  const dir = await selectedLocalFolder();
  if (!dir) return {saved:false,reason:'not-selected'};
  const permission = await folderAccess(dir, requestPermission);
  if(permission !== 'granted')return {saved:false,reason:'permission-'+permission};
  const data = {format:'kimbal-remarks-settings',version:1,updatedAt:Date.now(),manualCounts:manual,highlightedRemarks:highlights};
  await writeToFolder('Kimbal_Remarks_Settings.json',new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),dir);
  return {saved:true,folderName:dir.name};
}
export async function readBackupFile(file) {
  if (!file) throw Error('Choose a Kimbal backup file.');
  let text;
  if (/\.gz$/i.test(file.name)) {
    if(typeof DecompressionStream === 'undefined')throw Error('This browser cannot open compressed backups. Use current Chrome/Edge.');
    text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } else if (/\.json$/i.test(file.name)) {text = await file.text();}
  else throw Error('Choose a .json or .json.gz backup file.');
  let parsed;
  try {parsed = JSON.parse(text);}catch {throw Error('Backup JSON cannot be read.');}
  return validateBackup(parsed);
}
