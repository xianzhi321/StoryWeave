"""Prepare the pinned MIT Azgaar v1.109 runtime for offline StoryWeave use.
Usage: python build_azgaar.py PATH_TO_EXTRACTED_UPSTREAM_TAG
"""
import json
import re
import shutil
import sys
from pathlib import Path

source = Path(sys.argv[1]).resolve()
target = Path(__file__).parent / 'web/vendor/azgaar'
target.mkdir(parents=True, exist_ok=True)
for name in ('components', 'config', 'libs', 'modules', 'styles', 'utils', 'images'):
    shutil.copytree(source / name, target / name, dirs_exist_ok=True)
for name in ('index.html', 'main.js', 'index.css', 'icons.css', 'versioning.js', 'LICENSE'):
    shutil.copy2(source / name, target / name)

def edit(name, fn):
    path = target / name
    path.write_text(fn(path.read_text(encoding='utf-8')), encoding='utf-8')

def index(text):
    text = re.sub(r'<script async src="https://www.googletagmanager.*?</script>\s*<script>.*?</script>', '', text, flags=re.S)
    text = re.sub(r'<link rel="manifest"[^>]*>', '', text)
    # No remote resources, analytics, service worker or persistent engine settings.
    policy = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'"
    text = text.replace('<meta charset="utf-8" />', '<meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="' + policy + '"><script src="offline.js"></script>')
    # Canonicalize query strings for offline precaching.
    text = re.sub(r'((?:src|href)="[^"?:]+)\?[^"\s]+', r'\1', text)
    return text.replace('</body>', '<script defer src="bridge.js"></script></body>')

edit('index.html', index)
def main(text):
    text = re.sub(r'const PRODUCTION = .*?;', 'const PRODUCTION = false;', text, count=1)
    start = text.index('document.addEventListener("DOMContentLoaded", async () => {')
    end = text.index('function hideLoading()', start)
    text = text[:start] + '// StoryWeave bridge owns startup and errors.\n\n' + text[end:]
    start = text.index('async function generate(options)')
    error = text.index('} catch (error) {', start)
    text = text[:error] + text[error:].replace('} catch (error) {', '} catch (error) {\n    throw error; // propagate failure to the StoryWeave preview', 1)
    return text
edit('main.js', main)
edit('modules/ui/style-presets.js', lambda t: re.sub(r'async function fetchSystemPreset\(preset\) \{.*?\n\}', 'async function fetchSystemPreset(preset) { return structuredClone(window.storyWeaveStyle); }', t, count=1, flags=re.S))
edit('modules/fonts.js', lambda t: t.replace('declareDefaultFonts(); // execute once on load', 'fonts.forEach(font => delete font.src);\ndeclareDefaultFonts(); // local system fonts only'))
# Keep the vendor startup independent of IndexedDB, which is unnecessary here.
(target / 'libs/indexedDB.js').write_text('window.ldb = {get: async () => null, set: async () => {}};\n', encoding='utf-8')
style = json.loads((source / 'styles/default.json').read_text(encoding='utf-8'))
offline = """'use strict';
(() => {
  const params = new URL(location.href).searchParams;
  const settings = new Map(Object.entries({version:'1.109.1', mapWidth:'1200', mapHeight:'800',
    points:'4', template:params.get('template') || 'continents', manors:'40', statesNumber:'8',
    cultures:'8', preset:params.get('style') === 'political' ? 'political' : 'physical'}));
  Object.defineProperty(window, 'localStorage', {value: {
    getItem: key => settings.get(key) ?? null,
    setItem: (key,value) => settings.set(key,String(value)),
    removeItem: key => settings.delete(key), clear: () => settings.clear(),
    key: index => [...settings.keys()][index] ?? null, get length() {return settings.size;}
  }});
  window.storyWeaveReport = (type, data) => parent.postMessage({channel:'storyweave-azgaar',
    request:params.get('request'), type, ...data}, '*');
  window.addEventListener('error', event => {
    if (event.message) window.storyWeaveReport('error', {message:event.message});
  });
  window.addEventListener('unhandledrejection', event => window.storyWeaveReport('error', {message:String(event.reason?.message || event.reason)}));
})();
"""
(target / 'offline.js').write_text(offline + '\nwindow.storyWeaveStyle = ' + json.dumps(style, ensure_ascii=False) + ';\n', encoding='utf-8')
shutil.copy2(Path(__file__).parent / 'azgaar_bridge.js', target / 'bridge.js')
print('Prepared Azgaar v1.109 (engine VERSION 1.109.1) in', target)
