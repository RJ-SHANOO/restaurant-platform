import type { BranchSettings } from '@/types/api';

export interface MezbaanTabProps {
  value: BranchSettings;
  set: <K extends keyof BranchSettings>(key: K, next: BranchSettings[K]) => void;
}
