// .releaserc.js
module.exports = {
  branches: [
    "main",
    { name: "beta", prerelease: true },
    { name: "alpha", prerelease: true },
  ],
  plugins: [
    "@semantic-release/commit-analyzer",

    // 【核心修改】
    // 将官方的 release-notes-generator 替换为我们自己的脚本
    "./scripts/generateNotes.js",

    [
      "@semantic-release/npm",
      {
        npmPublish: true, // 确保发布到 npm
      },
    ],
    [
      "@semantic-release/github",
      {
        // 根据你的项目构建产物目录配置，例如 'dist/**'
        assets: ["dist/**", "lib/**"],
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "pnpm-lock.yaml", "CHANGELOG.md"],
        message:
          "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
  ],
};
