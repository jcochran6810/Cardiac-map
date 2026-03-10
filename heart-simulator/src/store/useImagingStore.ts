import { create } from 'zustand';

interface ImagingState {
  selectedViewId: string | null;
  modalityFilter: string | null;
  showOverlay: boolean;
  overlayOpacity: number;

  selectView: (id: string | null) => void;
  setModalityFilter: (modality: string | null) => void;
  toggleOverlay: () => void;
  setOverlayOpacity: (opacity: number) => void;
}

export const useImagingStore = create<ImagingState>((set) => ({
  selectedViewId: null,
  modalityFilter: null,
  showOverlay: false,
  overlayOpacity: 0.5,

  selectView: (id) => set({ selectedViewId: id }),
  setModalityFilter: (modalityFilter) => set({ modalityFilter }),
  toggleOverlay: () => set((s) => ({ showOverlay: !s.showOverlay })),
  setOverlayOpacity: (overlayOpacity) => set({ overlayOpacity }),
}));
