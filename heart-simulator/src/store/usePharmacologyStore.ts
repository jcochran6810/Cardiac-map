import { create } from 'zustand';

interface PharmacologyState {
  selectedMedicationId: string | null;
  classFilter: string | null;
  searchFilter: string;

  selectMedication: (id: string | null) => void;
  setClassFilter: (cls: string | null) => void;
  setSearchFilter: (filter: string) => void;
}

export const usePharmacologyStore = create<PharmacologyState>((set) => ({
  selectedMedicationId: null,
  classFilter: null,
  searchFilter: '',

  selectMedication: (id) => set({ selectedMedicationId: id }),
  setClassFilter: (classFilter) => set({ classFilter }),
  setSearchFilter: (searchFilter) => set({ searchFilter }),
}));
