'use client';
import { create } from 'zustand';

export const useSessionStore = create((set) => ({
  sessionId: null,
  startTime: null,
  reviewedItems: [],
  setSessionId: (id) => set({ sessionId: id, startTime: Date.now(), reviewedItems: [] }),
  addReviewed: (itemId) => set((s) => ({ reviewedItems: [...s.reviewedItems, itemId] })),
  clearSession: () => set({ sessionId: null, startTime: null, reviewedItems: [] }),
}));
