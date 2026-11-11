"""Offline source contract checks; not a substitute for SDK compilation or a device test."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET

HERE=Path(__file__).resolve().parent
BASE=(HERE if (HERE/'app').is_dir() else HERE/'android')/'app'/'src'/'main'
manifest=ET.parse(BASE/'AndroidManifest.xml').getroot()
ns='{http://schemas.android.com/apk/res/android}'
activities={a.attrib[ns+'name']:a for a in manifest.find('application').findall('activity')}
assert '.MainActivity' in activities and '.NativeTabletActivity' in activities
assert activities['.NativeTabletActivity'].attrib[ns+'exported']=='false'
assert 'orientation' in activities['.NativeTabletActivity'].attrib[ns+'configChanges']
main=(BASE/'java/com/storyweave/studio/MainActivity.java').read_text()
native=(BASE/'java/com/storyweave/studio/NativeTabletActivity.java').read_text()
store=(BASE/'java/com/storyweave/studio/NativeStoryRepository.java').read_text()
assert 'smallestScreenWidthDp >= 600' in main
assert main.index('startActivity(new Intent(this, NativeTabletActivity.class))') < main.index('new WebView(this)')
assert not re.search(r'\b(import android\.webkit\.|new WebView\(|addJavascriptInterface\(|loadUrl\()', native)
assert all(x in native for x in ['EditText','ListView','BaseAdapter','onConfigurationChanged','onPause','flushSave','readBounded','ACTION_OPEN_DOCUMENT','ACTION_CREATE_DOCUMENT','onActivityResult'])
assert 'AtomicFile' in store and 'startWrite' in store and 'finishWrite' in store and 'failWrite' in store
assert store.index('parse(text);') < store.index('storage.startWrite()')
assert 'storage.openRead()' in store
assert all(x in native for x in ['"projects"','"chapters"','"characters"','"text"'])
assert (BASE/'assets/index.html').exists()  # original phone app preserved
print('PASS: launcher routing, native layout, atomic data, import/export, orientation, legacy preservation')
