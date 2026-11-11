"""Package verified release files without changing previous releases."""
import hashlib
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent
output = root.parent / 'StoryWeave等2项文件'
output.mkdir(exist_ok=True)
checksums = []
for kind, directory in [('Source', root), ('Web', root / 'web'), ('AndroidStudio', root / 'android')]:
    archive = output / f'StoryWeave-{kind}-v1.9.8.zip'
    if archive.exists():
        raise FileExistsError(f'Refusing to overwrite existing release: {archive}')
    sources = {file.relative_to(directory).as_posix(): file for file in sorted(directory.rglob('*')) if file.is_file()}
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
        for name, source in sources.items():
            zipped.write(source, name)
    with zipfile.ZipFile(archive) as zipped:
        assert set(zipped.namelist()) == set(sources)
        for name, source in sources.items():
            assert hashlib.sha256(zipped.read(name)).digest() == hashlib.sha256(source.read_bytes()).digest(), name
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    checksums.append(f'{digest}  {archive.name}')
    print(kind, len(sources), 'files verified;', round(archive.stat().st_size / 1024 / 1024, 2), 'MiB')
apk = output / 'StoryWeave-v1.9.8-debug.apk'
if apk.is_file():
    checksums.append(f'{hashlib.sha256(apk.read_bytes()).hexdigest()}  {apk.name}')
(output / 'StoryWeave-v1.9.8-SHA256.txt').write_text('\n'.join(checksums) + '\n', encoding='utf-8')
