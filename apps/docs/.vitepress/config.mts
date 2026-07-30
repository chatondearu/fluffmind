import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Fluffmind',
  description:
    'Self-hostable, git-backed PKM — markdown + wikilinks as source of truth, with a modern web UI and MCP for AI agents.',
  base: '/fluffmind/',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Contribute', link: '/contribute/overview' },
      {
        text: 'GitHub',
        link: 'https://github.com/chatondearu/fluffmind',
      },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Self-hosting', link: '/guide/self-hosting' },
          { text: 'GitHub sync & auth', link: '/guide/github-sync-auth' },
          { text: 'GitHub App setup', link: '/guide/github-app-setup' },
          { text: 'Agent access: MCP, CLI & skill', link: '/guide/agents' },
          { text: 'MCP for AI agents', link: '/guide/mcp' },
        ],
      },
      {
        text: 'Contribute',
        items: [
          { text: 'Overview', link: '/contribute/overview' },
          { text: 'Dev setup', link: '/contribute/dev-setup' },
          { text: 'Architecture', link: '/contribute/architecture' },
          { text: 'Agent conventions', link: '/contribute/agent-conventions' },
        ],
      },
    ],
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/chatondearu/fluffmind',
      },
    ],
    editLink: {
      pattern:
        'https://github.com/chatondearu/fluffmind/edit/main/apps/docs/:path',
      text: 'Edit this page on GitHub',
    },
    search: {
      provider: 'local',
    },
  },
})
