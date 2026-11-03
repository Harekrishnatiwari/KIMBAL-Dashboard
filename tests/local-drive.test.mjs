import test from 'node:test';
import assert from 'node:assert/strict';
import {folderPickerAvailable,backupFileName,buildBackup,validateBackup,readBackupFile} from '../lib/local-drive.mjs';

test('folder picker only supported where browser offers it',()=>{
  assert.equal(folderPickerAvailable({}),false);
  assert.equal(folderPickerAvailable({showDirectoryPicker(){}}),true);
});
test('local filename is safe and unique per snapshot',()=>{
 const f=backupFileName({createdAt:Date.UTC(2026,9,30,8,30),id:'a:/\\danger'});
 assert.match(f,/^Kimbal_Report_2026-10-30T08-30-00-000Z_a/);
 assert.equal(f.endsWith('.json.gz'),true);
 assert.equal(f.includes('/'),false);
});
test('backup includes meter data and remarks/highlights',()=>{
 const snap={id:'one',name:'demo',rows:[{meter:'SI1000',status:'Non Comm',remark:'Defective'}]};
 const b=buildBackup(snap,{'RF|Non Comm|Defective':11},{Defective:true});
 assert.equal(validateBackup(b).snapshot.rows[0].meter,'SI1000');
 assert.equal(b.manualCounts['RF|Non Comm|Defective'],11);
 assert.equal(b.highlightedRemarks.Defective,true);
});
test('rejects invalid and oversized report backups',()=>{
 assert.throws(()=>validateBackup({foo:'bar'}));
 assert.throws(()=>validateBackup({format:'kimbal-report-backup',version:1,snapshot:{rows:[{meter:33}]}}));
});
test('restores compressed JSON backup from browser file',async()=>{
 const b=buildBackup({id:'one',rows:[{meter:'SI1002',status:'Never Comm',remark:'Broken'}]}, {},{});
 const compressed=await new Response(new Blob([JSON.stringify(b)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
 const f=new File([compressed],'Kimbal_Report_test.json.gz');
 const parsed=await readBackupFile(f);
 assert.equal(parsed.snapshot.rows.length,1);
 assert.equal(parsed.snapshot.rows[0].meter,'SI1002');
});
test('supports uncompressed JSON restore',async()=>{
 const b=buildBackup({id:'two',rows:[]});
 const f=new File([JSON.stringify(b)],'Kimbal_Report_test.json');
 assert.equal((await readBackupFile(f)).format,'kimbal-report-backup');
 await assert.rejects(()=>readBackupFile(new File(['abc'],'report.csv')),/Choose a/);
});
