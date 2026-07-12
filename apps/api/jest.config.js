module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  // Integration tests butuh Postgres nyata - dijalankan terpisah via
  // `pnpm test:integration`, tidak lewat CI (belum ada service DB di CI).
  testPathIgnorePatterns: ["\\.integration\\.spec\\.ts$"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
};
