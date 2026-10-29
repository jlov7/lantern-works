import { createContext, useContext } from 'react';
import type { Resources } from './materials';
export const Materials = createContext<Resources | null>(null);
export function useMaterials() { return useContext(Materials)!; }
