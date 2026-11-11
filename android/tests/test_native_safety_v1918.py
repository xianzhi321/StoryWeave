"""Source-level regression checks for v1.9.18 fixes; runtime validation still required."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]/'app/src/main/java/com/storyweave/studio'
activity=(root/'NativeTabletActivity.java').read_text()
repo=(root/'NativeStoryRepository.java').read_text()
ime=(root/'NativeImePolicy.java').read_text()

def body(name, next_name=None):
    start=activity.index(('    private boolean ' if name=='stageField' else '    private void ')+name+'(')
    if next_name:
        end=activity.index('    private void '+next_name+'(',start+1)
        return activity[start:end]
    return activity[start:]

assert 'new WebView(' not in activity
assert 'import android.webkit' not in activity
assert 'NativeImePolicy.pendingCandidate(editable.toString(),start,end)' in activity
assert '"draft:" + editorWorkId + ":" + editorChapterId' in activity
assert 'if (isComposing(editable))' in body('stageField','captureEditorDraft')
branch=body('stageField','captureEditorDraft')
assert branch.index('if (isComposing(editable))') < branch.index('return false;\n        }') < branch.index('owner.put(property,value)')
assert 'stageField(editorChapter,"text",chapterBody,pendingKey("body"),false)' in body('captureEditorDraft','copyPendingInput')
assert 'stageField(editorChapter,"title",chapterTitle,pendingKey("title"),false)' in body('captureEditorDraft','copyPendingInput')
assert 'copyCurrentChapter' in activity and 'copyPendingInput' in activity
assert 'markReadOnly(chapterBody)' in activity and 'setTextIsSelectable(true)' in body('markReadOnly','clearOldEditorBinding')
assert 'getKeyListener' not in activity  # no silently restored old editor instance
assert 'retryFailedSave' in activity and 'writeGeneration.incrementAndGet()' in body('retryFailedSave','enqueueSave')
assert 'generation!=writeGeneration.get()' in body('flushSave','importBackup')
assert 'diskWriteFailed.set(true)' in body('flushSave','importBackup')
assert 'if(initialReadFailed || !loadedFromDisk)' in body('exportBackup')
assert 'StoryWeave-UNVERIFIED-recovery.json' in body('exportBackup')
assert 'meta.put("unverified",unverified)' in activity
assert 'meta.put("pendingIme",allPending)' in activity
assert 'copy.put("_recovery",meta)' in activity
assert 'clearOldEditorBinding();\n                            libraryEpoch++;' in activity
assert 'editorChapter=null;editorChapterId=null;editorWorkId=null;' in body('clearOldEditorBinding','restoreEditorPosition')
assert 'if (++emptyReads >= 8)throw new IOException' in repo
assert 'if (n == 0)' in repo and 'continue;' in repo
assert 'MAX_PENDING_CHARS = 512' in ime and 'mayCommit' in ime
assert 'writeGeneration.get()' in activity
print('PASS v1.9.18 static safety contracts: IME isolation, recovery export, retry generation fence, stale import binding, bounded read')
