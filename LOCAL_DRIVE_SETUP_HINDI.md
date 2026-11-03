# Local OneDrive Storage — Windows Setup

1. Windows File Explorer mein **OneDrive - Sinhal Udyog pvt ltd** open karein.
2. Ek folder banayein: **Kimbal_Reports** (ya jo folder aap approve kar sakte hain).
3. Vercel par deployed dashboard ko **Microsoft Edge / Google Chrome** mein open karein.
4. Sidebar mein **Local Drive Storage** → **Choose Storage Folder** click karein.
5. File picker mein upar wala OneDrive folder select karein aur browser ko access allow karein.
6. Report Upload & Generate se report banate hi **browser history + local folder backup** save hone ki koshish hogi. Screen ka status check karein: permission error aane par **Reconnect / Allow Access** karein.
7. Backup file ka naam **Kimbal_Report_....json.gz** hoga. Isse **Restore a Saved Report** option se dobara dashboard mein load kar sakte hain.
8. Manual Remarks Count aur Highlight ke changes **Kimbal_Remarks_Settings.json** mein bhi save honge (jab folder permission granted hai).

**Zaroori:** Vercel khud aapke `C:\Users\...` folder mein direct write nahi kar sakta. Har browser/device par folder aapko select karna hai. Agar dusra user website kholega, to wo aapke local data ya OneDrive folder ko automatically nahi dekh payega.

**Purana Streamlit data:** `data/snapshots` aur `*.sqlite3` files is Next.js edition mein directly import nahi hote. Purani Communication Report ko CSV/XLSX se reload karein; complete history migration alag task hai.

**Sensitive data:** Consumer/Meter export files ko public GitHub par upload na karein. OneDrive folder sharing organization ke data access rules ke mutabik rakhein.
