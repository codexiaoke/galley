# Contributing

Thanks for looking. Issues and pull requests are welcome, in English or Chinese — write in whichever you
are comfortable with.

## What fits

Bug reports, fixes, documentation, translations, and features that a single-author blog actually needs.

What does not fit, by design: a plugin system, a theme marketplace, multi-user accounts, a drag-and-drop
editor, and distribution to other platforms. These are listed as out of scope in
[docs/requirements.md](docs/requirements.md) with the reasoning. Galley is meant to be forked when you
want it to be something else, and the code is organised to make that bearable — business rules sit in
`src/core` with no framework imports, and the front end is plain CSS variables and `galley-` classes.

If you are unsure whether something fits, open an issue before writing code.

## Before you open a pull request

```bash
pnpm test && pnpm typecheck && pnpm lint
```

All three have to pass. Then:

- Read [AGENTS.md](AGENTS.md). It is short, and it holds the conventions this codebase actually relies on
  — where business rules live, how front-end data loading has to be written, and a few traps that have
  already bitten us.
- Changed the database schema? Run `pnpm db:generate` and commit the migration.
- Added a front-end style? Use the existing colour and layout variables, so the three themes keep working.
- Add a test for behaviour you changed. The suite is fast and runs against an in-memory database.
- Keep comments in the voice of the surrounding file: explain *why*, in Chinese, the way the rest of the
  code does.

Commit messages and PR descriptions in English, one topic per pull request.

## Reporting a bug

Say what you did, what happened, and what you expected. Include the version (the image tag or commit),
how you deployed it, and anything from `./deploy.sh logs` that looks related. A screenshot helps for
anything visual.

Found a security problem? Please do not open a public issue — email the address on
[the author's profile](https://github.com/codexiaoke) instead.

---

# 参与贡献

欢迎提 issue 和 PR，中文英文都行。

**适合提的**：缺陷、修复、文档、翻译，以及一个单人博客真正需要的功能。

**刻意不做的**：插件系统、主题市场、多用户账号、拖拽编辑器、向其他平台分发。
这些在 [docs/requirements.md](docs/requirements.md) 的「明确不做」里列着，也写了为什么。
想要别的样子就 fork——代码是按这个前提组织的：业务规则都在 `src/core`，不引入框架；
前台样式只用 CSS 变量和 `galley-` 开头的类。

拿不准合不合适，先开个 issue 聊。

**提 PR 之前**跑一遍 `pnpm test && pnpm typecheck && pnpm lint`，三个都要过，并且：

- 读一下 [AGENTS.md](AGENTS.md)，不长，但写的都是这个仓库真正依赖的约定和已经踩过的坑。
- 改了表结构就运行 `pnpm db:generate`，把迁移一起提交。
- 新写前台样式时用现有的颜色和版式变量，否则三套主题会错位。
- 给改动补测试。测试跑在内存数据库上，很快。
- 注释跟着周围的文件走：用中文写清楚**为什么**这么做。

提交信息和 PR 说明用英文，一个 PR 只做一件事。

**报缺陷**时说清楚：你做了什么、发生了什么、你以为会发生什么，加上版本（镜像标签或提交号）、
怎么部署的，以及 `./deploy.sh logs` 里看起来相关的内容。界面问题请附截图。

发现安全问题请不要公开提 issue，发邮件给[作者](https://github.com/codexiaoke)。
