'use strict';

// Foundry tab: text list grouped by cluster. Each machine shows desc,
// build cost, and every recipe's inputs -> outputs with cycle time.
// Read-only — there's no foundry-place cheat in 2a/b/c, so no actions.

const TabFoundry = (function () {

  function fmtItems(arr) {
    if (!arr || !arr.length) return '—';
    return arr.map(s => `${s.n}× ${s.id}`).join(' + ');
  }

  function buildMachine(m) {
    const card = document.createElement('div');
    card.className = 'dev-foundry-machine';
    card.dataset.search = (m.id + ' ' + (m.name || '')).toLowerCase();

    const head = document.createElement('div');
    head.className = 'dev-foundry-head';
    const name = document.createElement('span');
    name.className = 'dev-foundry-name';
    name.textContent = m.name || m.id;
    head.appendChild(name);
    if (m.footprint) {
      const fp = document.createElement('span');
      fp.className = 'dev-foundry-fp';
      fp.textContent = `${m.footprint.w}×${m.footprint.h}`;
      head.appendChild(fp);
    }
    if (m.hp) {
      const hp = document.createElement('span');
      hp.className = 'dev-foundry-fp';
      hp.textContent = `hp ${m.hp}`;
      head.appendChild(hp);
    }
    card.appendChild(head);

    if (m.desc) {
      const desc = document.createElement('div');
      desc.className = 'dev-foundry-desc';
      desc.textContent = m.desc;
      card.appendChild(desc);
    }

    if (m.buildCost && m.buildCost.length) {
      const cost = document.createElement('div');
      cost.className = 'dev-foundry-cost';
      cost.textContent = `build: ${fmtItems(m.buildCost)}`;
      card.appendChild(cost);
    }

    if (m.recipes && m.recipes.length) {
      const list = document.createElement('div');
      list.className = 'dev-foundry-recipes';
      for (const r of m.recipes) {
        const row = document.createElement('div');
        row.className = 'dev-foundry-recipe';
        const inText  = fmtItems(r.in);
        const outText = fmtItems(r.out);
        const cycle = r.cycle != null ? `  (${r.cycle}s)` : '';
        row.textContent = `${r.label || r.id}: ${inText} → ${outText}${cycle}`;
        list.appendChild(row);
      }
      card.appendChild(list);
    } else {
      const empty = document.createElement('div');
      empty.className = 'dev-foundry-recipe';
      empty.textContent = '(no recipes)';
      card.appendChild(empty);
    }

    return card;
  }

  function mount(container) {
    container.innerHTML = '';
    // FOUNDRY_MACHINES is `const` in foundry.js — visible as a bare identifier
    // across classic scripts but not on `window`.
    if (typeof FOUNDRY_MACHINES === 'undefined') {
      container.textContent = 'FOUNDRY_MACHINES not loaded';
      return;
    }
    const registry = FOUNDRY_MACHINES;
    if (!Object.keys(registry).length) {
      container.textContent = 'FOUNDRY_MACHINES registry is empty.';
      return;
    }

    const ids = Object.keys(registry).sort();

    // Group by cluster, preserving first-seen order so the dev sees clusters
    // in roughly the load order from index.html (EXTRACTION → SMELTING → ...).
    const clusterOrder = [];
    const byCluster = {};
    for (const id of ids) {
      const m = registry[id];
      const c = m.cluster || 'OTHER';
      if (!byCluster[c]) { byCluster[c] = []; clusterOrder.push(c); }
      byCluster[c].push(m);
    }

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'dev-tab-toolbar';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = `search ${ids.length} machines…`;
    const count = document.createElement('span');
    count.className = 'dev-tab-count';
    count.textContent = `${ids.length} machines · ${clusterOrder.length} clusters`;
    toolbar.appendChild(search);
    toolbar.appendChild(count);
    container.appendChild(toolbar);

    // Render each cluster as a section.
    const tree = document.createElement('div');
    tree.className = 'dev-foundry-tree';
    container.appendChild(tree);

    for (const c of clusterOrder) {
      const section = document.createElement('section');
      section.className = 'dev-foundry-cluster';
      section.dataset.cluster = c;
      const h = document.createElement('h3');
      h.textContent = `${c} · ${byCluster[c].length}`;
      section.appendChild(h);
      const list = document.createElement('div');
      list.className = 'dev-foundry-machines';
      for (const m of byCluster[c]) list.appendChild(buildMachine(m));
      section.appendChild(list);
      tree.appendChild(section);
    }

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      for (const sec of tree.children) {
        let visibleInCluster = 0;
        const machines = sec.querySelector('.dev-foundry-machines');
        if (!machines) continue;
        for (const card of machines.children) {
          const match = !q || card.dataset.search.includes(q);
          card.style.display = match ? '' : 'none';
          if (match) { visibleInCluster++; shown++; }
        }
        sec.style.display = visibleInCluster ? '' : 'none';
      }
      count.textContent = q ? `${shown}/${ids.length} match` : `${ids.length} machines · ${clusterOrder.length} clusters`;
    });
  }

  return { mount };
})();

window.TabFoundry = TabFoundry;
