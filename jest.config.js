/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },
  // Track coverage for all service and utility files
  collectCoverageFrom: [
    'src/backend/service/**/*.ts',
    'src/backend/utils/auth.ts',
    'src/backend/utils/types.ts',
    'src/frontend/client/history-table.tsx',
    '!src/**/*.d.ts',
  ],
  // Progressive thresholds — auth.ts DB functions pull down global averages.
  // Per-file thresholds enforce quality on fully unit-testable services.
  coverageThreshold: {
    global: {
      statements: 38,
      branches: 22,
      functions: 45,
      lines: 40,
    },
    './src/backend/service/message.service.ts': { statements: 95, branches: 80, functions: 95, lines: 95 },
    './src/backend/service/ui.service.ts':      { statements: 95, branches: 80, functions: 95, lines: 95 },
    './src/backend/service/session.service.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/backend/service/media.service.ts':   { statements: 80, branches: 70, functions: 95, lines: 80 },
  },
  // Separate environments for backend (node) and frontend (jsdom)
  projects: [
    {
      displayName: 'backend',
      testEnvironment: 'node',
      preset: 'ts-jest/presets/default-esm',
      extensionsToTreatAsEsm: ['.ts'],
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
      testMatch: ['**/backend/test/**/*.test.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { useESM: true, isolatedModules: true, diagnostics: { ignoreCodes: [151002] } }],
      },
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      preset: 'ts-jest/presets/default-esm',
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
      testMatch: ['**/frontend/test/**/*.test.tsx'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { useESM: true, isolatedModules: true, diagnostics: { ignoreCodes: [151002] }, tsconfig: { jsx: 'react-jsx', jsxImportSource: 'react' } }],
      },
    },
  ],
};
