import type { Folder } from './model.ts';

export const ESTATE: Folder = { name: 'Estate', uid: 'estate' };
export const SERVICES: Folder = { name: 'Services', uid: 'services' };
export const FRONTEND: Folder = { name: 'Frontend', uid: 'frontend' };
export const PLATFORM: Folder = { name: 'Platform', uid: 'platform' };
export const BUSINESS: Folder = { name: 'Business', uid: 'business' };

export const FOLDERS: Folder[] = [ESTATE, SERVICES, FRONTEND, PLATFORM, BUSINESS];
