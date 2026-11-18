import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SITE_CONFIG, type SiteConfigState } from '../data/profileData';
import type { WebMcpModelContext, WebMcpToolDefinition } from '../types/webmcp';
import {
  buildPublicWebMcpTools,
  registerPublicWebMcpTools,
  type PublicAgentSection,
} from './webMcp';

const SAMPLE_CONFIG: SiteConfigState = {
  ...DEFAULT_SITE_CONFIG,
  profile: {
    ...DEFAULT_SITE_CONFIG.profile,
    name: 'Rajdeep',
    fullName: 'Rajdeep Bhattacharyya',
    handle: '@_rajdeep.007_',
    role: 'IT Student · SaaS & Product Builder',
    location: 'Kolkata, India',
    githubUsername: 'rajdeepbhattacharyya25-pixel',
    bioPrefix: 'Building with ',
    bioCode: 'React, TypeScript, ESP32',
  },
  socials: [
    {
      id: 's1',
      platform: 'devfolio',
      label: 'Devfolio',
      handle: '@rajdeep',
      url: 'https://devfolio.co/@rajdeep',
    },
    {
      id: 's2',
      platform: 'github',
      label: 'GitHub',
      handle: '@rajdeepbhattacharyya25-pixel',
      url: 'https://github.com/rajdeepbhattacharyya25-pixel',
    },
  ],
  links: [
    {
      id: 'l1',
      title: 'DualBeast',
      url: 'https://dualbeast.vercel.app',
      displayUrl: 'dualbeast.vercel.app',
      description: 'AI product showcase',
      category: 'project',
      previewType: 'auto',
      pinned: true,
      clicks: 42,
    },
    {
      id: 'l2',
      title: 'Arcade Mini',
      url: 'https://arcade.example.com',
      displayUrl: 'arcade.example.com',
      description: 'Browser game prototype',
      category: 'game',
      previewType: 'chess',
      pinned: false,
      clicks: 10,
    },
  ],
};

test('buildPublicWebMcpTools exposes 4 read-only public tools with valid JSON Schemas', async () => {
  const navigated: PublicAgentSection[] = [];
  const tools = buildPublicWebMcpTools({
    getConfig: () => SAMPLE_CONFIG,
    onNavigateSection: (s) => navigated.push(s),
  });

  assert.equal(tools.length, 4);
  for (const tool of tools) {
    assert.ok(tool.name.length > 0);
    assert.ok(tool.description.length > 10);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.annotations?.readOnlyHint, true);
  }

  const profileTool = tools.find((t) => t.name === 'get_developer_profile')!;
  const profileResult = (await profileTool.execute({})) as Record<string, unknown>;
  assert.equal(profileResult.name, 'Rajdeep Bhattacharyya');
  assert.equal(profileResult.totalLinks, 2);

  const linksTool = tools.find((t) => t.name === 'list_featured_links')!;
  const pinnedRes = (await linksTool.execute({ pinnedOnly: true })) as {
    count: number;
    links: Array<{ id: string }>;
  };
  assert.equal(pinnedRes.count, 1);
  assert.equal(pinnedRes.links[0].id, 'l1');

  const gameRes = (await linksTool.execute({ category: 'game' })) as {
    count: number;
    links: Array<{ id: string }>;
  };
  assert.equal(gameRes.count, 1);
  assert.equal(gameRes.links[0].id, 'l2');

  const socialsTool = tools.find((t) => t.name === 'list_social_profiles')!;
  const socialsRes = (await socialsTool.execute({})) as { count: number };
  assert.equal(socialsRes.count, 2);

  const navTool = tools.find((t) => t.name === 'navigate_hub_section')!;
  const okNav = (await navTool.execute({ section: 'work' })) as { ok: boolean };
  assert.equal(okNav.ok, true);
  assert.deepEqual(navigated, ['work']);

  // Admin navigation must be rejected for public agents
  const blockedNav = (await navTool.execute({ section: 'admin' })) as { ok: boolean };
  assert.equal(blockedNav.ok, false);
});

test('registerPublicWebMcpTools registers via registerTool with AbortSignal and cleans up cleanly', () => {
  const registered: Array<{ tool: WebMcpToolDefinition; signal?: AbortSignal }> = [];
  const unregistered: string[] = [];

  const mockCtx: WebMcpModelContext = {
    registerTool: (tool, opts) => {
      registered.push({ tool, signal: opts?.signal });
    },
    unregisterTool: (name) => {
      unregistered.push(name);
    },
  };

  const cleanup = registerPublicWebMcpTools(
    {
      getConfig: () => SAMPLE_CONFIG,
      onNavigateSection: () => {},
    },
    mockCtx
  );

  assert.equal(registered.length, 4);
  assert.equal(registered[0].signal?.aborted, false);

  cleanup();
  assert.equal(registered[0].signal?.aborted, true);
  assert.equal(unregistered.length, 4);
});
