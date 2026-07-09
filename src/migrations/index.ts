import * as migration_20260709_134221_initial from './20260709_134221_initial';

export const migrations = [
  {
    up: migration_20260709_134221_initial.up,
    down: migration_20260709_134221_initial.down,
    name: '20260709_134221_initial'
  },
];
