import { useState, useCallback, useMemo } from 'react';

export interface UseSelectionResult<T extends { id: string }> {
  selected: Set<string>;
  selectedIds: string[];
  selectedItems: T[];
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
  set: (ids: string[]) => void;
  isAllSelected: boolean;
}

/**
 * Manage a Set of selected item ids for any list. Generic — knows nothing about
 * "product" or "video" or "temu". Future list pages just `useSelection(items)`.
 */
export function useSelection<T extends { id: string }>(items: T[]): UseSelectionResult<T> {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((i) => i.id)));
  }, [items]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const set = useCallback((ids: string[]) => setSelected(new Set(ids)), []);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedItems = useMemo(
    () => items.filter((i) => selected.has(i.id)),
    [items, selected]
  );

  return {
    selected,
    selectedIds,
    selectedItems,
    count: selected.size,
    isSelected,
    toggle,
    selectAll,
    clear,
    set,
    isAllSelected: items.length > 0 && selected.size === items.length,
  };
}
