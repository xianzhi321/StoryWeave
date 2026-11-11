"""Build and verify StoryWeave v1.9.11 source/web/patch archives."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile, ZIP_DEFLATED
import os
ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent
VERSION='1.9.11'
files=[]

def bundle(label, source, include=None):
    dest=OUT/f'StoryWeave-{label}-v{VERSION}.zip'
    if include is None:
        items=[p for p in source.rglob('*') if p.is_file() and not any(t.startswith('.') for t in p.relative_to(source).parts)]
        # Prevent the release script from bundling any workspace-local output archives.
        items=[p for p in items if p!=dest]
    else:
        items=[ROOT/str(path) for path in include]
    items=sorted(items)
    with ZipFile(dest,'w',ZIP_DEFLATED,compresslevel=6) as archive:
        for path in items:
            assert path.exists(), path
            archive.write(path,path.relative_to(source).as_posix())
    with ZipFile(dest) as archive:
        expected={p.relative_to(source).as_posix() for p in items}
        assert set(archive.namelist())==expected
        for path in items:
            assert sha256(archive.read(path.relative_to(source).as_posix())).digest()==sha256(path.read_bytes()).digest()
    print(dest.name,'files:',len(items),'bytes:',dest.stat().st_size)
    files.append(dest)

patch=['web/index.html','web/app.js','web/sw.js','web/manifest.webmanifest','web/offline-assets.js',
       'web/ui-fluid.css','web/ui-fluid.js',
       'android/app/build.gradle','README.md','CHANGELOG.md','TEST-LIMITATIONS.md',
       'docs/FLUID-UI-v1.9.11.md','test_fluid_ui.py']
patch+=['android/app/src/main/assets/'+p.replace('web/','') for p in patch if p.startswith('web/')]
bundle('Source',ROOT)
bundle('Web',ROOT/'web')
bundle('UI-Patch',ROOT,patch)
checksum=OUT/f'StoryWeave-v{VERSION}-SHA256.txt'
checksum.write_text(''.join(sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in files),encoding='utf-8')
print('Checksums:',checksum)
