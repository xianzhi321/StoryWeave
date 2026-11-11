"""Review-time source contracts for native data integrity (not an Android runtime test)."""
from pathlib import Path
import re
R=Path(__file__).resolve().parents[1]
activity=(R/'app/src/main/java/com/storyweave/studio/NativeTabletActivity.java').read_text()
repo=(R/'app/src/main/java/com/storyweave/studio/NativeStoryRepository.java').read_text()
assert 'new WebView(' not in activity
assert 'import android.webkit.' not in activity
assert 'private final ExecutorService backupIo' in activity
assert 'private final ExecutorService writer' in activity
assert 'backupIo.execute' in activity
assert 'writer.execute' in activity
assert 'NativeStoryRepository.readBounded(in)' in activity
assert 'NativeStoryRepository.parse(raw)' in activity
assert 'BaseInputConnection.getComposingSpanStart(editable)' in activity and 'NativeImePolicy.pendingCandidate' in activity
assert 'if(delta>0&&delta<=8)' in activity
assert 'rememberEditorPosition()' in activity
assert 'restoreEditorPosition(chapterBody,chapterId)' in activity
assert 'captureEditorDraft()' in activity
assert 'getPreferences(MODE_PRIVATE).getString("lastChapter:"' in activity
assert 'persistedRevision=Math.max(persistedRevision,revision)' in activity
assert 'editRevision>persistedRevision' in activity
assert 'if(editRevision<=queuedRevision)return' in activity
assert 'diskWriteFailed.set(true)' in activity
assert 'if(storageBlocked || diskWriteFailed.get())' in activity
assert 'if(!recovery && diskWriteFailed.get())throw new java.io.IOException' in activity
assert 'libraryEpoch++' in activity
assert 'setAdapter(adapter' in activity # no huge String[] array for directory dialog
assert 'storage.startWrite()' in repo and 'storage.failWrite(output)' in repo
assert 'HashSet<String> workIds' in repo and 'HashSet<String> chapterIds' in repo
assert 'new File(storage.getBaseFile().getPath() + ".new")' in repo
assert repo.index('if (bytes.length > MAX_JSON_BYTES)') < repo.index('parse(text);') < repo.index('storage.startWrite()')
assert 'onPause()' in activity and re.search(r'void onPause\(\)\s*\{[^}]*flushSave\(\)',activity,re.S)
print('PASS: native-only editor, separate backup IO, revision-aware save, failure halt, duplicate ID and crash-sentinel guards, IME/position safeguards')
