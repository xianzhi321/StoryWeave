"""Build and check StoryWeave 1.9.13 release archives."""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile, ZIP_DEFLATED

ROOT=Path(__file__).parent
OUT=ROOT.parent
VERSION='1.9.13'
outputs=[]
def bundle(label, source, rel_paths=None):
    target=OUT/f'StoryWeave-{label}-v{VERSION}.zip'
    if rel_paths is None:
        srcs=sorted(p for p in source.rglob('*') if p.is_file() and not any(seg.startswith('.') for seg in p.relative_to(source).parts) and '__pycache__' not in p.parts)
    else:
        srcs=sorted(ROOT / r for r in rel_paths)
    with ZipFile(target,'w',ZIP_DEFLATED,compresslevel=6) as z:
        for p in srcs:
            assert p.exists(),p
            z.write(p,p.relative_to(source).as_posix())
    with ZipFile(target) as z:
        assert z.testzip() is None
        assert set(z.namelist())=={p.relative_to(source).as_posix() for p in srcs}
        for p in srcs:
            member=z.read(p.relative_to(source).as_posix())
            assert sha256(member).digest()==sha256(p.read_bytes()).digest()
    outputs.append(target)
    print(target,target.stat().st_size,len(srcs))

bundle('Source',ROOT)
bundle('Web',ROOT/'web')
changed_web=['web/app.js','web/v14.js','web/ui-performance.css','web/offline-assets.js','web/sw.js','web/index.html','web/manifest.webmanifest']
patch=[*changed_web,*[f'android/app/src/main/assets/{p[4:]}' for p in changed_web],
       'android/app/build.gradle','README.md','CHANGELOG.md','TEST-LIMITATIONS.md',
       'docs/GITHUB-WRITING-REFERENCES-v1.9.13.md','test_performance_core.cjs','test_performance_ui.py']
bundle('Performance-Patch',ROOT,patch)
checks=OUT/f'StoryWeave-v{VERSION}-SHA256.txt'
checks.write_text(''.join(sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in outputs))
print(checks)
