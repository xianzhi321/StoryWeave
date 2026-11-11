(() => {
  'use strict';
  const Core = window.StoryWeaveWritingPrompts;
  const editorText = text => text.replace(/\r\n?/g,'\n');
  function manuscriptOffset(text,index) {
    let offset = index;
    for (const match of text.matchAll(/\r\n/g)) {
      if (match.index>=offset) break;
      offset++;
    }
    return offset;
  }

  function openWritingAssist(requestedTask) {
    const work = project(), current = chapter(), editor = document.querySelector('#chapterText');
    if (!work || !current) return;
    const baseline = {title:current.title, text:current.text};
    const start = manuscriptOffset(baseline.text,editor?.selectionStart || 0);
    const end = manuscriptOffset(baseline.text,editor?.selectionEnd || 0);
    const selection = baseline.text.slice(start,end);
    const references = StoryWeaveWorkshop.aiReferences(work,current);
    const skills = state.skills.filter(skill => skill.status === 'ready');
    const recipes = (state.skillPresets || []).filter(inWorkshopScope);
    const options = [
      '<option value="none">不附带写作技能</option>',
      '<option value="all">从已审核技能中选择</option>',
      ...recipes.map(recipe => `<option value="preset:${esc(recipe.id)}">配方 · ${esc(recipe.name)}</option>`),
      ...skills.map(skill => `<option value="skill:${esc(skill.id)}">单项 · ${esc(skill.title)}</option>`)
    ].join('');
    const mainTasks = ['opening','continue','polish','review'];
    const taskCards = keys => keys.map(key => {
      const preset = Core.presets[key];
      return `<button type="button" data-sw15-task="${key}" aria-pressed="false">
        <strong>${preset.label}</strong><small>${preset.hint}</small></button>`;
    }).join('');
    const stillCurrent = () => state.selected === work.id && chapter()?.id === current.id &&
      chapter().title === baseline.title && chapter().text === baseline.text;
    modal('AI 写作协作', `<header class="sw15-ai-cover"><span class="sw15-kicker">叙境 · 写作工坊</span>
      <h3>这一段，想怎样推进？</h3><p>${esc(baseline.title || '未命名章节')} · ${selection.trim() ? '已选 ' + count(selection) + ' 字' : '当前没有选区'}</p></header>
      <fieldset class="sw15-controls">
      <legend>选择任务</legend><div class="sw15-task-grid">
      ${taskCards(mainTasks)}</div>
      <details class="sw15-details" id="sw34-more-tasks"><summary>更多任务</summary>
        <div class="sw15-task-grid">${taskCards(Object.keys(Core.presets).filter(key => !mainTasks.includes(key)))}</div>
      </details>
      <details class="sw15-details" id="sw15-prompt-settings"><summary>任务提示词与创作要求</summary>
        <div class="field"><label for="sw15-rule">本任务提示词</label><textarea id="sw15-rule" maxlength="1000"></textarea></div>
        <div class="sw15-actions"><button class="button outline" type="button" id="sw15-reset">填入内置提示词</button>
        <button class="button outline" type="button" id="sw15-save-rule">保存为本书常用</button></div>
        <div class="field"><label for="sw15-instructions">本次补充要求</label>
        <textarea id="sw15-instructions" maxlength="1800" placeholder="例如：保留末句，压短人物的解释"></textarea></div>
      </details>
      <details class="sw15-details"><summary>附带资料与技能</summary>
        <div class="field"><label for="sw8ActivePreset">写作技能</label><select id="sw8ActivePreset">${options}</select></div>
        <div id="sw34-skills" hidden>
          <p class="small-note" id="sw34-skills-summary" aria-live="polite"></p>
          <div class="sw34-skill-list" id="sw34-skill-list"></div>
        </div>
        ${references.html || '<p class="small-note">本章暂无关联资料或蓝图。</p>'}
      </details>
      <details class="sw15-details"><summary>查看将发送的内容</summary>
        <pre class="sw15-payload" id="sw15-payload"></pre>
      </details></fieldset>
      <div class="sw15-send"><p id="sw15-scope" role="status"></p><button class="button primary" id="sw8Ask">生成候选</button></div>
      <div id="sw8Answer" aria-live="polite"></div>`, root => {
      root.classList.add('sw15-ai-modal');
      const get = selector => root.querySelector(selector);
      const answer = get('#sw8Answer'), button = get('#sw8Ask'), rule = get('#sw15-rule');
      const instructions = get('#sw15-instructions'), skillSelect = get('#sw8ActivePreset');
      const controls = get('.sw15-controls'), scope = get('#sw15-scope');
      const skillPanel = get('#sw34-skills'), skillList = get('#sw34-skill-list'), skillSummary = get('#sw34-skills-summary');
      const saved = Core.cleanOverrides(work.writingPrompts);
      const drafts = {...saved};
      let task = requestedTask || (selection.trim() ? 'polish' : baseline.text.trim() ? 'continue' : 'opening');
      let busy = false;
      references.bind(root);
      const backdrop = root.closest('.modal-backdrop'), close = get('#modalClose');
      backdrop.addEventListener('click', event => {
        if (busy && event.target === backdrop) event.stopImmediatePropagation();
      }, true);

      function setBusy(value) {
        busy = value;
        controls.disabled = value;
        button.disabled = value;
        close.disabled = value;
      }
      function showSkillChoices() {
        const choice = skillSelect.value;
        skillList.dataset.choice = choice;
        const recipe = recipes.find(row => 'preset:' + row.id === choice);
        const keys = recipe ? recipe.skillIds : skills.filter(skill => choice === 'all' || choice === 'skill:' + skill.id).map(skill => skill.id);
        const ready = new Map(skills.map(skill => [skill.id, skill]));
        const choices = [...new Set(keys || [])].map(key => ready.get(key)).filter(Boolean);
        skillPanel.hidden = choice === 'none';
        skillList.innerHTML = choices.map(skill => `<label class="sw34-skill-row"><input type="checkbox" data-sw34-skill="${esc(skill.id)}" checked>
          <span><strong>${esc(skill.title)}</strong><small data-sw34-coverage></small></span></label>`).join('');
      }
      function build() {
        if (!stillCurrent()) throw Error('章节已变化，请重新打开 AI 协作。');
        const recipeId = skillSelect.value.startsWith('preset:') ? skillSelect.value.slice(7) : '';
        const recipe = recipeId && state.skillPresets?.find(row => row.id === recipeId && inWorkshopScope(row));
        if (recipeId && !recipe) throw Error('配方已删除或移出本书，请重新选择。');
        if (recipe && JSON.stringify(recipe.skillIds) !== JSON.stringify(recipes.find(row => row.id === recipeId)?.skillIds)) {
          throw Error('配方已变化，请重新打开 AI 协作。');
        }
        const fields = [...skillList.querySelectorAll('[data-sw34-skill]')];
        const ready = new Map(state.skills.filter(skill => skill.status === 'ready').map(skill => [skill.id,skill]));
        const chosen = fields.filter(field => field.checked).map(field => ready.get(field.dataset.sw34Skill))
          .filter(skill => skill && (!recipe || recipe.skillIds?.includes(skill.id)));
        const missing = recipe ? [...new Set(recipe.skillIds || [])].filter(key => !ready.has(key)).length : 0;
        const people = characters().map(person => [person.name,person.role,person.personality].filter(Boolean).join(' · ')).join('\n');
        const input = {
          task, title:baseline.title, text:baseline.text, selection,
          rule:rule.value.trim() || Core.presets[task].rule, instructions:instructions.value.trim(),
          excerpt:references.read(root), skills:chosen, book:work.title, summary:work.summary, people
        };
        const payload = Core.build(input, swLocalMode() ? swLocalContextLimit() : 22000);
        const included = payload.coverage.filter(row => row.included).length;
        const shortened = payload.coverage.filter(row => !row.included || row.included < row.total || row.descriptionOmitted).length;
        const unavailable = Math.max(missing,fields.filter(field => !ready.has(field.dataset.sw34Skill) ||
          (recipe && !recipe.skillIds?.includes(field.dataset.sw34Skill))).length);
        const blocked = skillSelect.value !== 'none' && !included && (!fields.length || fields.some(field => field.checked));
        return {...payload,included,shortened,unavailable,blocked};
      }
      function refresh() {
        if (busy) return;
        const provider = swLocalMode() ? '本机模型' : '已配置的云端模型';
        try {
          const payload = build();
          get('#sw15-payload').textContent = '系统提示词\n' + payload.system + '\n\n本次输入\n' + payload.user;
          const warning = payload.blocked ? '所选技能没有可发送的内容。请减少资料、换一组技能，或选择不附带技能。' : '';
          const note = payload.shortened || payload.unavailable ? ' · 有技能内容未发送' : '';
          scope.textContent = warning || provider + ' · ' + payload.scope + ' · ' + payload.user.length + ' 字符' + note;
          skillSummary.textContent = `发送 ${payload.included} 项技能` +
            (payload.shortened ? ` · ${payload.shortened} 项规则或说明未全部纳入` : '') +
            (payload.unavailable ? ` · ${payload.unavailable} 项不可用` : '');
          const coverage = new Map(payload.coverage.map(row => [row.id,row]));
          skillList.querySelectorAll('[data-sw34-skill]').forEach(field => {
            const row = coverage.get(field.dataset.sw34Skill);
            const detail = field.closest('label').querySelector('[data-sw34-coverage]');
            detail.textContent = !field.checked ? '本次停用' : !row ? '技能不可用' : !row.total ? '没有可用的规则或说明' :
              `发送 ${row.included} / ${row.total} 条${row.descriptionOmitted ? ' · 说明未纳入' : ''}`;
          });
          button.disabled = payload.blocked;
        } catch (error) {
          get('#sw15-payload').textContent = error.message;
          skillSummary.textContent = '请先处理发送栏里的提示。';
          skillList.querySelectorAll('[data-sw34-coverage]').forEach(detail => {detail.textContent = '';});
          scope.textContent = error.message;
          button.disabled = true;
        }
      }
      function selectTask(next) {
        task = next;
        if (!mainTasks.includes(task)) get('#sw34-more-tasks').open = true;
        instructions.placeholder = task === 'opening' ? '例如：一个失约的人，入夜后走过河堤' : '例如：保留末句，压短人物的解释';
        rule.value = drafts[task] ?? Core.presets[task].rule;
        for (const item of root.querySelectorAll('[data-sw15-task]')) {
          item.setAttribute('aria-pressed', String(item.dataset.sw15Task === task));
        }
        refresh();
      }
      for (const item of root.querySelectorAll('[data-sw15-task]')) {
        item.onclick = () => {
          drafts[task] = rule.value;
          selectTask(item.dataset.sw15Task);
        };
      }
      controls.addEventListener('input', refresh);
      controls.addEventListener('change', refresh);
      skillSelect.addEventListener('input',showSkillChoices);
      skillSelect.addEventListener('change',()=>{
        if (skillList.dataset.choice !== skillSelect.value) showSkillChoices();
      });
      get('#sw15-reset').onclick = () => {rule.value = Core.presets[task].rule; refresh();};
      get('#sw15-save-rule').onclick = async () => {
        if (busy) return;
        setBusy(true);
        try {
          const changes = Core.cleanOverrides({[task]:rule.value});
          await StoryWeaveWorkspace.transact(next => {
            if (next.selected !== work.id) throw Error('作品已切换');
            next.projects = next.projects.map(row => {
              if (row.id !== work.id) return row;
              const writingPrompts = Core.cleanOverrides(row.writingPrompts);
              delete writingPrompts[task];
              return {...row, writingPrompts:{...writingPrompts,...changes}};
            });
          });
          render();
          toast('本书提示词已保存');
        } catch (error) {
          toast('保存失败：' + error.message);
        } finally {
          setBusy(false);
          refresh();
        }
      };
      function showResult(reply, preset) {
        const canApply = preset.output !== 'notes';
        answer.innerHTML = `<section class="sw15-result">
          <header><span class="sw15-kicker">作者审阅</span><h3>${preset.label}候选</h3></header>
          <div class="sw15-comparison">
          ${preset.output === 'replace' ? `<div><strong>原选区</strong><pre>${esc(selection)}</pre></div>` : ''}
          <div><label for="sw15-candidate">${canApply ? '候选正文，可先编辑' : '建议，可复制'}</label>
          <textarea id="sw15-candidate" ${canApply ? '' : 'readonly'}></textarea></div></div>
          ${preset.output === 'replace' ? `<details class="sw15-details" id="sw33-review">
            <summary>逐处采用改动</summary>
            <p class="small-note">勾选要采用的改动，其他文字保留原稿。</p>
            <div class="sw15-actions"><button class="button outline" id="sw33-select-all">全选</button><button class="button outline" id="sw33-clear">清空</button></div>
            <p class="small-note" id="sw33-count" role="status"></p><div id="sw33-changes"></div>
          </details>` : ''}
          <div class="sw15-actions"><button class="button outline" id="sw8CopyAnswer">复制</button>
          ${canApply ? `<button class="button primary" id="sw15-apply">${preset.output === 'replace' ? '采用并替换选区' : '采用并追加到章末'}</button>` : ''}</div>
          <p class="small-note" id="sw15-result-status"></p></section>`;
        const candidate = get('#sw15-candidate'), apply = get('#sw15-apply');
        candidate.value = reply;
        get('#sw8CopyAnswer').onclick = async () => {
          try {await navigator.clipboard.writeText(candidate.value);toast('已复制');}
          catch (_) {candidate.focus();candidate.select();toast('请使用复制快捷键或长按复制');}
        };
        if (!apply) return;
        const review = get('#sw33-review'), checked = new Set();
        const replacementText = () => {
          const text = candidate.value.trim();
          return selection.includes('\r\n')&&!selection.replace(/\r\n/g,'').includes('\n') ? text.replace(/\n/g,'\r\n') : text;
        };
        let diff;
        function updateReview() {
          const count = diff?.blocks.length || 0;
          get('#sw33-count').textContent = count ? `已选 ${checked.size} / ${count} 处${diff.coarse?' · 大范围改动已合并':''}` : '没有改动。';
          apply.disabled = busy || (review.open && !checked.size);
          apply.textContent = review.open ? '采用所选改动' : '采用并替换选区';
          get('#sw33-select-all').disabled = checked.size===count;
          get('#sw33-clear').disabled = !checked.size;
        }
        function showChanges() {
          const list = get('#sw33-changes');
          list.innerHTML = diff.blocks.map(([a,b,c,d],index) => {
            const old = diff.left.slice(a,b).join(''), next = diff.right.slice(c,d).join('');
            const left = diff.left.slice(Math.max(0,a-5),a).join('').slice(-24);
            const right = diff.left.slice(b,b+5).join('').slice(0,24);
            return `<label class="sw33-change">
              <span><input type="checkbox" data-sw33-block="${index}" ${checked.has(index)?'checked':''}> 第 ${index+1} 处${left||right?` · ${esc(left)}…${esc(right)}`:''}</span>
              <span class="sw33-before"><strong>原文</strong> ${esc(old || '（新增处）')}</span>
              <span class="sw33-after"><strong>候选</strong> ${esc(next || '（删除这处）')}</span>
            </label>`;
          }).join('');
          updateReview();
        }
        let reviewedCandidate;
        function refreshDiff() {
          if (!review?.open) return;
          const text = replacementText();
          if (text===reviewedCandidate) {updateReview();return;}
          reviewedCandidate = text;
          checked.clear();
          diff = text ? StoryWeaveEditor.revisionDiff(selection,text) : {blocks:[]};
          showChanges();
        }
        if (review) {
          review.ontoggle = () => {if(review.open)refreshDiff();else updateReview();};
          candidate.oninput = refreshDiff;
          get('#sw33-changes').onchange = event => {
            const field = event.target.closest('[data-sw33-block]');
            if(!field || busy)return;
            const index = Number(field.dataset.sw33Block);
            if(field.checked)checked.add(index);else checked.delete(index);
            updateReview();
          };
          get('#sw33-select-all').onclick = () => {
            if(busy)return;
            refreshDiff();
            diff?.blocks.forEach((_row,index)=>checked.add(index));
            if(diff)showChanges();
          };
          get('#sw33-clear').onclick = () => {if(!busy&&diff){checked.clear();showChanges();}};
        }
        function selectedReplacement() {
          const parts = [];
          let from = 0;
          diff.blocks.forEach(([a,b,c,d],index) => {
            parts.push(...diff.left.slice(from,a));
            parts.push(...(checked.has(index)?diff.right.slice(c,d):diff.left.slice(a,b)));
            from = b;
          });
          parts.push(...diff.left.slice(from));
          return parts.join('');
        }
        apply.onclick = async () => {
          if (busy) return;
          const message = get('#sw15-result-status');
          const replacing = preset.output === 'replace';
          const partial = Boolean(review?.open);
          if (partial) {
            refreshDiff();
            if (!checked.size) {message.textContent = '请先勾选要采用的改动。';return;}
          }
          const text = partial ? selectedReplacement() : replacing ? replacementText() : candidate.value.trim();
          if (!partial && !text) {message.textContent = '候选正文为空。';return;}
          if (!stillCurrent()) {message.textContent = '原稿已变化，请重新生成候选。';return;}
          const added = replacing ? text : (baseline.text.trimEnd() ? '\n\n' : '') + text;
          const position = replacing ? start : baseline.text.length;
          const updated = baseline.text.slice(0,position) + added + (replacing ? baseline.text.slice(end) : '');
          if (updated === baseline.text) {message.textContent = '候选内容与原文相同。';return;}
          setBusy(true);
          apply.disabled = true;
          const editable = [candidate,...(review?.querySelectorAll('input,button') || [])].filter(control=>!control.disabled);
          editable.forEach(control=>control.disabled=true);
          try {
            await StoryWeaveEditor.commitChapterEdit(current.id,updated,baseline.title,'采用 AI 候选前');
            closeModal();
            render();
            const input = document.querySelector('#chapterText');
            if(input) {
              const first = editorText(baseline.text.slice(0,position)).length;
              input.focus({preventScroll:true});
              StoryWeaveDesk.revealSelection(input,first,first+editorText(added).length);
            }
            toast('已采用候选，原稿已保留在历史版本');
          } catch (error) {
            message.textContent = '保存失败：' + error.message;
          } finally {
            setBusy(false);
            apply.disabled = false;
            editable.forEach(control=>control.disabled=false);
            if (root.isConnected) {if(review)updateReview();refresh();}
          }
        };
      }
      button.onclick = async () => {
        if (busy) return;
        let payload;
        try {payload = build();}
        catch (error) {scope.textContent = error.message;return;}
        if (payload.blocked) {refresh();return;}
        const preset = Core.presets[task];
        setBusy(true);
        close.disabled = false;
        answer.textContent = '正在生成候选…';
        try {
          const reply = await chatAPI(payload.system,payload.user,1200);
          if (!root.isConnected) return;
          if (!stillCurrent()) {answer.textContent = '原稿已变化，请重新打开 AI 协作。';return;}
          if (typeof reply !== 'string' || !reply.trim()) throw Error('模型返回了空白内容');
          showResult(reply.trim(),preset);
        } catch (error) {
          if (root.isConnected) answer.textContent = '生成失败：' + error.message;
        } finally {
          if (root.isConnected) {setBusy(false);refresh();}
        }
      };
      selectTask(task);
      if (task === 'opening') get('#sw15-prompt-settings').open = true;
    });
  }
  openAiAssist = openWritingAssist;
  // The visual viewport contracts when a phone's keyboard covers the page.
  if (window.visualViewport) {
    const viewport = window.visualViewport;
    let pendingFrame = 0, lastHeight = '', lastTop = '';
    const updateViewport = () => {
      pendingFrame = 0;
      const style = document.documentElement.style;
      const atNormalScale = Math.abs(viewport.scale - 1) <= 0.01;
      const height = atNormalScale ? Math.round(viewport.height) + 'px' : '';
      const top = atNormalScale ? Math.max(0, Math.round(viewport.offsetTop)) + 'px' : '';
      if (height !== lastHeight) style.setProperty('--sw15-visible-height',lastHeight = height);
      if (top !== lastTop) style.setProperty('--sw15-visible-top',lastTop = top);
    };
    const scheduleViewport = () => {
      if (!pendingFrame) pendingFrame = requestAnimationFrame(updateViewport);
    };
    viewport.addEventListener('resize',scheduleViewport);
    viewport.addEventListener('scroll',scheduleViewport);
    updateViewport();
  }
  const priorNormalize = normalizeBackup;
  normalizeBackup = function (data) {
    const clean = priorNormalize(data);
    return {...clean, projects:clean.projects.map(work => ({
      ...work, writingPrompts:Core.cleanOverrides(work.writingPrompts)
    })), version:15};
  };
})();
