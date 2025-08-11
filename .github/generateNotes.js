// scripts/customGenerateNotes.js
const { generateNotes } = require("@semantic-release/release-notes-generator");
const semver = require("semver");

/**
 * 这是一个自定义的 semantic-release 插件。
 * 它的核心任务是：在 alpha 分支上，如果上一个版本是 beta 版或正式版，
 * 就强制将版本号提升一个 minor 版本，并重置为 -alpha.1。
 */
module.exports.generateNotes = async (pluginConfig, context) => {
  const { logger, branch, lastRelease, nextRelease } = context;

  // 默认情况下，semantic-release 已经根据 commit 分析出了一个 nextRelease
  // 例如：lastRelease.version 是 '1.1.0-beta.2'，commit 是 feat，nextRelease.version 会是 '1.1.0-alpha.3'

  let newVersion = nextRelease.version; // 默认使用官方计算的版本

  // === 在这里插入你的核心版本计算逻辑 ===
  // 仅在 alpha 分支上，且存在上一个版本时，执行特殊逻辑
  if (branch.name === "alpha" && lastRelease && lastRelease.version) {
    logger.log("在 alpha 分支上运行自定义版本逻辑。");

    const lastSemver = semver.parse(lastRelease.version);

    // 检查上一个版本是否是 beta 或 main 分支的正式版（即非 alpha 版）
    // prerelease[0] 不等于 'alpha' 就意味着它是 beta 版或正式版
    if (!lastSemver.prerelease || lastSemver.prerelease[0] !== "alpha") {
      logger.log(
        `上一个版本 (${lastRelease.version}) 来自 beta 或 main，需要提升 minor 版本。`
      );

      // 将上一个版本（无论是 1.1.0-beta.2 还是 1.1.0）提升一个 minor 版本
      const nextMinorVersion = semver.inc(
        lastRelease.version,
        "preminor",
        "alpha"
      ); // 使用 preminor 会得到 1.2.0-alpha.0

      // 我们需要的是 alpha.1，所以要手动处理
      const baseNextMinor = `${semver.major(nextMinorVersion)}.${semver.minor(
        nextMinorVersion
      )}.0`; // 得到 "1.2.0"
      newVersion = `${baseNextMinor}-alpha.1`; // 拼接成 "1.2.0-alpha.1"

      logger.log(`自定义版本计算完成，新版本为: ${newVersion}`);

      // *** 关键步骤 ***
      // 用你计算出的新版本号覆盖 context 中的版本信息
      logger.log(
        `将版本从 ${context.nextRelease.version} 覆盖为 ${newVersion}`
      );
      context.nextRelease.version = newVersion;
      context.nextRelease.gitTag = `v${newVersion}`; // 同样要更新 git tag
    } else {
      logger.log(
        `上一个版本 (${lastRelease.version}) 已经是 alpha 版，使用默认递增逻辑。`
      );
      // 如果上一个版本已经是 alpha (例如 1.2.0-alpha.1)，那么 semantic-release 默认会计算出 1.2.0-alpha.2，这是正确的，无需干预。
    }
  }

  // 最后，无论是否修改了版本号，都调用原始的 generateNotes 插件来完成生成 CHANGELOG.md 的本职工作
  return generateNotes(pluginConfig, context);
};
