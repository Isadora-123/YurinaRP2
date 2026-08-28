// app.js — Frontend Application Engine for Lorebook & World State Control Center
// Standardized in 100% English

(function () {
  'use strict';

  // State Management
  const state = {
    authKey: localStorage.getItem('CLIENT_AUTH_KEY') || '',
    lorebookStore: { lorebooks: [] },
    systemPromptStore: { system_prompt: '', features: { fixFormat: true, autoLineBreak: true }, shorter_rules: [], keyremind_rules: [], trigger_rules: [] },
    selectedLbId: null,
    selectedLoreId: null,
    selectedSpItem: 'sp_base',
    currentSubTab: 'definition',
    collapsedLbIds: new Set(JSON.parse(localStorage.getItem('yuri_collapsed_lbs') || '[]')),
    collapsedGroupKeys: new Set(JSON.parse(localStorage.getItem('yuri_collapsed_groups') || '[]')),
    treeScrollTop: 0,
    modelConfig: { fallback_enabled: false, fallback_models: [] },
    modelTestResults: {},
    currentChatMessages: [],
    currentChatContext: ''
  };

  function saveCollapsedStates() {
    localStorage.setItem('yuri_collapsed_lbs', JSON.stringify(Array.from(state.collapsedLbIds)));
    localStorage.setItem('yuri_collapsed_groups', JSON.stringify(Array.from(state.collapsedGroupKeys)));
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // DOM Elements
  const el = {
    // Navigation
    navButtons: document.querySelectorAll('[data-tab]'),
    tabPages: document.querySelectorAll('.tab-page'),
    pageTitle: document.getElementById('pageTitle'),
    mobileNavToggle: document.getElementById('mobileNavToggle'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    sidebar: document.querySelector('.sidebar'),

    // Global Buttons
    btnSaveStore: document.getElementById('btnSaveStore'),
    btnExportDb: document.getElementById('btnExportDb'),
    btnImportDb: document.getElementById('btnImportDb'),
    btnAddLorebook: document.getElementById('btnAddLorebook'),

    // Tree
    treeContainer: document.getElementById('treeContainer'),

    // System Prompt Elements
    spTreeContainer: document.getElementById('spTreeContainer'),
    btnAddSpRule: document.getElementById('btnAddSpRule'),
    spBaseView: document.getElementById('spBaseView'),
    spFeaturesView: document.getElementById('spFeaturesView'),
    spRuleEditorView: document.getElementById('spRuleEditorView'),

    // Model Config Elements
    mcFallbackToggle: document.getElementById('mcFallbackToggle'),
    mcThinkingStartTag: document.getElementById('mcThinkingStartTag'),
    mcThinkingEndTag: document.getElementById('mcThinkingEndTag'),
    mcModelRegistry: document.getElementById('mcModelRegistry'),
    mcModelList: document.getElementById('mcModelList'),
    mcAddModelId: document.getElementById('mcAddModelId'),
    mcAddModelLabel: document.getElementById('mcAddModelLabel'),
    btnMcAddModel: document.getElementById('btnMcAddModel'),
    btnMcSave: document.getElementById('btnMcSave'),
    btnMcTestAll: document.getElementById('btnMcTestAll'),
    spEmptyView: document.getElementById('spEmptyView'),

    spBasePromptInput: document.getElementById('spBasePromptInput'),
    btnSaveSpBase: document.getElementById('btnSaveSpBase'),

    spToggleFixFormat: document.getElementById('spToggleFixFormat'),
    spToggleAutoLineBreak: document.getElementById('spToggleAutoLineBreak'),
    btnSaveSpFeatures: document.getElementById('btnSaveSpFeatures'),

    spRuleTitle: document.getElementById('spRuleTitle'),
    spRuleSubtitle: document.getElementById('spRuleSubtitle'),
    spRuleEnabledCheckbox: document.getElementById('spRuleEnabledCheckbox'),
    spRuleNameInput: document.getElementById('spRuleNameInput'),
    spRuleTypeSelect: document.getElementById('spRuleTypeSelect'),

    spParamsShorter: document.getElementById('spParamsShorter'),
    spParamsKeyremind: document.getElementById('spParamsKeyremind'),
    spParamsTrigger: document.getElementById('spParamsTrigger'),

    spParamMaxLength: document.getElementById('spParamMaxLength'),
    spParamKey: document.getElementById('spParamKey'),
    spParamKeywords: document.getElementById('spParamKeywords'),
    spParamDepth: document.getElementById('spParamDepth'),
    spParamInsertion: document.getElementById('spParamInsertion'),

    spRulePromptInput: document.getElementById('spRulePromptInput'),
    btnSaveSpRule: document.getElementById('btnSaveSpRule'),
    btnDeleteSpRule: document.getElementById('btnDeleteSpRule'),

    // Views
    lorebookEditorView: document.getElementById('lorebookEditorView'),
    loreEditorView: document.getElementById('loreEditorView'),
    emptyEditorView: document.getElementById('emptyEditorView'),

    // Lorebook Form
    lbEditTitle: document.getElementById('lbEditTitle'),
    lbStatusSelect: document.getElementById('lbStatusSelect'),
    lbNameInput: document.getElementById('lbNameInput'),
    lbInsertionSelect: document.getElementById('lbInsertionSelect'),
    lbDescInput: document.getElementById('lbDescInput'),
    lbPatternsInput: document.getElementById('lbPatternsInput'),
    lbDepthInput: document.getElementById('lbDepthInput'),
    lbIncludeWorldState: document.getElementById('lbIncludeWorldState'),
    btnSaveLbSettings: document.getElementById('btnSaveLbSettings'),
    btnAddLoreUnderLb: document.getElementById('btnAddLoreUnderLb'),
    btnDeleteLorebook: document.getElementById('btnDeleteLorebook'),

    // Lore Form
    loreEditTitle: document.getElementById('loreEditTitle'),
    loreEditSubtitle: document.getElementById('loreEditSubtitle'),
    loreGroupHeadCheckbox: document.getElementById('loreGroupHeadCheckbox'),
    loreNameInput: document.getElementById('loreNameInput'),
    loreGroupInput: document.getElementById('loreGroupInput'),
    loreKeywordsInput: document.getElementById('loreKeywordsInput'),
    loreRateInput: document.getElementById('loreRateInput'),
    subTabs: document.querySelectorAll('.sub-tab'),
    subTabContents: document.querySelectorAll('.sub-tab-content'),
    loreDefInput: document.getElementById('loreDefInput'),
    btnAddInfraItem: document.getElementById('btnAddInfraItem'),
    infraTableBody: document.getElementById('infraTableBody'),
    btnAddCatalogItem: document.getElementById('btnAddCatalogItem'),
    catalogTableBody: document.getElementById('catalogTableBody'),
    catalogCalcPreview: document.getElementById('catalogCalcPreview'),
    btnAddStaffRow: document.getElementById('btnAddStaffRow'),
    staffKvContainer: document.getElementById('staffKvContainer'),
    btnAddPolicyRow: document.getElementById('btnAddPolicyRow'),
    policyKvContainer: document.getElementById('policyKvContainer'),
    btnAddCustomRow: document.getElementById('btnAddCustomRow'),
    customKvContainer: document.getElementById('customKvContainer'),
    btnSaveLoreEntry: document.getElementById('btnSaveLoreEntry'),
    btnDeleteLoreEntry: document.getElementById('btnDeleteLoreEntry'),

    // Simulator
    simSampleText: document.getElementById('simSampleText'),
    btnRunSimulation: document.getElementById('btnRunSimulation'),
    simCompiledOutput: document.getElementById('simCompiledOutput'),
    simOutDay: document.getElementById('simOutDay'),
    simOutCount: document.getElementById('simOutCount'),
    simOutTarget: document.getElementById('simOutTarget'),
    btnCopyCompiledPrompt: document.getElementById('btnCopyCompiledPrompt'),

    // Auth & Logs
    btnAuthSettings: document.getElementById('btnAuthSettings'),
    authStatusText: document.getElementById('authStatusText'),
    authModal: document.getElementById('authModal'),
    authForm: document.getElementById('authForm'),
    inputAuthKeyModal: document.getElementById('inputAuthKeyModal'),
    btnToggleAuthVisibilityModal: document.getElementById('btnToggleAuthVisibilityModal'),
    authErrorMessage: document.getElementById('authErrorMessage'),
    btnSubmitAuth: document.getElementById('btnSubmitAuth'),
    inputAuthKey: document.getElementById('inputAuthKey'),
    btnToggleAuthVisibility: document.getElementById('btnToggleAuthVisibility'),
    btnSaveAuthKey: document.getElementById('btnSaveAuthKey'),
    logConsole: document.getElementById('logConsole'),

    // Modal
    jsonModal: document.getElementById('jsonModal'),
    modalTitle: document.getElementById('modalTitle'),
    jsonModalArea: document.getElementById('jsonModalArea'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    btnSubmitModalJson: document.getElementById('btnSubmitModalJson'),

    // Chat History, Context & Summary
    chatContextInput: document.getElementById('chatContextInput'),
    contextCharBadge: document.getElementById('contextCharBadge'),
    btnCopyContext: document.getElementById('btnCopyContext'),
    btnSaveContext: document.getElementById('btnSaveContext'),
    historyMsgBadge: document.getElementById('historyMsgBadge'),
    btnCopyAllHistory: document.getElementById('btnCopyAllHistory'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    chatHistoryContainer: document.getElementById('chatHistoryContainer'),
    btnRefreshHistory: document.getElementById('btnRefreshHistory'),
    summaryResult: document.getElementById('summaryResult'),
    summaryResultBox: document.getElementById('summaryResultBox'),
    summaryPrompt: document.getElementById('summaryPrompt'),
    summaryModel: document.getElementById('summaryModel'),
    btnGenerateSummary: document.getElementById('btnGenerateSummary'),
    btnCopySummary: document.getElementById('btnCopySummary')
  };

  // Helper Functions
  function log(msg, type = 'info') {
    if (!el.logConsole) return;
    const div = document.createElement('div');
    div.className = `log-entry ${type}`;
    const timestamp = new Date().toLocaleTimeString();
    div.textContent = `[${timestamp}] ${msg}`;
    el.logConsole.appendChild(div);
    el.logConsole.scrollTop = el.logConsole.scrollHeight;
  }

  function generateId(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
  }

  function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (state.authKey) {
      headers['Authorization'] = `Bearer ${state.authKey}`;
    }
    return headers;
  }

  // --- TAB NAVIGATION ---
  function switchTab(tabId) {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    el.tabPages.forEach(page => {
      page.classList.toggle('active', page.id === `page-${tabId}`);
    });
    if (el.pageTitle) {
      const titles = {
        lorebooks: 'Lorebook Database Management',
        systemprompt: 'Prompt & Rules',
        simulator: 'Context Simulation & Dry-Run Engine',
        worldstate: 'World State & Financial Ledger',
        settings: 'Authentication & System Audit Log',
        chathistory: 'Chat History & Conversation Summary',
        modelconfig: 'Model Configuration & Fallback Chain'
      };
      el.pageTitle.textContent = titles[tabId] || 'Control Center';
    }
    if (tabId === 'chathistory') {
      loadChatHistory();
      loadChatSummary();
    }
    if (tabId === 'modelconfig') {
      loadModelConfig();
    }

    if (window.innerWidth <= 768 && el.sidebar) {
      el.sidebar.classList.remove('open');
      if (el.sidebarBackdrop) el.sidebarBackdrop.classList.remove('show');
    }
  }

  // --- API CALLS & AUTHENTICATION ---
  async function verifyAuthKey(candidateKey) {
    try {
      const headers = {};
      if (candidateKey) {
        headers['Authorization'] = `Bearer ${candidateKey}`;
      }
      const res = await fetch('/v1/auth/verify', { headers });
      const data = await res.json();

      if (res.status === 401) {
        log('CLIENT_AUTH_KEY not set on server environment variables.', 'warn');
        if (el.authStatusText) el.authStatusText.textContent = 'No Server Key';
        if (el.authModal) el.authModal.classList.add('hidden');
        return true;
      }

      if (res.ok) {
        state.authKey = candidateKey;
        localStorage.setItem('CLIENT_AUTH_KEY', candidateKey);
        if (el.authStatusText) el.authStatusText.textContent = 'Key Verified';
        if (el.authModal) el.authModal.classList.add('hidden');
        if (el.authErrorMessage) el.authErrorMessage.classList.add('hidden');
        log('CLIENT_AUTH_KEY verified successfully.', 'success');
        return true;
      } else {
        if (el.authStatusText) el.authStatusText.textContent = 'Auth Failed';
        if (el.authErrorMessage) {
          el.authErrorMessage.textContent = data.message || 'Invalid CLIENT_AUTH_KEY password!';
          el.authErrorMessage.classList.remove('hidden');
        }
        if (el.authModal) el.authModal.classList.remove('hidden');
        log(`Authentication failed: ${data.message}`, 'error');
        return false;
      }
    } catch (err) {
      log(`Auth verification error: ${err.message}`, 'error');
      if (el.authModal) el.authModal.classList.remove('hidden');
      return false;
    }
  }

  async function loadLorebookStore() {
    try {
      log('Fetching LorebookStore from server...', 'info');
      const res = await fetch('/v1/lorebooks', { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data && data.store && Array.isArray(data.store.lorebooks)) {
        state.lorebookStore = data.store;
        log(`Loaded ${state.lorebookStore.lorebooks.length} Lorebook(s) successfully.`, 'success');
      } else {
        log('Server returned empty store format.', 'warn');
      }
      renderHierarchyTree();
    } catch (err) {
      log(`Failed to fetch LorebookStore: ${err.message}`, 'error');
    }
  }

  async function loadSystemPromptStore() {
    try {
      log('Fetching SystemPromptStore from server...', 'info');
      const res = await fetch('/v1/system-prompt', { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (data && data.store) {
        state.systemPromptStore = data.store;
        log('Loaded System Prompt & Rules successfully.', 'success');
      }
      renderSystemPromptTree();
    } catch (err) {
      log(`Failed to fetch SystemPromptStore: ${err.message}`, 'error');
    }
  }

  async function saveSystemPromptStore() {
    try {
      log('Saving SystemPromptStore to Upstash...', 'info');
      const res = await fetch('/v1/system-prompt', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(state.systemPromptStore)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      log('System Prompt & Rules saved successfully to Upstash Redis!', 'success');
    } catch (err) {
      log(`Failed to save SystemPromptStore: ${err.message}`, 'error');
      alert(`Save failed: ${err.message}`);
    }
  }

  async function saveLorebookStore() {
    try {
      log('Saving LorebookStore to server...', 'info');
      const res = await fetch('/v1/lorebooks', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(state.lorebookStore)
      });
      if (!res.ok) throw new Error(`Save failed with HTTP ${res.status}`);
      const data = await res.json();
      log(data.message || 'LorebookStore saved successfully!', 'success');
    } catch (err) {
      log(`Save LorebookStore error: ${err.message}`, 'error');
    }
  }

  function addLoreUnderLb(lbId) {
    const lb = state.lorebookStore.lorebooks.find(b => b.id === lbId);
    if (!lb) return;

    const newLore = {
      id: generateId('lore'),
      name: 'New Lore Entry',
      group: 'General',
      is_group_head: false,
      trigger: {
        keywords: ['new lore'],
        trigger_rate: 100
      },
      prompt_area: {
        definition: 'Enter definition here...',
        catalog: [],
        staff: {},
        policy: {},
        custom_data: {}
      }
    };

    if (!Array.isArray(lb.lores)) lb.lores = [];
    lb.lores.push(newLore);
    state.collapsedLbIds.delete(lbId);
    saveCollapsedStates();
    selectLoreEntry(lb.id, newLore.id);
  }

  // --- TREE RENDERING (Discord Channel List Style) ---
  function buildFrontendLoreHierarchy(lores) {
    if (!Array.isArray(lores) || lores.length === 0) return { topLevelTree: [] };

    const loreMap = new Map();
    const nodeMap = new Map();

    lores.forEach(l => {
      if (l.id) loreMap.set(String(l.id).toLowerCase().trim(), l);
      if (l.name) loreMap.set(String(l.name).toLowerCase().trim(), l);

      nodeMap.set(l, {
        lore: l,
        children: [],
        parentNode: null
      });
    });

    const rootNodes = [];
    const flatGroupsMap = new Map();

    lores.forEach(l => {
      const node = nodeMap.get(l);
      const parentRef = (l.parent_id || l.parent_name || l.group || '').trim().toLowerCase();
      const parentLore = parentRef ? loreMap.get(parentRef) : null;

      if (parentLore && parentLore !== l) {
        const parentNode = nodeMap.get(parentLore);
        if (parentNode) {
          parentNode.children.push(node);
          node.parentNode = parentNode;
        } else {
          rootNodes.push(node);
        }
      } else {
        const grpName = l.group || 'General';
        if (!flatGroupsMap.has(grpName)) {
          flatGroupsMap.set(grpName, []);
        }
        flatGroupsMap.get(grpName).push(node);
      }
    });

    const topLevelTree = [];
    const processedLores = new Set();

    lores.forEach(l => {
      const node = nodeMap.get(l);
      if (!node.parentNode && !processedLores.has(l)) {
        const grpName = l.group || 'General';
        const isGroupALore = loreMap.has(grpName.toLowerCase().trim());

        if (!isGroupALore && flatGroupsMap.has(grpName)) {
          const groupNodes = flatGroupsMap.get(grpName).filter(n => !n.parentNode);
          if (groupNodes.length > 0) {
            topLevelTree.push({
              type: 'group',
              name: grpName,
              children: groupNodes
            });
            groupNodes.forEach(gn => processedLores.add(gn.lore));
          }
        } else {
          topLevelTree.push({
            type: 'lore',
            node
          });
          processedLores.add(l);
        }
      }
    });

    return { topLevelTree, nodeMap };
  }

  function renderTreeNodeDOM(lb, item, depth = 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node-wrapper';

    if (item.type === 'group') {
      const grpKey = `${lb.id}:grp:${item.name}`;
      const isGrpCollapsed = state.collapsedGroupKeys.has(grpKey);

      const grpHeader = document.createElement('div');
      grpHeader.className = `discord-group-header ${isGrpCollapsed ? 'collapsed' : ''}`;
      if (depth > 0) grpHeader.style.paddingLeft = `${12 + depth * 10}px`;

      grpHeader.innerHTML = `
        <i data-lucide="chevron-down" class="grp-chevron"></i>
        <i data-lucide="folder" class="grp-icon"></i>
        <span>${item.name} (${item.children.length})</span>
      `;

      grpHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.collapsedGroupKeys.has(grpKey)) {
          state.collapsedGroupKeys.delete(grpKey);
        } else {
          state.collapsedGroupKeys.add(grpKey);
        }
        saveCollapsedStates();
        renderHierarchyTree();
      });

      const grpChildren = document.createElement('div');
      grpChildren.className = `discord-group-children ${isGrpCollapsed ? 'collapsed' : ''}`;

      item.children.forEach(childNode => {
        grpChildren.appendChild(renderTreeNodeDOM(lb, { type: 'lore', node: childNode }, depth + 1));
      });

      wrapper.appendChild(grpHeader);
      wrapper.appendChild(grpChildren);
    } else if (item.type === 'lore') {
      const node = item.node;
      const lore = node.lore;
      const loreKey = `${lb.id}:lore:${lore.id}`;
      const hasChildren = node.children.length > 0;
      const isBranchCollapsed = state.collapsedGroupKeys.has(loreKey);
      const isLoreActive = state.selectedLoreId === lore.id;

      const loreItem = document.createElement('div');
      loreItem.className = `discord-channel-entry ${isBranchCollapsed ? 'collapsed' : ''} ${isLoreActive ? 'active' : ''}`;
      if (depth > 0) loreItem.style.paddingLeft = `${12 + depth * 12}px`;
      loreItem.dataset.lbid = lb.id;
      loreItem.dataset.loreid = lore.id;

      const chevronIcon = hasChildren
        ? `<i data-lucide="chevron-down" class="grp-chevron ${isBranchCollapsed ? 'collapsed' : ''}" style="margin-right: 4px;"></i>`
        : '';
      const typeIcon = hasChildren
        ? `<i data-lucide="folder" class="grp-icon" style="margin-right: 6px;"></i>`
        : `<i data-lucide="hash" class="channel-hash-icon"></i>`;

      const headBadge = lore.is_group_head ? `<i data-lucide="crown" class="group-head-crown" title="Group Head"></i>` : '';

      loreItem.innerHTML = `
        <div class="channel-title-group" style="display: flex; align-items: center; gap: 4px;">
          ${chevronIcon}
          ${typeIcon}
          <span class="channel-name">${lore.name || 'Untitled Lore'}</span>
          ${headBadge}
        </div>
      `;

      loreItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (hasChildren && e.target.closest('.grp-chevron')) {
          if (state.collapsedGroupKeys.has(loreKey)) {
            state.collapsedGroupKeys.delete(loreKey);
          } else {
            state.collapsedGroupKeys.add(loreKey);
          }
          saveCollapsedStates();
          renderHierarchyTree();
          return;
        }
        selectLoreEntry(lb.id, lore.id);
      });

      wrapper.appendChild(loreItem);

      if (hasChildren) {
        const branchChildren = document.createElement('div');
        branchChildren.className = `discord-group-children ${isBranchCollapsed ? 'collapsed' : ''}`;

        node.children.forEach(childNode => {
          branchChildren.appendChild(renderTreeNodeDOM(lb, { type: 'lore', node: childNode }, depth + 1));
        });

        wrapper.appendChild(branchChildren);
      }
    }

    return wrapper;
  }

  function renderHierarchyTree() {
    if (!el.treeContainer) return;
    
    // Save scroll position before DOM update
    state.treeScrollTop = el.treeContainer.scrollTop;
    el.treeContainer.innerHTML = '';

    const lorebooks = state.lorebookStore.lorebooks || [];

    if (lorebooks.length === 0) {
      el.treeContainer.innerHTML = `<div class="text-sub p-4 text-center">No lorebooks available. Click "+ New Book" to create one.</div>`;
      return;
    }

    lorebooks.forEach(lb => {
      const isLbCollapsed = state.collapsedLbIds.has(lb.id);
      const isLbActive = state.selectedLbId === lb.id && !state.selectedLoreId;

      const catNode = document.createElement('div');
      catNode.className = 'tree-cat-node';

      const badgeClass = `badge-status-${(lb.status || 'Active').toLowerCase()}`;

      catNode.innerHTML = `
        <div class="discord-cat-header ${isLbCollapsed ? 'collapsed' : ''} ${isLbActive ? 'active-cat' : ''}" data-lbid="${lb.id}">
          <div class="cat-title-left">
            <i data-lucide="chevron-down" class="cat-chevron"></i>
            <i data-lucide="book" class="cat-icon"></i>
            <span class="cat-name">${lb.name || 'Untitled Lorebook'}</span>
          </div>
          <div class="cat-right-actions">
            <span class="badge ${badgeClass}">${lb.status || 'Active'}</span>
            <button class="btn-cat-add" title="Add lore under ${lb.name}">
              <i data-lucide="plus"></i>
            </button>
          </div>
        </div>
      `;

      // Group Lores Container
      const loresGroup = document.createElement('div');
      loresGroup.className = `discord-lores-group ${isLbCollapsed ? 'collapsed' : ''}`;

      const { topLevelTree } = buildFrontendLoreHierarchy(lb.lores || []);

      topLevelTree.forEach(treeItem => {
        loresGroup.appendChild(renderTreeNodeDOM(lb, treeItem, 0));
      });

      // Category Header Event Listeners
      const catHeader = catNode.querySelector('.discord-cat-header');
      const btnAdd = catNode.querySelector('.btn-cat-add');

      if (btnAdd) {
        btnAdd.addEventListener('click', (e) => {
          e.stopPropagation();
          addLoreUnderLb(lb.id);
        });
      }

      catHeader.addEventListener('click', (e) => {
        if (e.target.closest('.btn-cat-add')) return;
        
        // Toggle collapse state
        if (state.collapsedLbIds.has(lb.id)) {
          state.collapsedLbIds.delete(lb.id);
        } else {
          state.collapsedLbIds.add(lb.id);
        }
        saveCollapsedStates();
        selectLorebook(lb.id);
      });

      catNode.appendChild(loresGroup);
      el.treeContainer.appendChild(catNode);
    });

    if (window.lucide) window.lucide.createIcons();

    // Restore scroll position
    el.treeContainer.scrollTop = state.treeScrollTop;
  }

  // --- SYSTEM PROMPT TREE & EDITOR MANAGERS ---
  function renderSystemPromptTree() {
    if (!el.spTreeContainer) return;

    const store = state.systemPromptStore || {};
    const shorterRules = store.shorter_rules || [];
    const keyremindRules = store.keyremind_rules || [];
    const triggerRules = store.trigger_rules || [];

    let html = '';

    // Base System Prompt Item
    const isBaseActive = state.selectedSpItem === 'sp_base' ? 'active' : '';
    html += `
      <div class="tree-item tree-channel ${isBaseActive}" data-sp-item="sp_base">
        <i data-lucide="terminal" class="tree-icon text-accent"></i>
        <span class="tree-label">Base System Prompt</span>
      </div>
    `;

    // Feature Switches Item
    const isFeaturesActive = state.selectedSpItem === 'sp_features' ? 'active' : '';
    html += `
      <div class="tree-item tree-channel ${isFeaturesActive}" data-sp-item="sp_features">
        <i data-lucide="sliders" class="tree-icon text-info"></i>
        <span class="tree-label">Global Formatting Features</span>
      </div>
    `;

    // Shorter Rules Group
    html += `
      <div class="tree-group mt-3">
        <div class="tree-group-header">
          <i data-lucide="scissors" class="group-icon"></i>
          <span class="group-title">Shorter Rules (${shorterRules.length})</span>
        </div>
        <div class="tree-group-children">
    `;
    if (shorterRules.length === 0) {
      html += `<div class="text-sub px-4 py-1 text-xs">No shorter rules</div>`;
    } else {
      shorterRules.forEach(r => {
        const isActive = state.selectedSpItem === r.id ? 'active' : '';
        const offBadge = r.enabled === false ? ' <span class="badge badge-off">Off</span>' : '';
        html += `
          <div class="tree-item tree-lore ${isActive}" data-sp-item="${r.id}">
            <i data-lucide="scissors" class="tree-icon text-warning"></i>
            <span class="tree-label">${escapeHtml(r.name || 'Shorter Rule')}${offBadge}</span>
          </div>
        `;
      });
    }
    html += `</div></div>`;

    // KeyRemind Rules Group
    html += `
      <div class="tree-group mt-2">
        <div class="tree-group-header">
          <i data-lucide="bell" class="group-icon"></i>
          <span class="group-title">KeyRemind Rules (${keyremindRules.length})</span>
        </div>
        <div class="tree-group-children">
    `;
    if (keyremindRules.length === 0) {
      html += `<div class="text-sub px-4 py-1 text-xs">No keyword reminder rules</div>`;
    } else {
      keyremindRules.forEach(r => {
        const isActive = state.selectedSpItem === r.id ? 'active' : '';
        const offBadge = r.enabled === false ? ' <span class="badge badge-off">Off</span>' : '';
        html += `
          <div class="tree-item tree-lore ${isActive}" data-sp-item="${r.id}">
            <i data-lucide="bell" class="tree-icon text-purple"></i>
            <span class="tree-label">${escapeHtml(r.name || 'KeyRemind Rule')}${offBadge}</span>
          </div>
        `;
      });
    }
    html += `</div></div>`;

    // Keyword Trigger Rules Group
    html += `
      <div class="tree-group mt-2">
        <div class="tree-group-header">
          <i data-lucide="zap" class="group-icon"></i>
          <span class="group-title">Trigger Rules (${triggerRules.length})</span>
        </div>
        <div class="tree-group-children">
    `;
    if (triggerRules.length === 0) {
      html += `<div class="text-sub px-4 py-1 text-xs">No trigger rules</div>`;
    } else {
      triggerRules.forEach(r => {
        const isActive = state.selectedSpItem === r.id ? 'active' : '';
        const offBadge = r.enabled === false ? ' <span class="badge badge-off">Off</span>' : '';
        html += `
          <div class="tree-item tree-lore ${isActive}" data-sp-item="${r.id}">
            <i data-lucide="zap" class="tree-icon text-success"></i>
            <span class="tree-label">${escapeHtml(r.name || 'Trigger Rule')}${offBadge}</span>
          </div>
        `;
      });
    }
    html += `</div></div>`;

    el.spTreeContainer.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();

    el.spTreeContainer.querySelectorAll('[data-sp-item]').forEach(item => {
      item.addEventListener('click', () => selectSpItem(item.dataset.spItem));
    });
  }

  function selectSpItem(itemId) {
    state.selectedSpItem = itemId;
    renderSystemPromptTree();

    if (!el.spBaseView) return;

    el.spBaseView.classList.add('hidden');
    el.spFeaturesView.classList.add('hidden');
    el.spRuleEditorView.classList.add('hidden');
    el.spEmptyView.classList.add('hidden');

    const store = state.systemPromptStore || {};

    if (itemId === 'sp_base') {
      el.spBaseView.classList.remove('hidden');
      if (el.spBasePromptInput) {
        el.spBasePromptInput.value = store.system_prompt || '';
      }
      return;
    }

    if (itemId === 'sp_features') {
      el.spFeaturesView.classList.remove('hidden');
      if (el.spToggleFixFormat) el.spToggleFixFormat.checked = !!store.features?.fixFormat;
      if (el.spToggleAutoLineBreak) el.spToggleAutoLineBreak.checked = !!store.features?.autoLineBreak;
      return;
    }

    let foundRule = null;
    let ruleType = 'shorter';

    if (Array.isArray(store.shorter_rules)) {
      foundRule = store.shorter_rules.find(r => r.id === itemId);
      if (foundRule) ruleType = 'shorter';
    }
    if (!foundRule && Array.isArray(store.keyremind_rules)) {
      foundRule = store.keyremind_rules.find(r => r.id === itemId);
      if (foundRule) ruleType = 'keyremind';
    }
    if (!foundRule && Array.isArray(store.trigger_rules)) {
      foundRule = store.trigger_rules.find(r => r.id === itemId);
      if (foundRule) ruleType = 'trigger';
    }

    if (foundRule) {
      el.spRuleEditorView.classList.remove('hidden');
      if (el.spRuleTitle) el.spRuleTitle.textContent = foundRule.name || 'Edit Rule';
      if (el.spRuleSubtitle) el.spRuleSubtitle.textContent = `ID: ${foundRule.id}`;
      if (el.spRuleEnabledCheckbox) el.spRuleEnabledCheckbox.checked = foundRule.enabled !== false;
      if (el.spRuleNameInput) el.spRuleNameInput.value = foundRule.name || '';
      if (el.spRuleTypeSelect) el.spRuleTypeSelect.value = ruleType;
      if (el.spRulePromptInput) el.spRulePromptInput.value = foundRule.prompt || '';

      updateSpParamVisibility(ruleType);

      if (ruleType === 'shorter' && el.spParamMaxLength) {
        el.spParamMaxLength.value = Number(foundRule.max_length || foundRule.length) || 500;
      } else if (ruleType === 'keyremind' && el.spParamKey) {
        el.spParamKey.value = foundRule.key || '';
      } else if (ruleType === 'trigger') {
        if (el.spParamKeywords) {
          el.spParamKeywords.value = Array.isArray(foundRule.keywords) ? foundRule.keywords.join(', ') : (foundRule.keywords || '');
        }
        if (el.spParamDepth) el.spParamDepth.value = Number(foundRule.depth_scan) || 2;
        if (el.spParamInsertion) el.spParamInsertion.value = foundRule.insertion || 'context';
      }
    } else {
      el.spEmptyView.classList.remove('hidden');
    }
  }

  function updateSpParamVisibility(ruleType) {
    if (el.spParamsShorter) el.spParamsShorter.classList.toggle('hidden', ruleType !== 'shorter');
    if (el.spParamsKeyremind) el.spParamsKeyremind.classList.toggle('hidden', ruleType !== 'keyremind');
    if (el.spParamsTrigger) el.spParamsTrigger.classList.toggle('hidden', ruleType !== 'trigger');
  }

  // --- SELECTION & EDITOR MANAGERS ---
  function selectLorebook(lbId) {
    state.selectedLbId = lbId;
    state.selectedLoreId = null;
    renderHierarchyTree();

    const lb = state.lorebookStore.lorebooks.find(b => b.id === lbId);
    if (!lb) return;

    el.emptyEditorView.classList.add('hidden');
    el.loreEditorView.classList.add('hidden');
    el.lorebookEditorView.classList.remove('hidden');

    el.lbEditTitle.textContent = `Lorebook Settings: ${lb.name}`;
    el.lbStatusSelect.value = lb.status || 'Active';
    el.lbNameInput.value = lb.name || '';
    el.lbInsertionSelect.value = lb.settings?.insertion_mode || 'context';
    el.lbDescInput.value = lb.description || '';
    el.lbPatternsInput.value = (lb.settings?.day_trigger_patterns || []).join('\n');
    el.lbDepthInput.value = lb.settings?.depth_scan || 2;
    if (el.lbIncludeWorldState) {
      el.lbIncludeWorldState.checked = (typeof lb.settings?.include_world_state === 'boolean') ? lb.settings.include_world_state : true;
    }
  }

  function selectLoreEntry(lbId, loreId) {
    state.selectedLbId = lbId;
    state.selectedLoreId = loreId;
    renderHierarchyTree();

    const lb = state.lorebookStore.lorebooks.find(b => b.id === lbId);
    if (!lb) return;
    const lore = (lb.lores || []).find(l => l.id === loreId);
    if (!lore) return;

    el.emptyEditorView.classList.add('hidden');
    el.lorebookEditorView.classList.add('hidden');
    el.loreEditorView.classList.remove('hidden');

    el.loreEditTitle.textContent = `Edit Lore Entry: ${lore.name}`;
    el.loreEditSubtitle.textContent = `Lorebook: ${lb.name} | Group: ${lore.group || 'General'}`;
    el.loreGroupHeadCheckbox.checked = !!lore.is_group_head;
    el.loreNameInput.value = lore.name || '';
    el.loreGroupInput.value = lore.group || 'General';

    el.loreKeywordsInput.value = (lore.trigger?.keywords || []).join(', ');
    el.loreRateInput.value = typeof lore.trigger?.trigger_rate === 'number' ? lore.trigger.trigger_rate : 100;

    const area = lore.prompt_area || {};
    el.loreDefInput.value = area.definition || '';

    renderInfraTable(area.infrastructure || area.scale_metrics || []);
    renderCatalogTable(area.catalog || []);
    renderKvContainer(el.staffKvContainer, area.staff || {}, 'Staff Name / Role (e.g. Yurina)', 'Duties, Schedule, Salary, Description');
    renderKvContainer(el.policyKvContainer, area.policy || {}, 'Policy Name (e.g. Return Policy)', 'Policy terms & details');
    renderKvContainer(el.customKvContainer, area.custom_data || {}, 'Metadata Key', 'Value / Description');
  }

  // --- CURRENCY PARSER & FORMATTERS ---
  function parseCurrencyToCopper(valStr) {
    if (typeof valStr === 'number') return valStr;
    if (!valStr) return 0;

    const str = String(valStr).trim();
    if (!str) return 0;

    // Pure number check (e.g. "1000")
    if (/^-?\d+(\.\d+)?$/.test(str)) {
      return Math.round(parseFloat(str));
    }

    let totalCopper = 0;
    const isNegative = str.startsWith('-');

    // Match expressions like "1G", "50S", "20c", "1.5 Gold", "50 Silver", etc.
    const regex = /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/g;
    let match;
    let foundMatch = false;

    while ((match = regex.exec(str)) !== null) {
      foundMatch = true;
      const num = parseFloat(match[1]) || 0;
      const unit = match[2].toLowerCase();

      if (unit === 'g' || unit === 'gold' || unit === 'golds') {
        totalCopper += Math.round(num * 10000);
      } else if (unit === 's' || unit === 'silver' || unit === 'silvers') {
        totalCopper += Math.round(num * 100);
      } else if (unit === 'c' || unit === 'copper' || unit === 'coppers') {
        totalCopper += Math.round(num);
      }
    }

    if (!foundMatch) {
      const numOnly = parseFloat(str.replace(/[^0-9.-]/g, ''));
      return isNaN(numOnly) ? 0 : Math.round(numOnly);
    }

    return isNegative && totalCopper > 0 ? -totalCopper : totalCopper;
  }

  function formatCopperToGold(copperAmount) {
    const isNegative = copperAmount < 0;
    const absVal = Math.abs(copperAmount);
    const goldVal = absVal / 10000;

    const g = Math.floor(absVal / 10000);
    const s = Math.floor((absVal % 10000) / 100);
    const c = absVal % 100;

    const goldFormatted = goldVal.toLocaleString(undefined, {
      minimumFractionDigits: Number.isInteger(goldVal) ? 0 : 2,
      maximumFractionDigits: 4
    });

    const sign = isNegative ? '-' : '';

    if (g > 0 || absVal === 0) {
      return `${sign}${goldFormatted} Gold <span class="text-sub">(${sign}${g}G ${s}S ${c}C)</span>`;
    } else {
      return `${sign}${goldFormatted} Gold <span class="text-sub">(${sign}${s}S ${c}C)</span>`;
    }
  }

  function formatCopperForInput(copper) {
    if (!copper) return '0';
    const g = Math.floor(copper / 10000);
    const s = Math.floor((copper % 10000) / 100);
    const c = copper % 100;

    const parts = [];
    if (g > 0) parts.push(`${g}G`);
    if (s > 0) parts.push(`${s}S`);
    if (c > 0 || parts.length === 0) parts.push(`${c}C`);
    return parts.join(' ');
  }

  // --- INFRASTRUCTURE METRICS TABLE MANAGERS ---
  function renderInfraTable(infrastructure) {
    if (!el.infraTableBody) return;
    el.infraTableBody.innerHTML = '';
    (infrastructure || []).forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" class="form-input form-input-sm infra-id" value="${item.id || ''}" placeholder="e.g. metric_highways"></td>
        <td><input type="text" class="form-input form-input-sm infra-name" value="${item.name || ''}" placeholder="Metric Name"></td>
        <td><input type="text" class="form-input form-input-sm infra-unit" value="${item.unit || ''}" placeholder="e.g. km or members"></td>
        <td><input type="number" class="form-input form-input-sm infra-base" value="${item.base_value || 0}"></td>
        <td><input type="number" step="any" class="form-input form-input-sm infra-growth" value="${item.daily_growth || 0}"></td>
        <td><input type="number" min="1" class="form-input form-input-sm infra-start-date" value="${item.start_date || 1}"></td>
        <td><input type="number" step="any" class="form-input form-input-sm infra-maint" value="${item.maintenance_cost_per_unit || 0}"></td>
        <td><input type="number" step="any" class="form-input form-input-sm infra-sub" value="${item.subscription_revenue_per_unit || 0}"></td>
        <td>
          <button class="btn-icon btn-icon-danger btn-delete-infra" data-index="${index}" title="Remove Metric">
            <i data-lucide="trash"></i>
          </button>
        </td>
      `;
      el.infraTableBody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function getInfraFromForm() {
    if (!el.infraTableBody) return [];
    const infrastructure = [];
    const rows = el.infraTableBody.querySelectorAll('tr');
    rows.forEach(tr => {
      const id = tr.querySelector('.infra-id').value.trim();
      const name = tr.querySelector('.infra-name').value.trim();
      const unit = tr.querySelector('.infra-unit').value.trim();
      const base_value = parseFloat(tr.querySelector('.infra-base').value) || 0;
      const daily_growth = parseFloat(tr.querySelector('.infra-growth').value) || 0;
      const start_date = parseInt(tr.querySelector('.infra-start-date').value, 10) || 1;
      const maintenance_cost_per_unit = parseFloat(tr.querySelector('.infra-maint').value) || 0;
      const subscription_revenue_per_unit = parseFloat(tr.querySelector('.infra-sub').value) || 0;

      if (id || name) {
        infrastructure.push({
          id: id || `metric_${Date.now()}`,
          name: name || 'Untitled Metric',
          unit,
          base_value,
          daily_growth,
          start_date,
          maintenance_cost_per_unit,
          subscription_revenue_per_unit
        });
      }
    });
    return infrastructure;
  }

  // --- CATALOG TABLE & CALCULATION ---
  function renderCatalogTable(catalog) {
    el.catalogTableBody.innerHTML = '';
    catalog.forEach((item, index) => {
      const tr = document.createElement('tr');
      const displayPrice = item.price_raw || (typeof item.price_copper === 'number' ? formatCopperForInput(item.price_copper) : '0');
      const displayCost = item.cost_raw || (typeof item.unit_cost_copper === 'number' ? formatCopperForInput(item.unit_cost_copper) : '0');
      const startDate = typeof item.start_date === 'number' ? item.start_date : (parseInt(item.start_date, 10) || 1);

      const capMetricId = item.capacity_binding?.metric_id || '';
      const capUnits = item.capacity_binding?.units_per_metric || '';
      const demandMetricId = item.demand_binding?.metric_id || '';
      const demandBoost = item.demand_binding?.boost_per_1k_units || '';

      tr.innerHTML = `
        <td><input type="text" class="form-input form-input-sm cat-name" value="${item.name || ''}" placeholder="Item Name"></td>
        <td>
          <select class="form-select form-select-sm cat-type">
            <option value="retail" ${item.type === 'retail' ? 'selected' : ''}>Retail Item</option>
            <option value="ticket" ${item.type === 'ticket' ? 'selected' : ''}>Ticket</option>
            <option value="food" ${item.type === 'food' ? 'selected' : ''}>Food / Beverage</option>
            <option value="fee_revenue_share" ${item.type === 'fee_revenue_share' ? 'selected' : ''}>Fee / Revenue Share</option>
          </select>
        </td>
        <td><input type="text" class="form-input form-input-sm cat-price" value="${displayPrice}" placeholder="e.g. 1G 50S or 50s"></td>
        <td><input type="text" class="form-input form-input-sm cat-cost" value="${displayCost}" placeholder="e.g. 2S or 200c"></td>
        <td><input type="number" class="form-input form-input-sm cat-sold" value="${item.daily_units_sold || 0}"></td>
        <td><input type="number" min="1" class="form-input form-input-sm cat-start-date" value="${startDate}" placeholder="Day 1"></td>
        <td><input type="text" class="form-input form-input-sm cat-val" value="${item.value || ''}" placeholder="e.g. -50% or -5S"></td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 6px; min-width: 280px;">
            <div style="display: flex; gap: 6px; align-items: center;" title="Capacity Cap Binding: Limits sales based on infrastructure metric">
              <span style="font-size: 0.72rem; color: #a78bfa; width: 40px; font-weight: 600; flex-shrink: 0;">Cap:</span>
              <input type="text" class="form-input form-input-xs cat-cap-metric" value="${capMetricId}" placeholder="Metric ID (e.g. metric_highways)" style="font-size: 0.75rem; flex: 1; min-width: 110px;">
              <input type="number" step="any" class="form-input form-input-xs cat-cap-units" value="${capUnits}" placeholder="Ratio" style="width: 90px; font-size: 0.75rem; flex-shrink: 0;">
            </div>
            <div style="display: flex; gap: 6px; align-items: center;" title="Demand Boost Binding: Increases sales demand based on market coverage metric">
              <span style="font-size: 0.72rem; color: #34d399; width: 40px; font-weight: 600; flex-shrink: 0;">Boost:</span>
              <input type="text" class="form-input form-input-xs cat-demand-metric" value="${demandMetricId}" placeholder="Metric ID (e.g. metric_cardholders)" style="font-size: 0.75rem; flex: 1; min-width: 110px;">
              <input type="number" step="any" class="form-input form-input-xs cat-demand-boost" value="${demandBoost}" placeholder="Ratio" style="width: 90px; font-size: 0.75rem; flex-shrink: 0;">
            </div>
          </div>
        </td>
        <td>
          <button class="btn-icon btn-icon-danger btn-delete-cat" data-index="${index}" title="Remove Item">
            <i data-lucide="trash"></i>
          </button>
        </td>
      `;
      el.catalogTableBody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
    updateCatalogPreview(catalog);
  }

  function getCatalogFromForm() {
    const catalog = [];
    const rows = el.catalogTableBody.querySelectorAll('tr');
    rows.forEach(tr => {
      const name = tr.querySelector('.cat-name').value.trim();
      const type = tr.querySelector('.cat-type').value;
      const price_raw = tr.querySelector('.cat-price').value.trim();
      const cost_raw = tr.querySelector('.cat-cost').value.trim();
      const price_copper = parseCurrencyToCopper(price_raw);
      const unit_cost_copper = parseCurrencyToCopper(cost_raw);
      const daily_units_sold = parseInt(tr.querySelector('.cat-sold').value, 10) || 0;
      const start_date_val = tr.querySelector('.cat-start-date') ? (parseInt(tr.querySelector('.cat-start-date').value, 10) || 1) : 1;
      const value = tr.querySelector('.cat-val').value.trim();

      const capMetricId = tr.querySelector('.cat-cap-metric')?.value.trim();
      const capUnits = parseFloat(tr.querySelector('.cat-cap-units')?.value);
      const demandMetricId = tr.querySelector('.cat-demand-metric')?.value.trim();
      const demandBoost = parseFloat(tr.querySelector('.cat-demand-boost')?.value);

      const capacity_binding = capMetricId ? { metric_id: capMetricId, units_per_metric: capUnits || 1 } : undefined;
      const demand_binding = demandMetricId ? { metric_id: demandMetricId, boost_per_1k_units: demandBoost || 0.05 } : undefined;

      if (name) {
        const itemObj = {
          id: generateId('item'),
          name,
          type,
          price_raw,
          cost_raw,
          price_copper,
          unit_cost_copper,
          daily_units_sold,
          monthly_units_sold: daily_units_sold * 30,
          sold_out: false,
          start_date: start_date_val,
          branches: 1,
          value,
          description: type === 'fee_revenue_share' ? 'Dynamic fee/revenue sharing formula' : ''
        };

        if (capacity_binding) itemObj.capacity_binding = capacity_binding;
        if (demand_binding) itemObj.demand_binding = demand_binding;

        catalog.push(itemObj);
      }
    });
    return catalog;
  }

  function updateCatalogPreview(catalog) {
    let gross = 0;
    let cost = 0;
    let fees = 0;

    catalog.forEach(item => {
      if (item.type === 'fee_revenue_share') return;
      const p = parseCurrencyToCopper(item.price_raw || item.price_copper || 0);
      const c = parseCurrencyToCopper(item.cost_raw || item.unit_cost_copper || 0);
      const s = parseInt(item.daily_units_sold, 10) || 0;
      gross += p * s;
      cost += c * s;
    });

    catalog.forEach(item => {
      if (item.type !== 'fee_revenue_share') return;
      const valStr = String(item.value || '0').trim();
      if (valStr.endsWith('%')) {
        const pct = parseFloat(valStr.replace('%', '')) || 0;
        fees += Math.round(gross * (pct / 100));
      } else {
        fees += parseCurrencyToCopper(valStr);
      }
    });

    const net = gross - cost + fees;

    el.catalogCalcPreview.innerHTML = `
      <div class="calc-metric-card">
        <span class="label">Total Daily Gross</span>
        <span class="val text-success">${formatCopperToGold(gross)}</span>
      </div>
      <div class="calc-metric-card">
        <span class="label">Operational Costs</span>
        <span class="val text-warning">${formatCopperToGold(cost)}</span>
      </div>
      <div class="calc-metric-card">
        <span class="label">Fees & Revenue Share</span>
        <span class="val ${fees >= 0 ? 'text-success' : 'text-danger'}">${fees >= 0 ? '+' : ''}${formatCopperToGold(fees)}</span>
      </div>
      <div class="calc-metric-card">
        <span class="label">Daily Net Surplus</span>
        <span class="val text-primary">${formatCopperToGold(net)}</span>
      </div>
    `;
  }

  // --- KEY-VALUE DICTIONARY HELPERS ---
  function renderKvContainer(container, dict, keyPlaceholder = 'Key / Title', valPlaceholder = 'Value / Content') {
    container.innerHTML = '';
    Object.entries(dict || {}).forEach(([key, val]) => {
      addKvRow(container, key, typeof val === 'object' ? JSON.stringify(val) : val, keyPlaceholder, valPlaceholder);
    });
  }

  function addKvRow(container, key = '', val = '', keyPlaceholder = 'Key / Title', valPlaceholder = 'Value / Content') {
    const row = document.createElement('div');
    row.className = 'kv-row mt-2';
    row.innerHTML = `
      <input type="text" class="form-input form-input-sm kv-key" value="${key}" placeholder="${keyPlaceholder}">
      <input type="text" class="form-input form-input-sm kv-val" value="${val}" placeholder="${valPlaceholder}">
      <button class="btn-icon btn-icon-danger btn-delete-kv"><i data-lucide="trash"></i></button>
    `;
    row.querySelector('.btn-delete-kv').addEventListener('click', () => row.remove());
    container.appendChild(row);
    if (window.lucide) window.lucide.createIcons();
  }

  function getDictFromKvContainer(container) {
    const dict = {};
    const rows = container.querySelectorAll('.kv-row');
    rows.forEach(row => {
      const k = row.querySelector('.kv-key').value.trim();
      const v = row.querySelector('.kv-val').value.trim();
      if (k) dict[k] = v;
    });
    return dict;
  }

  // --- MODEL CONFIGURATION LOGIC ---
  async function loadModelConfig() {
    try {
      const res = await fetch('/v1/model-config', { headers: getHeaders() });
      const data = await res.json();
      if (data.ok && data.config) {
        state.modelConfig = data.config;
        renderModelConfigUI();
      }
    } catch (err) {
      log(`Failed to load model config: ${err.message}`, 'error');
    }
  }

  async function saveModelConfig() {
    try {
      if (el.btnMcSave) {
        el.btnMcSave.disabled = true;
        el.btnMcSave.innerHTML = `<i data-lucide="loader" class="spin"></i> Saving...`;
      }
      const payload = {
        fallback_enabled: state.modelConfig.fallback_enabled,
        fallback_models: state.modelConfig.fallback_models,
        model_registry: state.modelConfig.model_registry || [],
        thinking_start_tag: state.modelConfig.thinking_start_tag || '<think>',
        thinking_end_tag: state.modelConfig.thinking_end_tag || '</think>'
      };
      const res = await fetch('/v1/model-config', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.ok) {
        log('Model configuration saved to Upstash Redis successfully!', 'info');
      } else {
        log(`Failed to save model config: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      log(`Save model config error: ${err.message}`, 'error');
    } finally {
      if (el.btnMcSave) {
        el.btnMcSave.disabled = false;
        el.btnMcSave.innerHTML = `<i data-lucide="save"></i> Save Configuration`;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function renderModelRegistryUI() {
    if (!el.mcModelRegistry) return;
    const registry = state.modelConfig.model_registry || [];

    if (registry.length === 0) {
      el.mcModelRegistry.innerHTML = `<div class="empty-model-list">No recently used models yet. Send a request from your client to auto-track model capabilities.</div>`;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    el.mcModelRegistry.innerHTML = registry.map((m, idx) => {
      const timeAgoStr = m.last_used ? formatTimeAgo(new Date(m.last_used)) : 'Recently';

      let thinkingBadge = `<span class="model-status-badge status-untested"><i data-lucide="help-circle"></i> Detecting...</span>`;
      let thinkingToggle = '';

      if (m.thinking_type === 'none' || m.thinking_capable === false) {
        thinkingBadge = `<span class="model-status-badge status-untested"><i data-lucide="slash"></i> Not supported</span>`;
      } else if (m.thinking_capable) {
        let typeLabel = 'Standard Thinking';
        if (m.thinking_type === 'minimax') typeLabel = 'MiniMax Thinking';
        if (m.thinking_type === 'nemotron') typeLabel = 'Nemotron Reasoning';
        if (m.thinking_type === 'kimi') typeLabel = 'Kimi Reasoning';
        thinkingBadge = `<span class="model-status-badge status-online"><i data-lucide="brain"></i> ${typeLabel}</span>`;
        thinkingToggle = `
          <label class="switch switch-sm" title="Toggle Thinking for this model">
            <input type="checkbox" class="mc-registry-think-toggle" data-index="${idx}" ${m.thinking_enabled ? 'checked' : ''}>
            <span class="slider round"></span>
          </label>
        `;
      }

      return `
        <div class="registry-card">
          <div class="model-card-left">
            <div class="registry-icon-badge ${m.thinking_capable ? 'thinking' : ''}">
              <i data-lucide="${m.thinking_capable ? 'brain' : 'cpu'}"></i>
            </div>
            <div class="model-card-info">
              <div class="model-card-title">
                <span>${escapeHtml(m.label || m.id)}</span>
              </div>
              <div class="model-card-id">${escapeHtml(m.id)} &bull; <span class="text-muted">${timeAgoStr}</span></div>
            </div>
          </div>
          <div class="model-card-right">
            ${thinkingBadge}
            ${thinkingToggle}
            <button class="btn btn-secondary btn-xs btn-mc-reset-registry" data-index="${idx}" title="Reset cached info & forget model from Redis">
              <i data-lucide="rotate-ccw"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  function renderModelConfigUI() {
    if (el.mcFallbackToggle) {
      el.mcFallbackToggle.checked = !!state.modelConfig.fallback_enabled;
    }
    if (el.mcThinkingStartTag) {
      el.mcThinkingStartTag.value = state.modelConfig.thinking_start_tag || '<think>';
    }
    if (el.mcThinkingEndTag) {
      el.mcThinkingEndTag.value = state.modelConfig.thinking_end_tag || '</think>';
    }

    renderModelRegistryUI();

    if (!el.mcModelList) return;
    const models = state.modelConfig.fallback_models || [];

    if (models.length === 0) {
      el.mcModelList.innerHTML = `<div class="empty-model-list">No fallback models configured yet. Please add a model using the form below.</div>`;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    el.mcModelList.innerHTML = models.map((m, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === models.length - 1;
      const test = state.modelTestResults[m.id] || {};

      let statusBadge = `<span class="model-status-badge status-untested"><i data-lucide="help-circle"></i> Untested</span>`;
      if (test.testing) {
        statusBadge = `<span class="model-status-badge status-testing"><i data-lucide="loader" class="spin"></i> Testing...</span>`;
      } else if (test.ok) {
        statusBadge = `<span class="model-status-badge status-online"><i data-lucide="check-circle-2"></i> ${test.latency_ms}ms</span>`;
      } else if (test.error) {
        statusBadge = `<span class="model-status-badge status-offline" title="${escapeHtml(test.error)}"><i data-lucide="alert-triangle"></i> Offline</span>`;
      }

      const errorBox = test.error ? `
        <div class="model-error-detail">
          <i data-lucide="alert-triangle"></i>
          <span><strong>Error:</strong> ${escapeHtml(test.error)}</span>
        </div>
      ` : '';

      return `
        <div class="model-item-wrapper" data-index="${idx}">
          <div class="model-card ${m.enabled ? '' : 'disabled'}">
            <div class="model-card-left">
              <div class="model-index-badge">${idx + 1}</div>
              <div class="model-card-info">
                <div class="model-card-title">
                  <input type="checkbox" class="mc-toggle-item" data-index="${idx}" ${m.enabled ? 'checked' : ''}>
                  <span>${escapeHtml(m.label || m.id)}</span>
                </div>
                <div class="model-card-id">${escapeHtml(m.id)}</div>
              </div>
            </div>
            <div class="model-card-right">
              ${statusBadge}
              <div class="model-actions">
                <button class="btn btn-secondary btn-xs btn-mc-test" data-id="${escapeHtml(m.id)}" title="Test model latency">
                  <i data-lucide="flask-conical"></i>
                </button>
                <button class="btn btn-secondary btn-xs btn-mc-up" data-index="${idx}" ${isFirst ? 'disabled' : ''} title="Move Up">
                  <i data-lucide="arrow-up"></i>
                </button>
                <button class="btn btn-secondary btn-xs btn-mc-down" data-index="${idx}" ${isLast ? 'disabled' : ''} title="Move Down">
                  <i data-lucide="arrow-down"></i>
                </button>
                <button class="btn btn-danger btn-xs btn-mc-del" data-index="${idx}" title="Delete model">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </div>
          </div>
          ${errorBox}
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }

  async function testSingleModel(modelId) {
    state.modelTestResults[modelId] = { testing: true };
    renderModelConfigUI();
    try {
      const res = await fetch('/v1/model-test', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ model_id: modelId })
      });
      const data = await res.json();
      state.modelTestResults[modelId] = {
        testing: false,
        ok: data.ok,
        latency_ms: data.latency_ms,
        error: data.error
      };
      if (data.ok) {
        log(`Model ${modelId} is online! Latency: ${data.latency_ms}ms`, 'info');
      } else {
        log(`Model ${modelId} test failed: ${data.error}`, 'error');
      }
    } catch (err) {
      state.modelTestResults[modelId] = {
        testing: false,
        ok: false,
        error: err.message
      };
      log(`Model test request error: ${err.message}`, 'error');
    } finally {
      renderModelConfigUI();
    }
  }

  async function testAllModels() {
    const models = state.modelConfig.fallback_models || [];
    if (models.length === 0) return;

    if (el.btnMcTestAll) {
      el.btnMcTestAll.disabled = true;
      el.btnMcTestAll.innerHTML = `<i data-lucide="loader" class="spin"></i> Testing All...`;
    }

    for (const m of models) {
      await testSingleModel(m.id);
    }

    if (el.btnMcTestAll) {
      el.btnMcTestAll.disabled = false;
      el.btnMcTestAll.innerHTML = `<i data-lucide="flask-conical"></i> Test All Models`;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // --- EVENT LISTENERS ---
  function bindEvents() {
    // Navigation
    el.navButtons.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    if (el.mobileNavToggle) {
      el.mobileNavToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        el.sidebar.classList.toggle('open');
        if (el.sidebarBackdrop) el.sidebarBackdrop.classList.toggle('show');
      });
    }

    if (el.sidebarBackdrop) {
      el.sidebarBackdrop.addEventListener('click', () => {
        el.sidebar.classList.remove('open');
        el.sidebarBackdrop.classList.remove('show');
      });
    }

    // Close mobile sidebar on tap outside anywhere
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && el.sidebar && el.sidebar.classList.contains('open')) {
        const isInsideSidebar = el.sidebar.contains(e.target);
        const isToggleBtn = el.mobileNavToggle && el.mobileNavToggle.contains(e.target);
        if (!isInsideSidebar && !isToggleBtn) {
          el.sidebar.classList.remove('open');
          if (el.sidebarBackdrop) el.sidebarBackdrop.classList.remove('show');
        }
      }
    });

    // Save Store
    el.btnSaveStore.addEventListener('click', saveLorebookStore);

    // Export & Import
    el.btnExportDb.addEventListener('click', () => {
      window.location.href = '/v1/lorebooks/export';
    });

    // Model Config Events
    if (el.mcFallbackToggle) {
      el.mcFallbackToggle.addEventListener('change', (e) => {
        state.modelConfig.fallback_enabled = e.target.checked;
      });
    }

    if (el.mcThinkingStartTag) {
      el.mcThinkingStartTag.addEventListener('input', (e) => {
        state.modelConfig.thinking_start_tag = e.target.value;
      });
    }

    if (el.mcThinkingEndTag) {
      el.mcThinkingEndTag.addEventListener('input', (e) => {
        state.modelConfig.thinking_end_tag = e.target.value;
      });
    }


    if (el.btnMcSave) {
      el.btnMcSave.addEventListener('click', saveModelConfig);
    }

    if (el.btnMcTestAll) {
      el.btnMcTestAll.addEventListener('click', testAllModels);
    }

    if (el.btnMcAddModel) {
      el.btnMcAddModel.addEventListener('click', () => {
        const id = (el.mcAddModelId.value || '').trim();
        const label = (el.mcAddModelLabel.value || '').trim();
        if (!id) {
          log('Please enter a valid Model ID', 'error');
          return;
        }
        if (!Array.isArray(state.modelConfig.fallback_models)) {
          state.modelConfig.fallback_models = [];
        }
        if (state.modelConfig.fallback_models.some(m => m.id === id)) {
          log(`Model ${id} is already in the fallback chain`, 'error');
          return;
        }
        state.modelConfig.fallback_models.push({
          id,
          label: label || id,
          enabled: true
        });
        el.mcAddModelId.value = '';
        el.mcAddModelLabel.value = '';
        renderModelConfigUI();
        log(`Added model ${id} to fallback chain. Click "Save Configuration" to commit.`, 'info');
      });
    }

    if (el.mcModelList) {
      el.mcModelList.addEventListener('click', (e) => {
        const btnTest = e.target.closest('.btn-mc-test');
        if (btnTest) {
          const modelId = btnTest.dataset.id;
          testSingleModel(modelId);
          return;
        }

        const btnUp = e.target.closest('.btn-mc-up');
        if (btnUp) {
          const idx = parseInt(btnUp.dataset.index, 10);
          if (idx > 0) {
            const list = state.modelConfig.fallback_models;
            const temp = list[idx];
            list[idx] = list[idx - 1];
            list[idx - 1] = temp;
            renderModelConfigUI();
          }
          return;
        }

        const btnDown = e.target.closest('.btn-mc-down');
        if (btnDown) {
          const idx = parseInt(btnDown.dataset.index, 10);
          const list = state.modelConfig.fallback_models;
          if (idx < list.length - 1) {
            const temp = list[idx];
            list[idx] = list[idx + 1];
            list[idx + 1] = temp;
            renderModelConfigUI();
          }
          return;
        }

        const btnDel = e.target.closest('.btn-mc-del');
        if (btnDel) {
          const idx = parseInt(btnDel.dataset.index, 10);
          const list = state.modelConfig.fallback_models;
          const removed = list.splice(idx, 1);
          renderModelConfigUI();
          log(`Removed model ${removed[0]?.id || ''}`, 'info');
          return;
        }
      });

      el.mcModelList.addEventListener('change', (e) => {
        if (e.target.classList.contains('mc-toggle-item')) {
          const idx = parseInt(e.target.dataset.index, 10);
          if (state.modelConfig.fallback_models[idx]) {
            state.modelConfig.fallback_models[idx].enabled = e.target.checked;
            renderModelConfigUI();
          }
        }
      });
    }

    if (el.mcModelRegistry) {
      el.mcModelRegistry.addEventListener('click', (e) => {
        const btnReset = e.target.closest('.btn-mc-reset-registry');
        if (btnReset) {
          const idx = parseInt(btnReset.dataset.index, 10);
          const registry = state.modelConfig.model_registry || [];
          if (registry[idx]) {
            const removed = registry.splice(idx, 1);
            renderModelConfigUI();
            saveModelConfig();
            log(`Reset & forgot model ${removed[0]?.id || ''} from Redis registry. Auto-detect will run on next call.`, 'info');
          }
        }
      });

      el.mcModelRegistry.addEventListener('change', (e) => {
        if (e.target.classList.contains('mc-registry-think-toggle')) {
          const idx = parseInt(e.target.dataset.index, 10);
          const registry = state.modelConfig.model_registry || [];
          if (registry[idx]) {
            registry[idx].thinking_enabled = e.target.checked;
            renderModelConfigUI();
            saveModelConfig();
          }
        }
      });
    }



    el.btnImportDb.addEventListener('click', () => {
      el.modalTitle.textContent = 'Import JSON Database';
      el.jsonModalArea.value = JSON.stringify(state.lorebookStore, null, 2);
      el.jsonModal.classList.remove('hidden');
    });

    el.btnCloseModal.addEventListener('click', () => el.jsonModal.classList.add('hidden'));

    el.btnSubmitModalJson.addEventListener('click', async () => {
      try {
        const json = JSON.parse(el.jsonModalArea.value);
        if (!json || !Array.isArray(json.lorebooks)) {
          throw new Error('JSON payload must contain a "lorebooks" array.');
        }
        state.lorebookStore = json;
        await saveLorebookStore();
        renderHierarchyTree();
        el.jsonModal.classList.add('hidden');
        log('Database imported successfully!', 'success');
      } catch (err) {
        alert(`Invalid JSON format: ${err.message}`);
      }
    });

    // Add Lorebook
    el.btnAddLorebook.addEventListener('click', () => {
      const newLb = {
        id: generateId('lb'),
        name: 'New Lorebook',
        description: 'Lorebook collection description...',
        status: 'Active',
        settings: {
          day_trigger_patterns: ['\\[\\s*🕒?\\s*Day\\s+(\\d+)', '\\[Day\\s+(\\d+)'],
          depth_scan: 2,
          insertion_mode: 'context'
        },
        lores: []
      };
      state.lorebookStore.lorebooks.push(newLb);
      selectLorebook(newLb.id);
    });

    // Apply Lorebook Settings
    el.btnSaveLbSettings.addEventListener('click', async () => {
      const lb = state.lorebookStore.lorebooks.find(b => b.id === state.selectedLbId);
      if (!lb) return;

      lb.name = el.lbNameInput.value.trim() || 'Untitled Lorebook';
      lb.status = el.lbStatusSelect.value;
      lb.description = el.lbDescInput.value.trim();
      lb.settings = {
        include_world_state: el.lbIncludeWorldState ? el.lbIncludeWorldState.checked : false,
        insertion_mode: el.lbInsertionSelect.value,
        depth_scan: parseInt(el.lbDepthInput.value, 10) || 2,
        day_trigger_patterns: el.lbPatternsInput.value.split('\n').map(p => p.trim()).filter(Boolean)
      };

      log(`Updated Lorebook settings: ${lb.name}`, 'success');
      renderHierarchyTree();
      await saveLorebookStore();
    });

    // Add Lore under Lorebook
    el.btnAddLoreUnderLb.addEventListener('click', () => {
      const lb = state.lorebookStore.lorebooks.find(b => b.id === state.selectedLbId);
      if (!lb) return;

      const newLore = {
        id: generateId('lore'),
        name: 'New Lore Entry',
        group: 'General',
        is_group_head: false,
        trigger: {
          keywords: ['new lore'],
          trigger_rate: 100
        },
        prompt_area: {
          definition: 'Enter definition here...',
          catalog: [],
          staff: {},
          policy: {},
          custom_data: {}
        }
      };

      lb.lores.push(newLore);
      selectLoreEntry(lb.id, newLore.id);
    });

    // Delete Lorebook
    el.btnDeleteLorebook.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this entire Lorebook?')) return;
      state.lorebookStore.lorebooks = state.lorebookStore.lorebooks.filter(b => b.id !== state.selectedLbId);
      state.selectedLbId = null;
      state.selectedLoreId = null;
      renderHierarchyTree();
      el.lorebookEditorView.classList.add('hidden');
      el.emptyEditorView.classList.remove('hidden');
      log('Deleted Lorebook.', 'info');
      await saveLorebookStore();
    });

    // Sub-Tabs in Lore Entry Editor
    el.subTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        el.subTabs.forEach(b => b.classList.remove('active'));
        el.subTabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`subtab-${btn.dataset.subtab}`).classList.add('active');
      });
    });

    // Dynamic Row Buttons for Catalog & Key-Value
    el.btnAddCatalogItem.addEventListener('click', () => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" class="form-input form-input-sm cat-name" placeholder="Item Name"></td>
        <td>
          <select class="form-select form-select-sm cat-type">
            <option value="retail">Retail Item</option>
            <option value="ticket">Ticket</option>
            <option value="food">Food / Beverage</option>
            <option value="fee_revenue_share">Fee / Revenue Share</option>
          </select>
        </td>
        <td><input type="text" class="form-input form-input-sm cat-price" value="10S" placeholder="e.g. 1G 50S or 50s"></td>
        <td><input type="text" class="form-input form-input-sm cat-cost" value="2S" placeholder="e.g. 2S or 200c"></td>
        <td><input type="number" class="form-input form-input-sm cat-sold" value="50"></td>
        <td><input type="number" min="1" class="form-input form-input-sm cat-start-date" value="1" placeholder="Day 1"></td>
        <td><input type="text" class="form-input form-input-sm cat-val" placeholder="e.g. -50% or -5S"></td>
        <td>
          <button class="btn-icon btn-icon-danger btn-delete-cat"><i data-lucide="trash"></i></button>
        </td>
      `;
      tr.querySelector('.btn-delete-cat').addEventListener('click', () => {
        tr.remove();
        updateCatalogPreview(getCatalogFromForm());
      });
      el.catalogTableBody.appendChild(tr);
      if (window.lucide) window.lucide.createIcons();
      updateCatalogPreview(getCatalogFromForm());
    });

    if (el.catalogTableBody) {
      el.catalogTableBody.addEventListener('input', () => {
        updateCatalogPreview(getCatalogFromForm());
      });
      el.catalogTableBody.addEventListener('change', () => {
        updateCatalogPreview(getCatalogFromForm());
      });
    }

    if (el.btnAddInfraItem) {
      el.btnAddInfraItem.addEventListener('click', () => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" class="form-input form-input-sm infra-id" value="metric_${Date.now()}" placeholder="e.g. metric_highways"></td>
          <td><input type="text" class="form-input form-input-sm infra-name" value="New Infrastructure Metric" placeholder="Metric Name"></td>
          <td><input type="text" class="form-input form-input-sm infra-unit" value="units" placeholder="e.g. km or members"></td>
          <td><input type="number" class="form-input form-input-sm infra-base" value="100"></td>
          <td><input type="number" step="any" class="form-input form-input-sm infra-growth" value="1"></td>
          <td><input type="number" min="1" class="form-input form-input-sm infra-start-date" value="1"></td>
          <td><input type="number" step="any" class="form-input form-input-sm infra-maint" value="0"></td>
          <td><input type="number" step="any" class="form-input form-input-sm infra-sub" value="0"></td>
          <td>
            <button class="btn-icon btn-icon-danger btn-delete-infra" title="Remove Metric">
              <i data-lucide="trash"></i>
            </button>
          </td>
        `;
        tr.querySelector('.btn-delete-infra').addEventListener('click', () => tr.remove());
        el.infraTableBody.appendChild(tr);
        if (window.lucide) window.lucide.createIcons();
      });
    }

    if (el.infraTableBody) {
      el.infraTableBody.addEventListener('click', (e) => {
        const btnDelete = e.target.closest('.btn-delete-infra');
        if (btnDelete) {
          const tr = btnDelete.closest('tr');
          if (tr) tr.remove();
        }
      });
    }

    el.btnAddStaffRow.addEventListener('click', () => addKvRow(el.staffKvContainer, '', '', 'Staff Name / Role (e.g. Yurina)', 'Duties, Schedule, Salary, Description'));
    el.btnAddPolicyRow.addEventListener('click', () => addKvRow(el.policyKvContainer, '', '', 'Policy Name (e.g. Return Policy)', 'Policy terms & details'));
    el.btnAddCustomRow.addEventListener('click', () => addKvRow(el.customKvContainer, '', '', 'Metadata Key', 'Value / Description'));

    // Save Lore Entry
    el.btnSaveLoreEntry.addEventListener('click', async () => {
      const lb = state.lorebookStore.lorebooks.find(b => b.id === state.selectedLbId);
      if (!lb) return;
      const lore = (lb.lores || []).find(l => l.id === state.selectedLoreId);
      if (!lore) return;

      lore.name = el.loreNameInput.value.trim() || 'Untitled Lore';
      lore.group = el.loreGroupInput.value.trim() || 'General';
      lore.is_group_head = el.loreGroupHeadCheckbox.checked;

      // Ensure only one group head per group if designated
      if (lore.is_group_head) {
        lb.lores.forEach(l => {
          if (l.group === lore.group && l.id !== lore.id) {
            l.is_group_head = false;
          }
        });
      }

      const keywords = el.loreKeywordsInput.value.split(',').map(k => k.trim()).filter(Boolean);
      const trigger_rate = parseInt(el.loreRateInput.value, 10) || 100;

      lore.trigger = { keywords, trigger_rate };
      lore.prompt_area = {
        definition: el.loreDefInput.value.trim(),
        infrastructure: getInfraFromForm(),
        catalog: getCatalogFromForm(),
        staff: getDictFromKvContainer(el.staffKvContainer),
        policy: getDictFromKvContainer(el.policyKvContainer),
        custom_data: getDictFromKvContainer(el.customKvContainer)
      };

      log(`Saved Lore Entry: ${lore.name}`, 'success');
      renderHierarchyTree();
      await saveLorebookStore();
    });

    // Delete Lore Entry
    el.btnDeleteLoreEntry.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this Lore entry?')) return;
      const lb = state.lorebookStore.lorebooks.find(b => b.id === state.selectedLbId);
      if (!lb) return;
      lb.lores = lb.lores.filter(l => l.id !== state.selectedLoreId);
      state.selectedLoreId = null;
      selectLorebook(lb.id);
      log('Deleted Lore entry.', 'info');
      await saveLorebookStore();
    });

    // Simulator Runner
    el.btnRunSimulation.addEventListener('click', async () => {
      try {
        const text = el.simSampleText ? el.simSampleText.value.trim() : '';
        const prevAssistant = document.getElementById('simPrevAssistantText')?.value || '';
        log('Running full context simulation dry-run...', 'info');

        const res = await fetch('/v1/lorebooks/compile', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            store: state.lorebookStore,
            systemPromptStore: state.systemPromptStore,
            sampleText: text,
            previousAssistantText: prevAssistant
          })
        });

        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();

        el.simCompiledOutput.textContent = data.compiled_prompt || '(Empty prompt returned)';
        if (el.simOutDay) el.simOutDay.textContent = `Extracted Day: ${data.current_day !== null ? `Day ${data.current_day}` : 'None'}`;
        if (el.simOutCount) el.simOutCount.textContent = `Active Lores: ${data.active_count}`;

        const simOutRules = document.getElementById('simOutRules');
        if (simOutRules) simOutRules.textContent = `Triggered Rules: ${data.triggered_rules_count || 0}`;

        const simOutFixFormat = document.getElementById('simOutFixFormat');
        if (simOutFixFormat) simOutFixFormat.textContent = `FixFormat: ${data.fix_format ? 'On' : 'Off'} | AutoLB: ${data.auto_line_break ? 'On' : 'Off'}`;

        log(`Simulation finished. Active Lores: ${data.active_count}, Triggered Rules: ${data.triggered_rules_count || 0}`, 'success');
      } catch (err) {
        log(`Simulation error: ${err.message}`, 'error');
      }
    });

    el.btnCopyCompiledPrompt.addEventListener('click', () => {
      navigator.clipboard.writeText(el.simCompiledOutput.textContent);
      log('Copied compiled prompt to clipboard!', 'info');
    });

    // Auth Key Handling & Modal
    const btnQuickAuth = document.getElementById('btnQuickAuth');
    if (btnQuickAuth) {
      btnQuickAuth.addEventListener('click', () => {
        if (el.inputAuthKeyModal) el.inputAuthKeyModal.value = state.authKey || '';
        if (el.authErrorMessage) el.authErrorMessage.classList.add('hidden');
        if (el.authModal) el.authModal.classList.remove('hidden');
      });
    }

    if (el.btnAuthSettings) {
      el.btnAuthSettings.addEventListener('click', () => {
        if (el.inputAuthKeyModal) el.inputAuthKeyModal.value = state.authKey || '';
        if (el.authErrorMessage) el.authErrorMessage.classList.add('hidden');
        if (el.authModal) el.authModal.classList.remove('hidden');
      });
    }

    if (el.authForm) {
      el.authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const candidate = el.inputAuthKeyModal ? el.inputAuthKeyModal.value.trim() : '';
        const ok = await verifyAuthKey(candidate);
        if (ok) {
          loadLorebookStore();
        }
      });
    }

    if (el.btnToggleAuthVisibilityModal) {
      el.btnToggleAuthVisibilityModal.addEventListener('click', () => {
        if (el.inputAuthKeyModal) {
          const type = el.inputAuthKeyModal.type === 'password' ? 'text' : 'password';
          el.inputAuthKeyModal.type = type;
        }
      });
    }

    if (el.inputAuthKey) el.inputAuthKey.value = state.authKey;

    if (el.btnToggleAuthVisibility) {
      el.btnToggleAuthVisibility.addEventListener('click', () => {
        const type = el.inputAuthKey.type === 'password' ? 'text' : 'password';
        el.inputAuthKey.type = type;
      });
    }

    if (el.btnSaveAuthKey) {
      el.btnSaveAuthKey.addEventListener('click', async () => {
        const candidate = el.inputAuthKey.value.trim();
        await verifyAuthKey(candidate);
      });
    }

    // System Prompt & Rules Event Handlers
    if (el.spRuleTypeSelect) {
      el.spRuleTypeSelect.addEventListener('change', (e) => {
        updateSpParamVisibility(e.target.value);
      });
    }

    if (el.btnSaveSpBase) {
      el.btnSaveSpBase.addEventListener('click', async () => {
        state.systemPromptStore.system_prompt = el.spBasePromptInput.value.trim();
        await saveSystemPromptStore();
      });
    }

    if (el.btnSaveSpFeatures) {
      el.btnSaveSpFeatures.addEventListener('click', async () => {
        state.systemPromptStore.features = {
          fixFormat: !!el.spToggleFixFormat.checked,
          autoLineBreak: !!el.spToggleAutoLineBreak.checked
        };
        await saveSystemPromptStore();
      });
    }

    if (el.btnSaveSpRule) {
      el.btnSaveSpRule.addEventListener('click', async () => {
        const ruleId = state.selectedSpItem;
        if (!ruleId || ruleId === 'sp_base' || ruleId === 'sp_features') return;

        const store = state.systemPromptStore;
        let ruleType = el.spRuleTypeSelect.value;
        
        store.shorter_rules = (store.shorter_rules || []).filter(r => r.id !== ruleId);
        store.keyremind_rules = (store.keyremind_rules || []).filter(r => r.id !== ruleId);
        store.trigger_rules = (store.trigger_rules || []).filter(r => r.id !== ruleId);

        const updatedRule = {
          id: ruleId,
          name: el.spRuleNameInput.value.trim() || 'Untitled Rule',
          enabled: el.spRuleEnabledCheckbox.checked,
          prompt: el.spRulePromptInput.value.trim()
        };

        if (ruleType === 'shorter') {
          updatedRule.max_length = Number(el.spParamMaxLength.value) || 500;
          store.shorter_rules.push(updatedRule);
        } else if (ruleType === 'keyremind') {
          updatedRule.key = el.spParamKey.value.trim();
          store.keyremind_rules.push(updatedRule);
        } else if (ruleType === 'trigger') {
          updatedRule.keywords = el.spParamKeywords.value.split(',').map(k => k.trim()).filter(Boolean);
          updatedRule.depth_scan = Number(el.spParamDepth.value) || 2;
          updatedRule.insertion = el.spParamInsertion.value || 'context';
          store.trigger_rules.push(updatedRule);
        }

        await saveSystemPromptStore();
        renderSystemPromptTree();
        selectSpItem(ruleId);
      });
    }

    if (el.btnDeleteSpRule) {
      el.btnDeleteSpRule.addEventListener('click', async () => {
        const ruleId = state.selectedSpItem;
        if (!ruleId || ruleId === 'sp_base' || ruleId === 'sp_features') return;
        if (!confirm('Are you sure you want to delete this prompt rule?')) return;

        const store = state.systemPromptStore;
        store.shorter_rules = (store.shorter_rules || []).filter(r => r.id !== ruleId);
        store.keyremind_rules = (store.keyremind_rules || []).filter(r => r.id !== ruleId);
        store.trigger_rules = (store.trigger_rules || []).filter(r => r.id !== ruleId);

        await saveSystemPromptStore();
        selectSpItem('sp_base');
      });
    }

    if (el.btnAddSpRule) {
      el.btnAddSpRule.addEventListener('click', async () => {
        const newId = `rule_${Date.now()}`;
        const newRule = {
          id: newId,
          name: 'New Prompt Rule',
          enabled: true,
          max_length: 500,
          prompt: '[Rule Prompt]: ...'
        };
        if (!Array.isArray(state.systemPromptStore.shorter_rules)) {
          state.systemPromptStore.shorter_rules = [];
        }
        state.systemPromptStore.shorter_rules.push(newRule);
        await saveSystemPromptStore();
        renderSystemPromptTree();
        selectSpItem(newId);
      });
    }

    // Chat History, Context & Summary Events
    if (el.btnCopyContext) {
      el.btnCopyContext.addEventListener('click', () => {
        if (!el.chatContextInput) return;
        const text = el.chatContextInput.value;
        if (!text) {
          log('Context box is empty.', 'warn');
          return;
        }
        navigator.clipboard.writeText(text).then(() => {
          log('Copied chat context to clipboard!', 'info');
        }).catch(err => {
          log(`Failed to copy context: ${err.message}`, 'error');
        });
      });
    }

    if (el.btnSaveContext) {
      el.btnSaveContext.addEventListener('click', () => {
        saveChatContext();
      });
    }

    if (el.chatContextInput) {
      el.chatContextInput.addEventListener('input', () => {
        if (el.contextCharBadge) {
          el.contextCharBadge.textContent = `${el.chatContextInput.value.length.toLocaleString()} chars`;
        }
      });
    }

    if (el.btnCopyAllHistory) {
      el.btnCopyAllHistory.addEventListener('click', () => {
        copyAllHistory();
      });
    }

    if (el.btnClearHistory) {
      el.btnClearHistory.addEventListener('click', () => {
        clearChatHistory();
      });
    }

    if (el.btnRefreshHistory) {
      el.btnRefreshHistory.addEventListener('click', () => {
        loadChatHistory();
      });
    }

    if (el.btnGenerateSummary) {
      el.btnGenerateSummary.addEventListener('click', () => {
        generateSummary();
      });
    }

    if (el.btnCopySummary) {
      el.btnCopySummary.addEventListener('click', () => {
        if (!el.summaryResult) return;
        const text = el.summaryResult.textContent;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          log('Copied summary output to clipboard!', 'info');
        }).catch(err => {
          log(`Failed to copy summary: ${err.message}`, 'error');
        });
      });
    }
  }

  // --- CHAT HISTORY & SUMMARY LOGIC ---
  async function loadChatHistory() {
    if (!el.chatHistoryContainer && !el.chatContextInput) return;
    try {
      const res = await fetch('/v1/chat/history', { headers: getHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const contextText = typeof data.context === 'string' ? data.context : '';

      state.currentChatMessages = messages;
      state.currentChatContext = contextText;

      // Update Context Box
      if (el.chatContextInput) {
        el.chatContextInput.value = contextText;
      }
      if (el.contextCharBadge) {
        el.contextCharBadge.textContent = `${contextText.length.toLocaleString()} chars`;
      }

      // Update History Badge
      if (el.historyMsgBadge) {
        el.historyMsgBadge.textContent = `${messages.length} msgs`;
      }

      // Update Chat Messages Container
      if (el.chatHistoryContainer) {
        if (messages.length === 0) {
          el.chatHistoryContainer.innerHTML = '<div class="chat-history-empty">No chat history recorded yet. Send a request to populate history.</div>';
          return;
        }

        el.chatHistoryContainer.innerHTML = '';
        messages.forEach((msg, idx) => {
          const isUser = msg.role === 'user';
          const roleClass = isUser ? 'chat-msg-user' : 'chat-msg-assistant';
          const roleLabelClass = isUser ? 'chat-msg-role-user' : 'chat-msg-role-assistant';
          const roleText = isUser ? 'User' : 'Assistant';
          const contentText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2);

          const msgDiv = document.createElement('div');
          msgDiv.className = `chat-msg ${roleClass}`;
          msgDiv.innerHTML = `
            <div class="chat-msg-header">
              <span class="chat-msg-role ${roleLabelClass}">${escapeHtml(roleText)}</span>
              <button class="btn-icon btn-copy-msg" data-msg-idx="${idx}" title="Copy message text">
                <i data-lucide="copy"></i>
              </button>
            </div>
            <div class="chat-msg-body">${escapeHtml(contentText)}</div>
          `;

          const copyBtn = msgDiv.querySelector('.btn-copy-msg');
          if (copyBtn) {
            copyBtn.addEventListener('click', () => {
              navigator.clipboard.writeText(contentText).then(() => {
                log('Copied message text to clipboard!', 'info');
              }).catch(err => {
                log(`Failed to copy message: ${err.message}`, 'error');
              });
            });
          }

          el.chatHistoryContainer.appendChild(msgDiv);
        });

        if (window.lucide) window.lucide.createIcons();
      }
    } catch (err) {
      log(`Failed to load chat history: ${err.message}`, 'error');
      if (el.chatHistoryContainer) {
        el.chatHistoryContainer.innerHTML = `<div class="chat-history-empty text-danger">Error loading history: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  async function saveChatContext() {
    if (!el.chatContextInput) return;
    const contextVal = el.chatContextInput.value;
    try {
      const res = await fetch('/v1/chat/context', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ context: contextVal })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.currentChatContext = contextVal;
      if (el.contextCharBadge) {
        el.contextCharBadge.textContent = `${contextVal.length.toLocaleString()} chars`;
      }
      log('Chat context saved successfully to Upstash Redis!', 'info');
    } catch (err) {
      log(`Failed to save chat context: ${err.message}`, 'error');
    }
  }

  function copyAllHistory() {
    if (!state.currentChatMessages || state.currentChatMessages.length === 0) {
      log('No messages in chat history to copy.', 'warn');
      return;
    }
    const formatted = state.currentChatMessages.map(m => {
      const roleName = m.role === 'user' ? 'User' : 'Assistant';
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2);
      return `[${roleName}]:\n${text}`;
    }).join('\n\n---\n\n');

    navigator.clipboard.writeText(formatted).then(() => {
      log('Copied all chat messages to clipboard!', 'info');
    }).catch(err => {
      log(`Failed to copy messages: ${err.message}`, 'error');
    });
  }

  async function clearChatHistory() {
    if (!confirm('Are you sure you want to clear chat messages? (Context will be preserved)')) return;
    try {
      const res = await fetch('/v1/chat/history?context=false', {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log('Chat messages cleared successfully.', 'info');
      loadChatHistory();
    } catch (err) {
      log(`Failed to clear chat history: ${err.message}`, 'error');
    }
  }

  async function loadChatSummary() {
    if (!el.summaryResult) return;
    try {
      const res = await fetch('/v1/chat/summary', { headers: getHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (data.summary) {
        el.summaryResult.textContent = data.summary;
      }
    } catch (err) {
      log(`Failed to load cached summary: ${err.message}`, 'warn');
    }
  }

  async function generateSummary() {
    if (!el.summaryResult || !el.btnGenerateSummary) return;

    const promptText = el.summaryPrompt ? el.summaryPrompt.value.trim() : '';
    const modelText = el.summaryModel ? el.summaryModel.value.trim() : 'z-ai/glm-5.2';

    const originalBtnText = el.btnGenerateSummary.innerHTML;
    el.btnGenerateSummary.disabled = true;
    el.btnGenerateSummary.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Summarizing...';
    if (window.lucide) window.lucide.createIcons();

    el.summaryResult.textContent = '';

    try {
      const res = await fetch('/v1/chat/summary', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ prompt: promptText, model: modelText })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let usedModelName = modelText;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          if (trimmed.includes('[DONE]')) continue;

          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.content) {
              el.summaryResult.textContent += parsed.content;
              if (el.summaryResultBox) {
                el.summaryResultBox.scrollTop = el.summaryResultBox.scrollHeight;
              }
            }
            if (parsed.model_used) {
              usedModelName = parsed.model_used;
            }
          } catch (e) {
            if (e.message && !e.message.includes('JSON')) throw e;
          }
        }
      }

      log(`Summary generated and streamed successfully using ${usedModelName}!`, 'info');
    } catch (err) {
      log(`Summary generation failed: ${err.message}`, 'error');
      if (!el.summaryResult.textContent) {
        el.summaryResult.textContent = `Error: ${err.message}`;
      }
    } finally {
      el.btnGenerateSummary.disabled = false;
      el.btnGenerateSummary.innerHTML = originalBtnText;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  // --- INITIALIZATION ---
  async function init() {
    bindEvents();
    const isAuth = await verifyAuthKey(state.authKey);
    if (isAuth) {
      loadLorebookStore();
      loadSystemPromptStore();
      loadModelConfig();
      selectSpItem('sp_base');
    }

  }

  document.addEventListener('DOMContentLoaded', init);
})();
