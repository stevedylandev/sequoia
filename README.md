# Sequoia

![cover](https://sequoia.pub/og.png)

A CLI for publishing [Standard.site](https://standard.site) documents to the [AT Protocol](https://atproto.com).

> [!NOTE]
> [Visit the docs for more info](https://sequoia.pub)

## Quickstart

Install the CLI

```bash
pnpm i -g sequoia-cli
```

Authorize

```bash
sequoia auth
```

Initialize in your blog repo

```bash
sequoia init
```

Publish your posts

```bash
sequoia publish
```

Inject link tags for verification (optional)

```bash
sequoia inject
```

[Full documentation](https://sequoia.pub)

## Local Development

Make sure [Bun](https://bun.com) is installed

Clone the git repo and install dependencies

```bash
git clone git@tangled.org:stevedylan.dev/sequoia
cd sequoia
bun install
```

Move into `packages/cli` and build/test

```bash
cd packages/cli
bun dev
```

## License

MIT

## Contact

[ATProto](https://pds.ls/at://stevedylan.dev)

[Email](mailto:contact@stavedylan.dev)

<a href="https://ko-fi.com/stevedylandev" target="_blank" rel="noreferrer">
  <img width="200" src="https://files.stevedylan.dev/support_me_on_kofi_dark.png" alt="ko-fi badge" />
</a>
