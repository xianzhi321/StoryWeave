package com.storyweave.studio;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.BaseInputConnection;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native Android Views, not WebView/HTML/CSS. Tablet-first writing surface.
 *  This is a migration stage: unsupported legacy features remain preserved in JSON,
 *  not exposed as if they were already native implementations.
 */
public final class NativeTabletActivity extends Activity {
    private static final int PICK_BACKUP = 2001;
    private static final int WRITE_BACKUP = 2002;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService writer = Executors.newSingleThreadExecutor();
    // Large backup parsing/export must never delay the manuscript save queue.
    private final ExecutorService backupIo = Executors.newSingleThreadExecutor();
    private final ArrayDeque<Long> recentKeystrokes = new ArrayDeque<>();
    private NativeStoryRepository repository;
    private JSONObject library;
    private String workId = null, chapterId = null;
    private String screen = "books";
    private boolean night = true, suppressText = false;
    private boolean largeLayout;
    private int wideDp;
    private EditText chapterTitle, chapterBody;
    private TextView speed, pause, saveIndicator;
    private Button pendingNotice;
    private LinearLayout chapterPane, bodyHost, mainHost;
    private Runnable scheduledSave;
    private long lastInputAt = 0L;
    private int lastCommittedLength = 0;
    // Revision numbers represent edits to the in-memory library (UI thread only).
    // A queued, older snapshot must never mark a newer revision as saved.
    private long editRevision = 0, queuedRevision = 0, persistedRevision = 0;
    private long libraryEpoch = 0;
    private final AtomicBoolean diskWriteFailed = new AtomicBoolean(false);
    // Fences off old queued snapshots when the user explicitly retries a failed save.
    private final AtomicLong writeGeneration = new AtomicLong(0);
    private boolean loadedFromDisk = false;
    private boolean initialReadFailed = false;
    private String editorChapterId;
    private String editorWorkId;
    private JSONObject editorChapter;
    private boolean storageBlocked = false;
    private boolean importInProgress = false;
    private Boolean exportRequestedUnverified = null;
    private String exportRequestedReason = null;
    private final Runnable clock = new Runnable() {
        @Override public void run() {
            refreshWritingStatus();
            ui.postDelayed(this, 500);
        }
    };
    private final int PAPER = Color.rgb(247, 246, 241), PAPER_SURFACE = Color.rgb(255, 254, 250);
    private final int INK = Color.rgb(30, 39, 34), INK_SURFACE = Color.rgb(39, 51, 44);
    private final int SAGE = Color.rgb(132, 176, 149);

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        repository = new NativeStoryRepository(this);
        night = getPreferences(MODE_PRIVATE).getBoolean("night", true);
        if (saved != null) {
            workId = saved.getString("workId"); chapterId = saved.getString("chapterId");
            screen = saved.getString("screen", "books");
            if(saved.containsKey("exportUnverified"))
                exportRequestedUnverified=saved.getBoolean("exportUnverified");
            exportRequestedReason=saved.getString("exportReason");
        }
        try { library = repository.read(); loadedFromDisk = true; }
        catch (Exception e) {
            initialReadFailed = true;
            storageBlocked = true;
            library = NativeStoryRepository.emptyLibrary();
            new AlertDialog.Builder(this).setTitle("原生作品库读取失败")
                .setMessage("原始文件仍保留，尚未建立可写入的作品库。可以从已有 JSON 备份恢复；恢复前会逐字节归档损坏文件。请勿清除应用数据。\n"+e.getMessage())
                .setPositiveButton("从备份恢复",(d,w)->importBackup())
                .setNeutralButton("粘贴备份",(d,w)->importFromClipboard())
                .setNegativeButton("暂不处理",null).show();
        }
        if (workId == null) workId = library.optString("selected", "");
        if (!hasWork(workId)) workId = firstWorkId();
        wideDp = getResources().getConfiguration().screenWidthDp;
        largeLayout = wideDp >= 900;
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        applySystemColors();
        render();
    }

    @Override protected void onResume() {
        super.onResume();
        ui.removeCallbacks(clock);
        ui.post(clock);
    }

    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        // A change between single- and dual-pane requires rebuilding our native Views.
        // Persist caret/scroll before the rebuild; never reset the draft or save history.
        boolean editing = chapterBody != null && chapterBody.hasFocus();
        rememberEditorPosition();
        wideDp = config.screenWidthDp;
        largeLayout = wideDp >= 900;
        render();
        if (editing && chapterBody != null) chapterBody.requestFocus();
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        rememberEditorPosition();
        state.putString("workId", workId); state.putString("chapterId", chapterId); state.putString("screen", screen);
        if(exportRequestedUnverified!=null)state.putBoolean("exportUnverified",exportRequestedUnverified);
        state.putString("exportReason",exportRequestedReason);
        super.onSaveInstanceState(state);
    }
    @Override protected void onPause() {
        rememberEditorPosition();
        ui.removeCallbacks(clock);
        lastInputAt = 0;
        recentKeystrokes.clear();
        flushSave();
        super.onPause();
    }
    @Override protected void onDestroy() {
        ui.removeCallbacks(clock);
        if (scheduledSave != null) ui.removeCallbacks(scheduledSave);
        flushSave();
        writer.shutdown();
        backupIo.shutdown();
        super.onDestroy();
    }

    private int dp(float n) { return Math.round(getResources().getDisplayMetrics().density * n); }
    private int background() { return night ? INK : PAPER; }
    private int surface() { return night ? INK_SURFACE : PAPER_SURFACE; }
    private int foreground() { return night ? Color.rgb(235,239,232) : Color.rgb(42,57,46); }
    private int secondary() { return night ? Color.rgb(171,185,174) : Color.rgb(102,117,105); }
    private int lineColor() { return night ? Color.rgb(60,76,65) : Color.rgb(219,225,216); }
    private int accent() { return night ? Color.rgb(180,217,192) : Color.rgb(45,92,69); }
    private GradientDrawable bg(int color, int radius, boolean border) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color); shape.setCornerRadius(dp(radius));
        if (border) shape.setStroke(dp(1), lineColor());
        return shape;
    }
    private void applySystemColors() {
        getWindow().setStatusBarColor(background()); getWindow().setNavigationBarColor(background());
        int flags = getWindow().getDecorView().getSystemUiVisibility();
        int light = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        getWindow().getDecorView().setSystemUiVisibility(night ? flags & ~light : flags | light);
    }
    private TextView text(String value, int sp, boolean bold, int color) {
        TextView result = new TextView(this);
        result.setText(value); result.setTextSize(sp); result.setTextColor(color);
        result.setGravity(Gravity.CENTER_VERTICAL);
        if (bold) result.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        result.setIncludeFontPadding(false);
        return result;
    }
    private Button button(String label, Runnable click) {
        Button b = new Button(this);
        b.setText(label); b.setAllCaps(false); b.setTextColor(foreground());
        b.setTextSize(13); b.setMinHeight(0); b.setMinimumHeight(0);
        b.setBackground(bg(surface(), 10, true));
        b.setPadding(dp(12),0,dp(12),0);
        b.setOnClickListener(v -> { if (!importInProgress) click.run(); });
        return b;
    }
    private LinearLayout column() {
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); return layout;
    }
    private LinearLayout row() {
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.HORIZONTAL); return layout;
    }
    private void add(LinearLayout p, View v, int w, int h) { p.addView(v, new LinearLayout.LayoutParams(w < 0 ? w : dp(w), h < 0 ? h : dp(h))); }
    private void flex(LinearLayout p, View v) { p.addView(v, new LinearLayout.LayoutParams(0, -1, 1)); }
    private void gap(LinearLayout p, int h) { add(p, new View(this), 1, h); }
    private void divider(LinearLayout p) { View v = new View(this); v.setBackgroundColor(lineColor()); add(p, v, -1, 1); }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_SHORT).show(); }

    private JSONObject getWork() {
        JSONArray a = library.optJSONArray("projects");
        if (a == null) return null;
        for (int i=0;i<a.length();i++) { JSONObject o=a.optJSONObject(i); if(o!=null && o.optString("id").equals(workId)) return o; }
        return null;
    }
    private JSONObject getChapter() {
        JSONObject work = getWork();
        if (work == null) return null;
        JSONArray arr = work.optJSONArray("chapters"); if(arr == null)return null;
        for(int i=0;i<arr.length();i++){JSONObject ch=arr.optJSONObject(i);if(ch!=null&&ch.optString("id").equals(chapterId))return ch;}
        return null;
    }
    private boolean hasWork(String id) {
        JSONArray arr=library.optJSONArray("projects");
        if(id==null||arr==null)return false;
        for(int i=0;i<arr.length();i++)if(id.equals(arr.optJSONObject(i).optString("id")))return true;
        return false;
    }
    private String firstWorkId(){JSONArray arr=library.optJSONArray("projects");return arr!=null&&arr.length()>0?arr.optJSONObject(0).optString("id"):null;}
    private boolean chapterExists(JSONObject work, String id) {
        if (work == null || id == null || id.isEmpty()) return false;
        JSONArray chapters=work.optJSONArray("chapters");
        if (chapters == null) return false;
        for(int i=0;i<chapters.length();i++)if(id.equals(chapters.optJSONObject(i).optString("id")))return true;
        return false;
    }
    private void rememberEditorPosition() {
        if (chapterBody == null || editorChapterId == null) return;
        // Persist a draft that is still in an IME composition when the view is detached.
        // Otherwise a rotation, chapter switch or background transition could lose it.
        captureEditorDraft();
        int start=chapterBody.getSelectionStart(), end=chapterBody.getSelectionEnd();
        if (start < 0 || end < 0) return;
        getPreferences(MODE_PRIVATE).edit()
            .putInt("cursorStart:"+editorChapterId,start)
            .putInt("cursorEnd:"+editorChapterId,end)
            .putInt("scrollY:"+editorChapterId,Math.max(0,chapterBody.getScrollY()))
            .apply();
    }
    /** Only a SHORT composing span is stored in an independent draft: preference.
     *  It is never merged into chapter.text, automatically restored into EditText,
     *  or included in an ordinary committed save. The user can copy it explicitly.
     */
    private String pendingKey(String field) {
        return "draft:" + editorWorkId + ":" + editorChapterId + ":" + field;
    }
    private boolean isComposing(Editable text) {
        return text != null && BaseInputConnection.getComposingSpanStart(text) >= 0;
    }
    private boolean stageField(JSONObject owner,String property,EditText control,String key,boolean scheduleSave) {
        if (control == null) return false;
        Editable editable=control.getText();
        if (editable == null) return false;
        if (isComposing(editable)) {
            int start=BaseInputConnection.getComposingSpanStart(editable);
            int end=BaseInputConnection.getComposingSpanEnd(editable);
            String candidate=NativeImePolicy.pendingCandidate(editable.toString(),start,end);
            if(!candidate.isEmpty()) {
                // Never store the whole chapter in SharedPreferences on each IME event.
                getPreferences(MODE_PRIVATE).edit().putString(key,candidate).apply();
                refreshPendingNotice();
            }
            return false;
        }
        // Do not delete an existing rescue before checking write eligibility.
        // A committed edit in a different session must not clear an older candidate.
        if(NativeImePolicy.decide(false, storageBlocked || diskWriteFailed.get() || importInProgress)
                !=NativeImePolicy.StageDecision.COMMIT_CONFIRMED)return false;
        String value=editable.toString();
        if(!value.equals(owner.optString(property))){
            try{owner.put(property,value);if(scheduleSave)enqueueSave();return true;}
            catch(JSONException e){Log.e("StoryWeaveNative","Cannot stage chapter " + property,e);}
        }
        return false;
    }
    private void captureEditorDraft() {
        if (editorChapter == null || chapterBody == null || importInProgress)return;
        boolean bodyChanged=stageField(editorChapter,"text",chapterBody,pendingKey("body"),false);
        boolean titleChanged=stageField(editorChapter,"title",chapterTitle,pendingKey("title"),false);
        if(bodyChanged || titleChanged)enqueueSave(); // One revision for a single capture.
    }
    private ArrayList<String> pendingDraftKeys(){
        ArrayList<String> keys=new ArrayList<>();
        for(java.util.Map.Entry<String,?> item:getPreferences(MODE_PRIVATE).getAll().entrySet()){
            if(item.getKey().startsWith("draft:") && item.getValue() instanceof String &&
                    !((String)item.getValue()).isEmpty())keys.add(item.getKey());
        }
        java.util.Collections.sort(keys);
        return keys;
    }
    private int pendingDraftCount(){return pendingDraftKeys().size();}
    private void removePendingKey(String key){
        getPreferences(MODE_PRIVATE).edit().remove(key).apply();
        refreshPendingNotice();
    }
    private void clearAllPendingAfterImport(){
        android.content.SharedPreferences prefs=getPreferences(MODE_PRIVATE);
        android.content.SharedPreferences.Editor edit=prefs.edit();
        for(String key:prefs.getAll().keySet())if(key.startsWith("draft:"))edit.remove(key);
        // commit() is deliberate: no stale pending candidates should survive a
        // successful replacement import or reappear after an immediate crash.
        if(!edit.commit())toast("旧输入法暂存清理未能写入磁盘，请手动核查");
        refreshPendingNotice();
    }
    private void refreshPendingNotice(){
        if(pendingNotice==null)return;
        int count=pendingDraftCount();
        pendingNotice.setVisibility(count>0?View.VISIBLE:View.GONE);
        pendingNotice.setText(count>0?"有未确认输入（"+count+"）· 查看或复制":"");
    }
    private void reviewPendingInput(){
        ArrayList<String> keys=pendingDraftKeys();
        if(keys.isEmpty()){toast("没有待确认的输入法文字");return;}
        String[] items=new String[keys.size()];
        android.content.SharedPreferences prefs=getPreferences(MODE_PRIVATE);
        for(int i=0;i<keys.size();i++){
            String k=keys.get(i),value=prefs.getString(k,"");
            items[i]=k.substring(6)+" · "+value.substring(0,Math.min(20,value.length()));
        }
        new AlertDialog.Builder(this).setTitle("未确认输入（"+keys.size()+"）")
            .setItems(items,(dialog,i)->{
                String key=keys.get(i),value=prefs.getString(key,"");
                new AlertDialog.Builder(this).setTitle("输入法暂存 · "+key.substring(6))
                    .setMessage(value)
                    .setPositiveButton("复制",(d,w)->copyToClipboard("输入法暂存",value))
                    .setNeutralButton("删除此条",(d,w)->new AlertDialog.Builder(this)
                        .setTitle("清除这段未确认文字？")
                        .setMessage("删除后无法通过暂存区恢复。请先确认已复制或不再需要。")
                        .setPositiveButton("确认清除",(dd,ww)->removePendingKey(key))
                        .setNegativeButton("取消",null).show())
                    .setNegativeButton("返回",null).show();
            }).setPositiveButton("复制全部",(d,w)->{
                StringBuilder text=new StringBuilder();
                for(String key:keys)text.append(key.substring(6)).append("：")
                    .append(prefs.getString(key,"")).append("\n");
                copyToClipboard("所有未确认输入",text.toString());
            }).setNegativeButton("关闭",null).show();
    }

    private void copyPendingInput(){
        if(editorChapterId==null){toast("没有正在编辑的章节");return;}
        android.content.SharedPreferences p=getPreferences(MODE_PRIVATE);
        String pendingBody=p.getString(pendingKey("body"),"");
        String pendingTitle=p.getString(pendingKey("title"),"");
        if(pendingBody.isEmpty() && pendingTitle.isEmpty()){
            // There can be a live IME composition not yet staged by onPause.
            captureEditorDraft();
            pendingBody=p.getString(pendingKey("body"),"");
            pendingTitle=p.getString(pendingKey("title"),"");
        }
        if(pendingBody.isEmpty() && pendingTitle.isEmpty()){
            toast("没有待确认的输入法文字");return;
        }
        copyToClipboard("输入法暂存",(pendingTitle.isEmpty()?"":"标题候选："+pendingTitle+"\n")+
            (pendingBody.isEmpty()?"":"正文候选："+pendingBody));
    }
    private void copyToClipboard(String label,String value){
        ClipboardManager manager=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
        if(manager==null){toast("剪贴板不可用");return;}
        manager.setPrimaryClip(ClipData.newPlainText(label,value));
        toast("已复制到剪贴板");
    }
    private void copyCurrentChapter(){
        JSONObject chapter=getChapter();
        if(chapter==null){toast("没有可复制的正文");return;}
        // Copy only confirmed text, never the raw IME candidate in an EditText.
        copyToClipboard("本章已确认正文",chapter.optString("text",""));
    }
    private void markReadOnly(EditText field){
        if(field==null)return;
        // Keep long-press/select/copy available even when writes are prohibited.
        field.setEnabled(true);
        field.setKeyListener(null);
        field.setTextIsSelectable(true);
    }
    private void clearOldEditorBinding(){
        // Used after importing a replacement library; prevents stale owners from
        // writing one more snapshot during render()'s old-view cleanup.
        chapterBody=null;chapterTitle=null;editorChapter=null;editorChapterId=null;editorWorkId=null;
    }
    private void restoreEditorPosition(EditText editor, String chapterKey) {
        android.content.SharedPreferences p=getPreferences(MODE_PRIVATE);
        if (!p.contains("cursorStart:"+chapterKey)) return;
        final int from=p.getInt("cursorStart:"+chapterKey,0);
        final int to=p.getInt("cursorEnd:"+chapterKey,from);
        final int scroll=p.getInt("scrollY:"+chapterKey,0);
        editor.post(()->{
            if (chapterBody != editor || !chapterKey.equals(editorChapterId)) return;
            int size=editor.length();
            editor.setSelection(Math.min(size,Math.max(0,Math.min(from,to))),
                                Math.min(size,Math.max(0,Math.max(from,to))));
            editor.scrollTo(0,Math.max(0,scroll));
        });
    }
    private void pickWork(String id) {
        if(importInProgress || storageBlocked)return;
        workId=id;chapterId=null;screen="write";
        JSONObject work=getWork();
        String last=getPreferences(MODE_PRIVATE).getString("lastChapter:"+id, "");
        if(chapterExists(work,last))chapterId=last;
        else if(work!=null&&work.optJSONArray("chapters").length()>0)
            chapterId=work.optJSONArray("chapters").optJSONObject(0).optString("id");
        try{library.put("selected", id);}catch(JSONException ignore){}
        enqueueSave();render();
    }

    private void render() {
        rememberEditorPosition();
        chapterBody=null;chapterTitle=null;editorChapterId=null;editorWorkId=null;editorChapter=null;
        saveIndicator=null;speed=null;pause=null;pendingNotice=null;
        LinearLayout root = row();root.setBackgroundColor(background());
        setContentView(root);
        LinearLayout rail=column();rail.setGravity(Gravity.TOP|Gravity.CENTER_HORIZONTAL);
        rail.setPadding(dp(8),dp(18),dp(8),dp(8));rail.setBackgroundColor(surface());
        add(root,rail,76,-1);
        railButton(rail,"书架",()->{screen="books";render();});
        railButton(rail,"章节",()->{screen="write";render();});
        railButton(rail,"资料",()->{screen="info";render();});
        gap(rail,28);
        railButton(rail,night?"浅色":"墨夜",()->{night=!night;getPreferences(MODE_PRIVATE).edit().putBoolean("night",night).apply();applySystemColors();render();});
        railButton(rail,"导入",this::importBackup);
        railButton(rail,"备份",this::exportBackup);
        if(initialReadFailed)railButton(rail,"恢复损坏库",this::importBackup);
        if(pendingDraftCount()>0)railButton(rail,"待确认("+pendingDraftCount()+")",this::reviewPendingInput);
        if(diskWriteFailed.get())railButton(rail,"重试保存",this::retryFailedSave);
        railButton(rail,"旧版数据",this::openLegacyExport);
        railButton(rail,"粘贴备份",this::importFromClipboard);
        if ("write".equals(screen) && largeLayout) {
            chapterPane=column();chapterPane.setBackgroundColor(surface());
            add(root,chapterPane,250,-1);buildChapterPanel(chapterPane);
        }
        FrameLayout stage = new FrameLayout(this);
        root.addView(stage,new LinearLayout.LayoutParams(0,-1,1));
        mainHost=column();
        FrameLayout.LayoutParams hostLP = new FrameLayout.LayoutParams(-1,-1,Gravity.CENTER);
        hostLP.width = Math.min(dp("write".equals(screen)?860:1000),getResources().getDisplayMetrics().widthPixels-dp(largeLayout?326:76));
        stage.addView(mainHost,hostLP);
        if ("books".equals(screen)) buildBooks();
        else if("info".equals(screen))buildInfo();
        else buildEditor();
    }
    private void railButton(LinearLayout parent,String label,Runnable action){
        Button b=button(label,action);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(dp(59),dp(47));p.bottomMargin=dp(8);
        parent.addView(b,p);
    }
    private void heading(LinearLayout parent, String title,String subtitle){
        LinearLayout wrap=column();wrap.setPadding(dp(22),dp(20),dp(22),dp(12));
        add(wrap,text(title,23,true,foreground()),-1,36);
        if(subtitle!=null)add(wrap,text(subtitle,12,false,secondary()),-1,26);
        add(parent,wrap,-1,-2);divider(parent);
    }
    private void buildBooks(){
        heading(mainHost,"我的作品","原生平板书架 · 本地保存");
        LinearLayout actions=row();actions.setPadding(dp(18),dp(12),dp(18),dp(12));
        add(actions,initialReadFailed?
            button("从备份恢复",this::importBackup):button("新建作品",this::newWork),126,44);
        add(mainHost,actions,-1,-2);
        JSONArray projects=library.optJSONArray("projects");
        if(projects.length()==0){
            TextView empty=text(initialReadFailed
                ? "原生作品库读取失败。原始文件仍保留，请通过左侧‘恢复损坏库’导入完整 JSON 备份。"
                : "尚无原生作品。可新建作品，或从旧版导入完整 JSON 备份。",15,false,secondary());
            empty.setPadding(dp(25),dp(30),dp(25),dp(30));add(mainHost,empty,-1,-2);return;
        }
        ListView list=new ListView(this);list.setDividerHeight(0);list.setBackgroundColor(background());
        list.setAdapter(new BaseAdapter(){
            public int getCount(){return projects.length();}
            public Object getItem(int p){return projects.optJSONObject(p);}
            public long getItemId(int p){return p;}
            public View getView(int pos,View recycled,ViewGroup parent){
                JSONObject project=projects.optJSONObject(pos);
                LinearLayout outer, content;
                if(recycled instanceof LinearLayout){
                    outer=(LinearLayout)recycled;
                    content=(LinearLayout)outer.getChildAt(0);
                } else {
                    outer=column();outer.setPadding(dp(18),dp(7),dp(18),dp(7));
                    content=column();content.setPadding(dp(18),dp(12),dp(18),dp(12));
                    content.setBackground(bg(surface(),14,true));
                    add(content,text("",19,true,foreground()),-1,32);
                    add(content,text("",12,false,secondary()),-1,25);
                    add(outer,content,-1,-2);
                }
                ((TextView)content.getChildAt(0)).setText(project.optString("title","未命名作品"));
                ((TextView)content.getChildAt(1)).setText("章节 "+project.optJSONArray("chapters").length()+" · "+project.optString("genre","点击继续写作"));
                return outer;
            }
        });
        list.setOnItemClickListener((p,v,pos,id)->pickWork(projects.optJSONObject(pos).optString("id")));
        mainHost.addView(list,new LinearLayout.LayoutParams(-1,0,1));
    }
    private void buildChapterPanel(LinearLayout parent) {
        parent.removeAllViews();parent.setPadding(dp(12),dp(14),dp(12),dp(12));
        add(parent,text("章节目录",16,true,foreground()),-1,40);
        add(parent,button("＋ 新建章节",this::newChapter),-1,42);gap(parent,12);
        EditText filter=new EditText(this);filter.setSingleLine(true);filter.setTextColor(foreground());filter.setHintTextColor(secondary());filter.setTextSize(13);
        filter.setHint("查找章节");filter.setBackground(bg(background(),10,true));filter.setPadding(dp(10),0,dp(10),0);
        add(parent,filter,-1,42);gap(parent,10);
        ListView list=new ListView(this);list.setDividerHeight(0);list.setCacheColorHint(Color.TRANSPARENT);
        JSONArray chapters=getWork()==null?new JSONArray():getWork().optJSONArray("chapters");
        ArrayList<Integer> visible=new ArrayList<>();for(int i=0;i<chapters.length();i++)visible.add(i);
        BaseAdapter adapter=new BaseAdapter(){
            public int getCount(){return visible.size();}
            public Object getItem(int pos){return chapters.optJSONObject(visible.get(pos));}
            public long getItemId(int pos){return visible.get(pos);}
            public View getView(int pos,View existing,ViewGroup owner){
                JSONObject ch=(JSONObject)getItem(pos);
                TextView title=existing instanceof TextView ? (TextView)existing : text("",14,false,foreground());
                boolean active=ch.optString("id").equals(chapterId);
                title.setText(ch.optString("title","未命名章节"));
                title.setTextColor(active?accent():foreground());
                title.setTypeface(Typeface.DEFAULT,active?Typeface.BOLD:Typeface.NORMAL);
                title.setPadding(dp(12),0,dp(9),0);
                title.setBackground(bg(active?background():surface(),9,false));
                title.setMinHeight(dp(53));return title;
            }
        };
        list.setAdapter(adapter);
        list.setOnItemClickListener((p,v,index,l)->{
            if(importInProgress)return;
            JSONObject selected=(JSONObject)adapter.getItem(index);
            chapterId=selected.optString("id");screen="write";render();
        });
        filter.addTextChangedListener(watcher(value->{
            visible.clear();String term=value.toLowerCase(java.util.Locale.ROOT);
            for(int i=0;i<chapters.length();i++)if(chapters.optJSONObject(i).optString("title").toLowerCase(java.util.Locale.ROOT).contains(term))visible.add(i);
            adapter.notifyDataSetChanged();
        }));
        parent.addView(list,new LinearLayout.LayoutParams(-1,0,1));
    }
    private interface Change {void update(String text);}
    private TextWatcher watcher(Change update){return new TextWatcher(){
        public void beforeTextChanged(CharSequence s,int start,int count,int after){}
        public void onTextChanged(CharSequence s,int start,int before,int count){update.update(s.toString());}
        public void afterTextChanged(Editable e){}
    };}
    private void buildEditor() {
        JSONObject work=getWork();if(work==null){buildBooks();return;}
        if(getChapter()==null){
            JSONArray arr=work.optJSONArray("chapters");
            String saved=getPreferences(MODE_PRIVATE).getString("lastChapter:"+workId,"");
            if(chapterExists(work,saved))chapterId=saved;
            else if(arr.length()>0)chapterId=arr.optJSONObject(0).optString("id");
        }
        LinearLayout top=row();top.setGravity(Gravity.CENTER_VERTICAL);top.setPadding(dp(20),dp(10),dp(20),dp(10));
        TextView workTitle=text(work.optString("title"),16,true,foreground());top.addView(workTitle,new LinearLayout.LayoutParams(0,dp(44),1));
        if(!largeLayout)add(top,button("目录",this::showChaptersDialog),66,42);
        add(top,button("＋",this::newChapter),48,42);
        add(mainHost,top,-1,-2);divider(mainHost);
        JSONObject chapter=getChapter();if(chapter==null){
            TextView empty=text("还没有章节。点击右上角的＋开始写作。",15,false,secondary());empty.setPadding(dp(24),dp(30),0,0);add(mainHost,empty,-1,-1);return;
        }
        editorChapterId=chapterId;
        editorWorkId=workId;
        editorChapter=chapter;
        getPreferences(MODE_PRIVATE).edit().putString("lastChapter:"+workId,chapterId).apply();
        LinearLayout edit=column();edit.setPadding(dp(20),dp(18),dp(20),dp(8));mainHost.addView(edit,new LinearLayout.LayoutParams(-1,0,1));
        TextView label=text("CHAPTER · 原生编辑",11,true,secondary());add(edit,label,-1,26);
        chapterTitle = new EditText(this);chapterTitle.setSingleLine(true);chapterTitle.setTextSize(24);
        chapterTitle.setTypeface(Typeface.DEFAULT,Typeface.BOLD);chapterTitle.setTextColor(foreground());chapterTitle.setHintTextColor(secondary());
        chapterTitle.setHint("这一章的名字");chapterTitle.setBackgroundColor(Color.TRANSPARENT);chapterTitle.setPadding(0,0,0,0);
        chapterTitle.setText(chapter.optString("title"));add(edit,chapterTitle,-1,56);
        if(storageBlocked || diskWriteFailed.get())markReadOnly(chapterTitle);
        divider(edit);gap(edit,14);
        chapterBody=new EditText(this);
        chapterBody.setGravity(Gravity.TOP|Gravity.START);chapterBody.setTextColor(foreground());chapterBody.setHintTextColor(secondary());
        chapterBody.setTextSize(17);chapterBody.setLineSpacing(dp(8),1.15f);
        chapterBody.setPadding(dp(3),dp(12),dp(3),dp(8));chapterBody.setBackgroundColor(Color.TRANSPARENT);
        chapterBody.setHint("故事从这里开始……");
        chapterBody.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE|InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        chapterBody.setHorizontallyScrolling(false);chapterBody.setVerticalScrollBarEnabled(false);
        suppressText=true;chapterBody.setText(chapter.optString("text"));
        suppressText=false;lastCommittedLength=chapterBody.length();
        edit.addView(chapterBody,new LinearLayout.LayoutParams(-1,0,1));
        if(storageBlocked || diskWriteFailed.get())markReadOnly(chapterBody);
        restoreEditorPosition(chapterBody,chapterId);
        chapterTitle.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            public void onTextChanged(CharSequence s,int start,int before,int count){}
            public void afterTextChanged(Editable e){
                if(suppressText || storageBlocked || importInProgress)return;
                stageField(chapter,"title",chapterTitle,pendingKey("title"),true);
            }
        });
        chapterBody.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            public void onTextChanged(CharSequence s,int start,int before,int count){}
            public void afterTextChanged(Editable e){
                if(suppressText||storageBlocked||importInProgress)return;
                // IME candidates are saved only under draft: preferences, never chapter.text.
                stageField(chapter,"text",chapterBody,pendingKey("body"),true);
                if(isComposing(e))return;
                int delta=e.length()-lastCommittedLength;
                long now=System.currentTimeMillis();
                // Large single-step inserts are normally paste/import, not sustained typing.
                if(delta>0&&delta<=8){
                    for(int j=0;j<delta;j++)recentKeystrokes.addLast(now);
                }
                lastCommittedLength=e.length();lastInputAt=now;
            }
        });
        LinearLayout status=row();status.setPadding(dp(22),dp(7),dp(22),dp(7));status.setGravity(Gravity.CENTER_VERTICAL);
        speed=text("0.0 字/秒",12,true,accent());add(status,speed,112,32);
        pause=text("停顿 —",12,false,secondary());status.addView(pause,new LinearLayout.LayoutParams(0,dp(32),1));
        saveIndicator=text("",12,false,secondary());add(status,saveIndicator,140,32);
        refreshSaveIndicator();
        divider(mainHost);add(mainHost,status,-1,-2);
        pendingNotice=button("",this::reviewPendingInput);
        add(mainHost,pendingNotice,-1,38);
        refreshPendingNotice();
        LinearLayout actions=column();actions.setPadding(dp(18),dp(3),dp(18),dp(8));
        LinearLayout firstRow=row(), secondRow=row();
        add(firstRow,button("重命名",()->chapterTitle.requestFocus()),90,38);
        add(firstRow,button("导出备份",this::exportBackup),110,38);
        add(firstRow,button("复制正文",this::copyCurrentChapter),94,38);
        add(secondRow,button("输入法暂存",this::copyPendingInput),108,38);
        if(diskWriteFailed.get())add(secondRow,button("重试保存",this::retryFailedSave),105,38);
        else add(secondRow,button("删除章节",this::deleteChapter),100,38);
        add(actions,firstRow,-1,42);add(actions,secondRow,-1,42);
        add(mainHost,actions,-1,-2);
    }
    private void showChaptersDialog() {
        JSONObject work=getWork();if(work==null)return;
        JSONArray chapters=work.optJSONArray("chapters");
        // Recycled rows instead of allocating an array of up to 100,000 chapter titles.
        BaseAdapter adapter=new BaseAdapter(){
            public int getCount(){return chapters.length();}
            public Object getItem(int pos){return chapters.optJSONObject(pos);}
            public long getItemId(int pos){return pos;}
            public View getView(int pos,View old,ViewGroup parent){
                TextView label=old instanceof TextView?(TextView)old:text("",15,false,foreground());
                label.setText(chapters.optJSONObject(pos).optString("title","未命名章节"));
                label.setPadding(dp(18),dp(8),dp(18),dp(8));label.setMinHeight(dp(48));
                return label;
            }
        };
        new AlertDialog.Builder(this).setTitle("章节目录").setAdapter(adapter,(d,i)->{
            if(importInProgress)return;
            chapterId=chapters.optJSONObject(i).optString("id");screen="write";render();
        }).setNeutralButton("新建章节",(d,w)->newChapter()).setNegativeButton("取消",null).show();
    }
    private void buildInfo() {
        heading(mainHost,"人物与资料","已从完整备份保留资料；原生编辑工具逐步迁移中");
        JSONObject work=getWork();if(work==null){add(mainHost,text("请先从书架选择作品",15,false,secondary()),-1,70);return;}
        ScrollView scroller=new ScrollView(this);LinearLayout list=column();list.setPadding(dp(24),dp(24),dp(24),dp(20));
        JSONArray chars=library.optJSONArray("characters");
        add(list,text("人物资料",19,true,foreground()),-1,42);
        int shown=0;
        if(chars!=null)for(int i=0;i<chars.length();i++){
            JSONObject obj=chars.optJSONObject(i);if(obj==null||!workId.equals(obj.optString("projectId")))continue;
            add(list,text("· "+obj.optString("name")+"   "+obj.optString("role"),15,false,foreground()),-1,44);shown++;
        }
        if(shown==0)add(list,text("当前作品暂无人物资料",13,false,secondary()),-1,44);
        gap(list,18);add(list,text("其他资料",19,true,foreground()),-1,42);
        add(list,text("旧版的关系网、世界地图与 AI 工坊数据仍完整保存在 JSON 中，原生编辑界面尚未迁移这些功能。",13,false,secondary()),-1,-2);
        scroller.addView(list);add(mainHost,scroller,-1,-1);
    }
    private void newWork(){
        if(importInProgress || storageBlocked)return;
        inputDialog("新建作品","作品名称", name->{
            if(name.trim().isEmpty())return;
            JSONObject project=new JSONObject();JSONArray chapters=new JSONArray();
            try {String key=UUID.randomUUID().toString();project.put("id",key);project.put("title",name.trim());
                project.put("chapters",chapters);project.put("created",new java.util.Date().toString());
                library.getJSONArray("projects").put(project);workId=key;library.put("selected",key);chapterId=null;screen="write";
                enqueueSave();render();
            }catch(JSONException e){toast("创建失败");}
        });
    }
    private void newChapter(){
        if(importInProgress || storageBlocked)return;
        JSONObject work=getWork();if(work==null){toast("请先选择作品");return;}
        JSONArray chapters=work.optJSONArray("chapters");
        JSONObject ch=new JSONObject();try{
            String key=UUID.randomUUID().toString();ch.put("id",key);ch.put("title","第"+(chapters.length()+1)+"章");ch.put("text","");
            ch.put("history",new JSONArray());chapters.put(ch);chapterId=key;screen="write";enqueueSave();render();
        }catch(JSONException e){toast("新建章节失败");}
    }
    private void deleteChapter(){
        if(importInProgress || storageBlocked)return;
        JSONObject work=getWork(), ch=getChapter();if(work==null||ch==null)return;
        new AlertDialog.Builder(this).setTitle("删除章节？")
          .setMessage("删除前请先导出备份。此操作会改变原生作品库。")
          .setPositiveButton("删除",(d,w)->{
              JSONArray arr=work.optJSONArray("chapters");JSONArray next=new JSONArray();
              for(int i=0;i<arr.length();i++)if(!arr.optJSONObject(i).optString("id").equals(chapterId))next.put(arr.optJSONObject(i));
              try{work.put("chapters",next);}catch(JSONException ignore){}
              chapterId=next.length()>0?next.optJSONObject(0).optString("id"):null;
              enqueueSave();render();
          }).setNegativeButton("取消",null).show();
    }
    private void inputDialog(String title,String hint,Change action){
        EditText input=new EditText(this);input.setSingleLine(true);input.setHint(hint);input.setPadding(dp(16),dp(16),dp(16),dp(16));
        new AlertDialog.Builder(this).setTitle(title).setView(input)
            .setPositiveButton("确定",(d,w)->action.update(input.getText().toString()))
            .setNegativeButton("取消",null).show();
    }
    private void refreshWritingStatus(){
        refreshPendingNotice();
        if(speed==null||pause==null)return;
        long now=System.currentTimeMillis();while(!recentKeystrokes.isEmpty() && now-recentKeystrokes.peekFirst()>5000)recentKeystrokes.removeFirst();
        speed.setText(String.format(java.util.Locale.CHINA,"%.1f 字/秒",recentKeystrokes.size()/5.0));
        long elapsed=lastInputAt==0?0:now-lastInputAt;
        if(elapsed<5000 || elapsed>120000)pause.setText("停顿 —");
        else pause.setText("思考 "+String.format(java.util.Locale.CHINA,"%02d:%02d",elapsed/60000,(elapsed/1000)%60));
    }
    private void retryFailedSave(){
        if(importInProgress || initialReadFailed || !loadedFromDisk){
            toast("原生库读取失败，禁止重试覆盖；请先恢复文件");return;
        }
        if(!diskWriteFailed.get()){toast("当前没有可重试的失败写入");return;}
        // Make every snapshot enqueued before this action permanently stale.
        writeGeneration.incrementAndGet();
        diskWriteFailed.set(false);
        storageBlocked=false;
        queuedRevision=persistedRevision;
        editRevision++;
        render(); // Restore editable controls and keep the confirmed manuscript.
        flushSave(); // Explicit retry; never claim success until AtomicFile finishes.
    }
    private void enqueueSave(){
        if(storageBlocked || importInProgress || diskWriteFailed.get())return;
        editRevision++;
        if(saveIndicator!=null)saveIndicator.setText("等待保存…");
        if(scheduledSave!=null)ui.removeCallbacks(scheduledSave);
        scheduledSave=this::flushSave;
        ui.postDelayed(scheduledSave,750);
    }
    private void refreshSaveIndicator(){
        if(saveIndicator==null)return;
        if(storageBlocked || diskWriteFailed.get()) saveIndicator.setText("保存失败 · 已停止写入");
        else if(editRevision>persistedRevision)saveIndicator.setText("等待保存…");
        else saveIndicator.setText("已保存至本机");
    }
    private void flushSave(){
        if(storageBlocked || library==null || importInProgress || diskWriteFailed.get())return;
        if(scheduledSave!=null){ui.removeCallbacks(scheduledSave);scheduledSave=null;}
        if(editRevision<=queuedRevision)return; // Already queued: avoid duplicate full-library writes.
        final String snapshot=library.toString();
        final long revision=editRevision, epoch=libraryEpoch;
        final long generation=writeGeneration.get();
        queuedRevision=revision;
        writer.execute(()->{
            if(diskWriteFailed.get() || generation!=writeGeneration.get())return;
            try{
                repository.save(snapshot);
                ui.post(()->{
                    if(epoch!=libraryEpoch || storageBlocked || generation!=writeGeneration.get())return;
                    persistedRevision=Math.max(persistedRevision,revision);
                    refreshSaveIndicator();
                });
            }catch(Exception e){
                diskWriteFailed.set(true); // Stop newer queued snapshots before they can overwrite.
                writeGeneration.incrementAndGet(); // Invalidate old tasks even after retry.
                Log.e("StoryWeaveNative","Native save failed",e);
                ui.post(()->{
                    if(epoch!=libraryEpoch)return;
                    storageBlocked=true;
                    refreshSaveIndicator();
                    markReadOnly(chapterTitle);
                    markReadOnly(chapterBody);
                    render(); // Expose retry, confirmed-text copy and emergency backup.
                    new AlertDialog.Builder(this).setTitle("原生保存失败")
                        .setMessage("磁盘写入已停止，但内存正文可复制，也可以导出标记为 unverified 的抢救备份。修复存储后可尝试重试保存。\n"+e.getMessage())
                        .setPositiveButton("确定",(d,w)->{}).show();
                });
            }
        });
    }
    private void importBackup(){
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","text/plain","application/octet-stream"});
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try{startActivityForResult(i,PICK_BACKUP);}catch(Exception e){toast("无法打开系统文件选择器");}
    }
    /** Opens the old editor ONLY for exporting existing WebView IndexedDB data.
     * Native writing and native tablet storage do not depend on this migration screen.
     */
    private void openLegacyExport() {
        new AlertDialog.Builder(this).setTitle("导出旧版作品")
            .setMessage("旧版作品仍存放在独立的 WebView 数据库。进入旧版设置，使用「查看可复制的完整 JSON 备份」复制内容；返回原生平板后点「粘贴备份」。这只是一次性迁移入口。")
            .setPositiveButton("打开旧版导出",(d,w)->{
                Intent i=new Intent(this,MainActivity.class);
                i.putExtra("legacyExportOnly",true);startActivity(i);
            }).setNegativeButton("取消",null).show();
    }
    private void importFromClipboard(){
        if(importInProgress)return;
        try{
            ClipboardManager manager=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);
            ClipData clip=manager==null?null:manager.getPrimaryClip();
            if(clip==null||clip.getItemCount()==0){toast("剪贴板没有备份内容");return;}
            CharSequence value=clip.getItemAt(0).coerceToText(this);
            if(value==null||value.length()>64*1024*1024)throw new IllegalArgumentException("备份为空或超出64 MB限制");
            final String raw=value.toString();
            backupIo.execute(()->{
                try{JSONObject parsed=NativeStoryRepository.parse(raw);
                    ui.post(()->confirmImport(parsed));
                }catch(Exception e){ui.post(()->showImportError("无法读取剪贴板备份",e));}
            });
        }catch(Exception e){showImportError("无法读取剪贴板备份",e);}
    }
    private void showImportError(String heading,Exception e){
        if(isFinishing() || isDestroyed())return;
        new AlertDialog.Builder(this).setTitle(heading)
            .setMessage(e.getMessage()).setPositiveButton("确定",null).show();
    }
    private void confirmImport(JSONObject imported){
        if(importInProgress)return;
        if(!initialReadFailed && (storageBlocked || diskWriteFailed.get())) {
            new AlertDialog.Builder(this).setTitle("无法安全导入")
                .setMessage("当前原生作品库曾读取或保存失败，禁止用新备份覆盖可能可恢复的原始数据。请先备份应用文件并修复存储错误。")
                .setPositiveButton("知道了",null).show();
            return;
        }
        final boolean recovery=initialReadFailed;
        final boolean rescued=imported.optJSONObject("_recovery")!=null;
        new AlertDialog.Builder(this).setTitle(recovery?"从备份恢复损坏的作品库":"导入完整作品备份")
            .setMessage((recovery
                ? "恢复前先复制原库及 .bak/.new 文件到独立归档，任何归档失败均停止。恢复将使用所选 JSON 备份。"
                : "这会替换原生作品库，导入后清理旧输入法暂存；不会覆盖旧版 WebView 数据。请先复制暂存并导出当前原生备份。")
                +(rescued?"\n注意：该备份包含抢救元数据，恢复后不会将 _recovery 写入作品库，请保留原始抢救文件。":""))
            .setPositiveButton(recovery?"确认恢复":"确认导入",(d,w)->{
                if(importInProgress || (!recovery && (storageBlocked || diskWriteFailed.get())))return;
                // Every earlier queued snapshot finishes before the import on this same executor.
                if(!recovery)flushSave();
                importInProgress=true;
                if(chapterBody!=null)chapterBody.setEnabled(false);
                if(chapterTitle!=null)chapterTitle.setEnabled(false);
                toast("正在导入备份…");
                writer.execute(()->{
                    try{
                        if(!recovery && diskWriteFailed.get())throw new java.io.IOException("此前的保存任务失败，已中止导入以保护数据");
                        imported.remove("_recovery"); // Rescue metadata is export-only, never persisted.
                        final java.io.File archived=recovery?
                            repository.recoverFromBackup(imported.toString()):null;
                        if(!recovery)repository.save(imported.toString());
                        ui.post(()->{
                            clearOldEditorBinding();
                            libraryEpoch++;
                            writeGeneration.incrementAndGet();
                            library=imported;
                            editRevision=queuedRevision=persistedRevision=0;
                            initialReadFailed=false;
                            storageBlocked=false;
                            diskWriteFailed.set(false);
                            loadedFromDisk=true;
                            clearAllPendingAfterImport();
                            importInProgress=false;
                            String requested=imported.optString("selected","");
                            workId=hasWork(requested)?requested:firstWorkId();
                            chapterId=null;screen="books";
                            render();
                            if(recovery){
                                new AlertDialog.Builder(this).setTitle("作品库恢复完成")
                                    .setMessage(archived!=null
                                        ? "有效备份已恢复。损坏原件已保存到应用私有存储：\n"+archived.getName()+"（可能还含 .bak/.new 附件）。请勿清除应用数据。"
                                        : "有效备份已恢复。恢复时没有发现可复制的原文件，建议立即导出一份完整 JSON 备份。")
                                    .setPositiveButton("知道了",null).show();
                            }else toast("备份导入完成");
                        });
                    }catch(Exception e){ui.post(()->{
                        importInProgress=false;
                        if(diskWriteFailed.get() || initialReadFailed)storageBlocked=true;
                        render();showImportError("导入失败，原始数据与归档仍保留",e);
                    });}
                });
            }).setNegativeButton("取消",null).show();
    }
    private void exportBackup(){
        if(importInProgress)return;
        if(initialReadFailed || !loadedFromDisk){
            showImportError("原生库尚未成功读取",
                new java.io.IOException("当前内存可能只是空白占位库，不能冒充真实作品备份。请保留应用数据并修复原始文件。"));
            return;
        }
        captureEditorDraft();
        final android.content.SharedPreferences p=getPreferences(MODE_PRIVATE);
        final boolean hasPendingIme=pendingDraftCount()>0;
        final boolean unverified = storageBlocked || diskWriteFailed.get() || editRevision>persistedRevision || hasPendingIme;
        exportRequestedUnverified=unverified;
        exportRequestedReason=diskWriteFailed.get()?"disk_write_failed":
            (storageBlocked?"storage_blocked":(hasPendingIme?"pending_ime":
            (unverified?"pending_unsaved_revision":"verified")));
        // This does not call repository.save() and is safe even after write failure.
        Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("application/json");
        i.putExtra(Intent.EXTRA_TITLE,unverified ? "StoryWeave-UNVERIFIED-recovery.json" : "StoryWeave-原生平板备份.json");
        try{startActivityForResult(i,WRITE_BACKUP);}catch(Exception e){toast("无法打开系统保存对话框");}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(result!=RESULT_OK||data==null||data.getData()==null){
            if(request==WRITE_BACKUP){exportRequestedUnverified=null;exportRequestedReason=null;}
            return;
        }
        if(importInProgress)return;
        final Uri uri=data.getData();
        if(request==PICK_BACKUP){
            // JSON parsing of a 64MB backup can freeze Android's main thread: do it on IO.
            backupIo.execute(()->{
                try(java.io.InputStream in=getContentResolver().openInputStream(uri)){
                    if(in==null)throw new java.io.IOException("无法读取所选文件");
                    JSONObject parsed=NativeStoryRepository.parse(NativeStoryRepository.readBounded(in));
                    ui.post(()->confirmImport(parsed));
                }catch(Exception e){ui.post(()->showImportError("备份格式无法读取",e));}
            });
        }else if(request==WRITE_BACKUP){
            if(initialReadFailed || !loadedFromDisk){toast("原生库未读取成功，无法导出空白占位数据");return;}
            if(exportRequestedUnverified==null){toast("导出请求状态已丢失，请重新选择保存文件");return;}
            final boolean wasUnverified=exportRequestedUnverified;
            final String requestedReason=exportRequestedReason;
            exportRequestedUnverified=null;exportRequestedReason=null;
            captureEditorDraft();
            // Snapshot on UI thread; IO/pretty-print on independent backup executor.
            final String snapshot=library.toString();
            final android.content.SharedPreferences rescuePrefs=getPreferences(MODE_PRIVATE);
            final JSONObject allPending=new JSONObject();
            for(String k:pendingDraftKeys()){
                try{allPending.put(k,rescuePrefs.getString(k,""));}catch(JSONException ignored){}
            }
            final boolean hasPendingIme=allPending.length()>0;
            final boolean currentlyUnverified=storageBlocked || diskWriteFailed.get() || editRevision>persistedRevision || hasPendingIme;
            if(!wasUnverified && currentlyUnverified){
                try{android.provider.DocumentsContract.deleteDocument(getContentResolver(),uri);}
                catch(Exception ignored){ /* Some document providers do not support deletion. */ }
                toast("备份状态已变化；请重新导出。如有空白文件请手动删除");return;
            }
            final boolean unverified=wasUnverified || currentlyUnverified;
            final String reason=currentlyUnverified?
                (diskWriteFailed.get()?"disk_write_failed":
                    (storageBlocked?"storage_blocked":
                        (hasPendingIme?"pending_ime":"pending_unsaved_revision"))):
                (unverified?requestedReason:"verified");
            final long revision=editRevision;
            final String exportChapterId=editorChapterId;
            backupIo.execute(()->{
                try(OutputStream out=getContentResolver().openOutputStream(uri)){
                    if(out==null)throw new java.io.IOException("无法写入文件");
                    JSONObject copy=new JSONObject(snapshot);
                    JSONObject meta=new JSONObject();
                    meta.put("unverified",unverified);
                    meta.put("reason",reason);
                    meta.put("memoryRevision",revision);
                    meta.put("exportedAt",System.currentTimeMillis());
                    // The pending candidate is metadata only: never append it to the story.
                    if(hasPendingIme)meta.put("pendingIme",allPending);
                    copy.put("_recovery",meta);
                    out.write(copy.toString(2).getBytes(StandardCharsets.UTF_8));out.flush();
                    ui.post(()->toast(unverified?"抢救备份已导出（UNVERIFIED）":"备份已导出"));
                }catch(Exception e){ui.post(()->showImportError("导出失败",e));}
            });
        }
    }

}
