package com.storyweave.studio;

/** Pure Java IME boundary rule, shared by Android code and ordinary JVM tests. */
final class NativeImePolicy {
    private static final int MAX_PENDING_CHARS = 512;
    private NativeImePolicy() {}

    enum StageDecision { STASH_CANDIDATE, KEEP_PENDING_BLOCKED, COMMIT_CONFIRMED }

    /** Pure decision, so changing the order of cleanup/guards is testable.
     *  The caller may only delete pending candidates by an explicit user action;
     *  neither a failed write nor an unrelated committed edit destroys a rescue.
     */
    static StageDecision decide(boolean hasComposition,boolean writesBlocked){
        if(hasComposition)return StageDecision.STASH_CANDIDATE;
        if(writesBlocked)return StageDecision.KEEP_PENDING_BLOCKED;
        return StageDecision.COMMIT_CONFIRMED;
    }
    static boolean mayCommit(boolean hasComposition, boolean writesBlocked) {
        return decide(hasComposition,writesBlocked)==StageDecision.COMMIT_CONFIRMED;
    }

    static String pendingCandidate(String text, int start, int end) {
        if (text == null || start < 0 || end <= start || end > text.length()) return "";
        // A composing candidate is NOT a confirmed chapter edit.
        return text.substring(start, Math.min(end, start + MAX_PENDING_CHARS));
    }
}
