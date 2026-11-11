"""Package and verify StoryWeave v1.9.14 source, Web, and editor patch."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from hashlib import sha256
ROOT=Path(__file__).parent
OUT=ROOT.parent
VERSION='1.9.14'
outputs=[]
def bundle(label,source,paths=None):
    target=OUT/f'StoryWeave-{label}-v{VERSION}.zip'
    items=sorted((p for p in source.rglob('*') if p.is_file() and not any(x.startswith('.') or x=='__pycache__' for x in p.relative_to(source).parts))) if paths is None else [ROOT/x for x in paths]
    with ZipFile(target,'w',ZIP_DEFLATED,compresslevel=6) as archive:
        for p in items:
            assert p.is_file(),str(p)
            archive.write(p,p.relative_to(source).as_posix())
    with ZipFile(target) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist())==len(items)
        for p in items:
            data=archive.read(p.relative_to(source).as_posix())
            assert sha256(data).digest()==sha256(p.read_bytes()).digest()
    outputs.append(target)
    print(target.name,target.stat().st_size,len(items))

bundle('Source',ROOT)
bundle('Web',ROOT/'web')
changed_web=['index.html','manifest.webmanifest','offline-assets.js','sw.js','v14.js','v17.js','ui-manuscript.css','ui-manuscript.js']
patch=['web/'+p for p in changed_web]+['android/app/src/main/assets/'+p for p in changed_web]+[
    'android/app/src/main/java/com/storyweave/studio/MainActivity.java',
    'android/app/build.gradle','README.md','CHANGELOG.md','TEST-LIMITATIONS.md',
    'docs/EDITOR-REDESIGN-v1.9.14.md','test_quiet_manuscript.py'
]
bundle('Editor-UI-Patch',ROOT,patch)
checks=OUT/f'StoryWeave-v{VERSION}-SHA256.txt'
checks.write_text(''.join(f'{sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in outputs),encoding='utf8')
print(checks.name)
