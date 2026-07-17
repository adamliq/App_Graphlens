module.exports = {
  rootDir: __dirname,
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.test.jsx'],
  moduleFileExtensions: ['js', 'jsx', 'json'],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  moduleNameMapper: {
    '\\.(css|less)$': '<rootDir>/tests/unit/__mocks__/styleMock.js',
  },
  collectCoverageFrom: [
    'src/main/webapp/shared/**/*.{js,jsx}',
    '!src/main/webapp/shared/**/index.jsx',
  ],
  coverageDirectory: '<rootDir>/coverage',
};
