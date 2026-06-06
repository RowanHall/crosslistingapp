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
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
