"""Refresh the offline asset inventory and mirror shared assets into Android."""
import hashlib
import json
import shutil
from pathlib import Path

root = Path(__file__).parent
web = root / 'web'
assets = ['./'] + ['./' + path.relative_to(web).as_posix() for path in sorted(web.rglob('*'))
                  if path.is_file() and path.name not in ('sw.js', 'offline-assets.js')]
(web / 'offline-assets.js').write_text('self.STORYWEAVE_OFFLINE_ASSETS = ' + json.dumps(assets, ensure_ascii=False) + ';\n', encoding='utf-8')
destination = root / 'android/app/src/main/assets'
shutil.copytree(web, destination, dirs_exist_ok=True)
files = [path for path in web.rglob('*') if path.is_file()]
assert len(files) == len([path for path in destination.rglob('*') if path.is_file()])
for path in files:
    other = destination / path.relative_to(web)
    assert hashlib.sha256(path.read_bytes()).digest() == hashlib.sha256(other.read_bytes()).digest(), path
print('Web/Android identical:', len(files), 'files; offline inventory:', len(assets), 'entries')
