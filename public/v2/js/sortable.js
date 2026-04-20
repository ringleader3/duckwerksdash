// Shared localStorage-backed sort state utility.
// Usage: call dwSortable.load(view, defaultCol, defaultDir) in init()
//        call dwSortable.save(view, col, dir) in sortBy()
window.dwSortable = {
  load(view, defaultCol, defaultDir) {
    try {
      const saved = JSON.parse(localStorage.getItem('dw_sort_' + view));
      if (saved?.col) return { col: saved.col, dir: saved.dir || defaultDir };
    } catch {}
    return { col: defaultCol, dir: defaultDir };
  },
  save(view, col, dir) {
    try { localStorage.setItem('dw_sort_' + view, JSON.stringify({ col, dir })); } catch {}
  },
};
