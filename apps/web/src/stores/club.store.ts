import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Club {
  id: string;
  name: string;
  slug: string;
  profile?: any;
}

interface ClubState {
  selectedClub: Club | null;
  setSelectedClub: (club: Club) => void;
  clearSelectedClub: () => void;
}

export const useClubStore = create<ClubState>()(
  persist(
    set => ({
      selectedClub: null,
      setSelectedClub: club => set({ selectedClub: club }),
      clearSelectedClub: () => set({ selectedClub: null }),
    }),
    { name: 'raqueta-club' },
  ),
);
