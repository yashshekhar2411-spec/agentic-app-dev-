// Whether the left sidebar is open. The three-line button, a swipe from the screen edge and the Android back button all use this.
import { create } from 'zustand';

interface DrawerState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useDrawer = create<DrawerState>()((set) => ({ open: false, setOpen: (open) => set({ open }) }));

export const openDrawer = () => useDrawer.getState().setOpen(true);
export const closeDrawer = () => useDrawer.getState().setOpen(false);
