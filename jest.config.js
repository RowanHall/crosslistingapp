const nextJest = require('next/jest')

const createJestConfig = nextJest({
    // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
    dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testEnvironment: 'jest-environment-jsdom',
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
    },
    // Exclude shared test helpers, fixtures, and the Playwright e2e dir from Jest discovery.
    // Playwright runs e2e separately via `npm run test:e2e`.
    testPathIgnorePatterns: [
        '/node_modules/',
        '/__tests__/helpers/',
        '/__tests__/__fixtures__/',
        '/e2e/',
    ],
    // Measure coverage across the whole app — not just files an existing test happens
    // to import — so the reported % reflects true coverage and untested files show as 0.
    collectCoverageFrom: [
        'actions/**/*.{ts,tsx}',
        'app/api/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'store/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'utils/**/*.{ts,tsx}',
        // Exclusions: type-only barrels, generated/route layout files, and styling-only
        // primitives that carry no logic worth asserting on.
        '!**/*.d.ts',
        '!components/ui/**',
        '!**/node_modules/**',
    ],
    // CI gate. Thresholds are intentionally set a little below current measured
    // coverage so the suite fails when coverage regresses, while leaving headroom
    // for incidental churn. Raise these as coverage improves.
    coverageThreshold: {
        global: {
            statements: 45,
            branches: 40,
            functions: 33,
            lines: 45,
        },
    },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
