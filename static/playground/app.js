(function () {
  const app = document.getElementById('app');
  const frameworks = window.FRAMEWORKS || {};
  const examples = (window.COUNTER_EXAMPLES || []).map((item) => ({
    ...item,
    title: { ...item.title },
    description: { ...item.description },
    code: { ...item.code }
  }));

  const state = {
    examples,
    selectedId: examples[0]?.id,
    activeTabs: {}
  };

  const h = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };

  const ensureActiveTab = (example) => {
    const keys = Object.keys(example.code);
    if (!keys.length) return null;
    if (!state.activeTabs[example.id] || !keys.includes(state.activeTabs[example.id])) {
      state.activeTabs[example.id] = keys[0];
    }
    return state.activeTabs[example.id];
  };

  function renderFrameworkTabs(example, container) {
    container.innerHTML = '';
    const keys = Object.keys(example.code);
    if (!keys.length) {
      container.appendChild(h('p', 'muted', 'لا توجد أكواد مضافة بعد. أضف إطار عمل للبدء.'));
      return;
    }

    const tabs = h('div', 'tab-row');
    const active = ensureActiveTab(example);

    keys.forEach((key) => {
      const tab = h('button', `tab ${active === key ? 'tab-active' : ''}`, frameworks[key]?.name?.ar || frameworks[key]?.name?.en || key);
      tab.addEventListener('click', () => {
        state.activeTabs[example.id] = key;
        render();
      });
      tabs.appendChild(tab);
    });

    const editor = h('textarea', 'code-input');
    editor.value = example.code[active];
    editor.addEventListener('input', (e) => {
      example.code[active] = e.target.value;
      renderPreview();
    });

    const meta = h('div', 'code-meta');
    const lang = frameworks[active]?.lang || 'javascript';
    meta.textContent = `Language: ${lang}`;

    container.appendChild(tabs);
    container.appendChild(meta);
    container.appendChild(editor);
  }

  function buildFrameworkOptions(example) {
    const used = new Set(Object.keys(example.code));
    return Object.entries(frameworks)
      .filter(([key]) => !used.has(key))
      .map(([key, meta]) => ({ key, label: meta.name?.ar || meta.name?.en || key }));
  }

  function renderAddFramework(example, container) {
    container.innerHTML = '';
    const options = buildFrameworkOptions(example);
    if (!options.length) {
      container.appendChild(h('p', 'muted', 'كل الأطر المتاحة مستخدمة في هذا المثال.'));
      return;
    }

    const wrapper = h('div', 'add-framework');
    const select = h('select', 'add-select');
    options.forEach(({ key, label }) => {
      const opt = h('option');
      opt.value = key;
      opt.textContent = label;
      select.appendChild(opt);
    });

    const textarea = h('textarea', 'code-input');
    textarea.placeholder = 'ألصق كود الإطار الجديد هنا';

    const addBtn = h('button', 'primary');
    addBtn.textContent = 'إضافة كود إطار جديد';
    addBtn.addEventListener('click', () => {
      const key = select.value;
      if (!key) return;
      example.code[key] = textarea.value || '// TODO: Add code';
      state.activeTabs[example.id] = key;
      render();
      renderPreview();
    });

    wrapper.appendChild(select);
    wrapper.appendChild(addBtn);
    container.appendChild(wrapper);
    container.appendChild(textarea);
  }

  function renderPreview() {
    const preview = document.getElementById('json-preview');
    if (!preview) return;
    const cleaned = state.examples.map((ex) => ({
      id: ex.id,
      title: ex.title,
      description: ex.description,
      category: ex.category,
      code: ex.code
    }));
    preview.value = JSON.stringify(cleaned, null, 2);
  }

  function renderExampleList(container) {
    container.innerHTML = '';
    state.examples.forEach((example) => {
      const card = h('button', `example-card ${state.selectedId === example.id ? 'active' : ''}`);
      card.appendChild(h('p', 'example-kicker', example.category || 'counter'));
      card.appendChild(h('h3', '', example.title?.ar || example.title?.en || example.id));
      card.appendChild(h('p', 'muted', example.description?.ar || example.description?.en || ''));
      card.addEventListener('click', () => {
        state.selectedId = example.id;
        render();
      });
      container.appendChild(card);
    });
  }

  function renderEditor(container) {
    container.innerHTML = '';
    const example = state.examples.find((e) => e.id === state.selectedId);
    if (!example) {
      container.appendChild(h('p', 'muted', 'لا يوجد مثال محدد.'));
      return;
    }

    const title = h('div', 'panel');
    title.appendChild(h('p', 'eyebrow', 'بيانات عامة'));

    const fieldGrid = h('div', 'field-grid');
    const descGrid = h('div', 'field-grid');

    const idInput = h('input');
    idInput.value = example.id;
    idInput.addEventListener('input', (e) => {
      example.id = e.target.value.trim();
      renderPreview();
    });

    const catInput = h('input');
    catInput.value = example.category || '';
    catInput.placeholder = 'state-management, async, a11y ...';
    catInput.addEventListener('input', (e) => {
      example.category = e.target.value;
      renderPreview();
    });

    const titleAr = h('input');
    titleAr.value = example.title?.ar || '';
    titleAr.addEventListener('input', (e) => {
      example.title.ar = e.target.value;
      renderPreview();
    });

    const titleEn = h('input');
    titleEn.value = example.title?.en || '';
    titleEn.addEventListener('input', (e) => {
      example.title.en = e.target.value;
      renderPreview();
    });

    const descAr = h('textarea', 'code-input');
    descAr.value = example.description?.ar || '';
    descAr.addEventListener('input', (e) => {
      example.description.ar = e.target.value;
      renderPreview();
    });

    const descEn = h('textarea', 'code-input');
    descEn.value = example.description?.en || '';
    descEn.addEventListener('input', (e) => {
      example.description.en = e.target.value;
      renderPreview();
    });

    fieldGrid.appendChild(labeled('المعرف', idInput));
    fieldGrid.appendChild(labeled('التصنيف', catInput));
    fieldGrid.appendChild(labeled('العنوان (AR)', titleAr));
    fieldGrid.appendChild(labeled('Title (EN)', titleEn));

    descGrid.appendChild(labeled('الوصف (AR)', descAr));
    descGrid.appendChild(labeled('Description (EN)', descEn));

    title.appendChild(fieldGrid);
    title.appendChild(descGrid);

    const codePanel = h('div', 'panel');
    codePanel.appendChild(h('p', 'eyebrow', 'الأكواد حسب الإطار'));

    const tabZone = h('div');
    renderFrameworkTabs(example, tabZone);

    const addZone = h('div', 'add-zone');
    addZone.appendChild(h('p', 'eyebrow', 'إضافة إطار عمل جديد'));
    renderAddFramework(example, addZone);

    codePanel.appendChild(tabZone);
    codePanel.appendChild(addZone);

    container.appendChild(title);
    container.appendChild(codePanel);
  }

  function labeled(label, control) {
    const wrapper = h('label', 'field');
    const span = h('span', 'field-label', label);
    wrapper.appendChild(span);
    wrapper.appendChild(control);
    return wrapper;
  }

  function render() {
    if (!app) return;
    app.innerHTML = '';

    const hero = h('section', 'hero');
    hero.appendChild(h('p', 'eyebrow', 'Playground — Counter Library'));
    hero.appendChild(h('h1', '', 'مكتبة أمثلة العدادات'));
    hero.appendChild(
      h(
        'p',
        'muted',
        'اختر الإطار، عدل الأكواد بحرية، وأضف تبويبات جديدة مباشرةً من بيانات JSON بلا حاجة لتعديل يدوي.'
      )
    );

    const layout = h('div', 'layout');
    const listCol = h('div', 'list-col');
    const editorCol = h('div', 'editor-col');

    renderExampleList(listCol);
    renderEditor(editorCol);

    layout.appendChild(listCol);
    layout.appendChild(editorCol);

    const previewPanel = h('div', 'panel');
    previewPanel.appendChild(h('p', 'eyebrow', 'JSON الناتج'));
    const previewArea = h('textarea', 'preview');
    previewArea.id = 'json-preview';
    previewArea.readOnly = true;
    previewPanel.appendChild(previewArea);

    app.appendChild(hero);
    app.appendChild(layout);
    app.appendChild(previewPanel);

    renderPreview();
  }

  render();
})();
