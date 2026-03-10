import { create } from 'zustand';

interface ConditionState {
  selectedConditionId: string | null;
  compareConditionId: string | null;
  conditionFilter: string;
  categoryFilter: string | null;

  selectCondition: (id: string | null) => void;
  setCompareCondition: (id: string | null) => void;
  setConditionFilter: (filter: string) => void;
  setCategoryFilter: (category: string | null) => void;
}

export const useConditionStore = create<ConditionState>((set) => ({
  selectedConditionId: null,
  compareConditionId: null,
  conditionFilter: '',
  categoryFilter: null,

  selectCondition: (id) => set({ selectedConditionId: id }),
  setCompareCondition: (id) => set({ compareConditionId: id }),
  setConditionFilter: (conditionFilter) => set({ conditionFilter }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
}));
