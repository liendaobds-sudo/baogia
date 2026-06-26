/** @type {import('ts-jest').JestConfigWithTsJest} */
const fs = require('fs');
const path = require('path');

// Only include jest-dom setup if it is installed.
const setupFiles = [];
try {
  require.resolve('@testing-library/jest-dom');
  setupFiles.push('@testing-library/jest-dom');
} catch {
  // jest-dom not present; skip
}

module.exports = {
  // Default to jsdom so React component tests work; pure logic tests run fine here too.
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: setupFiles,
  // Map the "@/..." path alias to src/ (matches tsconfig "paths").
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/src/**/*.spec.tsx',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          // Ensure JSX/TSX compiles with the project's React 19 automatic runtime.
          jsx: 'react-jsx',
          // ts-jest emits CommonJS for the test runtime.
          esModuleInterop: true,
          allowJs: true,
          resolveJsonModule: true,
        },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};
