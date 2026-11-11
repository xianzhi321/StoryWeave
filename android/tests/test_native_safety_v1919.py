"""v1.9.19 source contract for findings P1-P5; JNI/Android device tests still required."""
from pathlib import Path
R=Path(__file__).resolve().parents[1]/'app/src/main/java/com/storyweave/studio'
s=(R/'NativeTabletActivity.java').read_text()
repo=(R/'NativeStoryRepository.java').read_text()
policy=(R/'NativeImePolicy.java').read_text()
def method(a,b):return s[s.index(a):s.index(b,s.index(a))]
field=method('private boolean stageField(', 'private void captureEditorDraft(')
assert field.index('if (isComposing(editable))') < field.index('NativeImePolicy.decide(false,') < field.index('owner.put(property,value)')
assert '.remove(key)' not in field, 'A confirmed edit must never silently discard an old candidate'
assert 'KEEP_PENDING_BLOCKED' in policy and 'STASH_CANDIDATE' in policy and 'COMMIT_CONFIRMED' in policy
assert 'if(bodyChanged || titleChanged)enqueueSave()' in s
assert 'reviewPendingInput()' in s and 'pendingDraftKeys()' in s
assert 'clearAllPendingAfterImport()' in s and 'edit.commit()' in s
assert 'refreshPendingNotice()' in s
assert 'recoverFromBackup(imported.toString())' in s
assert 'archive' in repo and 'copyOriginalWithSync' in repo and 'getFD().sync()' in repo
assert '(!recovery && (storageBlocked || diskWriteFailed.get()))' in s
assert 'initialReadFailed=false' in s and 'clearOldEditorBinding()' in s
assert 'imported.remove("_recovery")' in s
assert 'exportRequestedUnverified=unverified' in s
assert 'if(!wasUnverified && currentlyUnverified)' in s
assert 'if(exportRequestedUnverified==null)' in s
assert 'toast("原生库未读取成功' in s
assert '_recovery' in s and 'pendingIme' in s and 'allPending' in s
assert 'storage.openRead()' in repo and 'save(content)' in repo
assert 'if (++emptyReads >= 8)' in repo
print('PASS v1.9.19 source contracts: reversible recovery, no pending loss on failure, global pending lifecycle, export consistency')
