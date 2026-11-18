import type { SiteConfigState } from '../data/profileData';
import type { WebMcpModelContext, WebMcpToolDefinition } from '../types/webmcp';
import {
  buildProfilePlainBio,
  buildVerifiedSameAsUrls,
  parseDeveloperSkillsList,
} from './seoAndGeo';

export type PublicAgentSection = 'hub' | 'work' | 'posts' | 'pass';

const ALLOWED_AGENT_SECTIONS = new Set<PublicAgentSection>([
  'hub',
  'work',
  'posts',
  'pass',
]);

export interface PublicWebMcpContextDeps {
  getConfig: () => SiteConfigState;
  onNavigateSection: (section: PublicAgentSection) => void;
}

/**
 * Builds public, read-only & safe-navigation WebMCP tools for AI agents visiting the Link Hub.
 * Strictly excludes all private/admin capabilities.
 */
export function buildPublicWebMcpTools(
  deps: PublicWebMcpContextDeps
): WebMcpToolDefinition[] {
  return [
    {
      name: 'get_developer_profile',
      description:
        'Retrieve structured developer profile details (name, handle, role, location, bio, availability, skills, and verified social profiles).',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      execute: () => {
        const cfg = deps.getConfig();
        const p = cfg.profile;
        return {
          name: p.fullName || p.name,
          handle: p.handle,
          role: p.role,
          location: p.location,
          availabilityStatus: p.availabilityStatus || '',
          bio: buildProfilePlainBio(cfg),
          skills: parseDeveloperSkillsList(cfg),
          githubUsername: p.githubUsername,
          sameAs: buildVerifiedSameAsUrls(cfg),
          totalLinks: cfg.links.length,
          totalPosts: cfg.posts.length,
        };
      },
    },
    {
      name: 'list_featured_links',
      description:
        'List featured projects, products, and curated links on the Link Hub, optionally filtered by category or pinned status.',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optional category slug to filter links (e.g. project, product, game).',
          },
          pinnedOnly: {
            type: 'boolean',
            description: 'When true, returns only pinned primary links.',
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      execute: (args) => {
        const cfg = deps.getConfig();
        const rawCategory =
          typeof args?.category === 'string' ? args.category.trim().toLowerCase() : '';
        const pinnedOnly = Boolean(args?.pinnedOnly);

        const filtered = cfg.links.filter((item) => {
          if (pinnedOnly && !item.pinned) return false;
          if (rawCategory && rawCategory !== 'all') {
            return String(item.category || '').trim().toLowerCase() === rawCategory;
          }
          return true;
        });

        return {
          count: filtered.length,
          links: filtered.map((item) => ({
            id: item.id,
            title: item.title,
            category: item.category,
            url: item.url,
            description: item.description,
            pinned: Boolean(item.pinned),
          })),
        };
      },
    },
    {
      name: 'list_social_profiles',
      description:
        'List all verified social and developer community links (GitHub, LinkedIn, Devfolio, Instagram, Threads, Discord, Telegram, etc.).',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      execute: () => {
        const cfg = deps.getConfig();
        return {
          count: cfg.socials.length,
          socials: cfg.socials.map((soc) => ({
            platform: soc.platform,
            label: soc.label,
            handle: soc.handle,
            url: soc.url,
          })),
        };
      },
    },
    {
      name: 'navigate_hub_section',
      description:
        'Switch the visible public Link Hub section between main profile hub, work-with-me inquiry page, blog posts, or interactive 3D builder pass.',
      inputSchema: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['hub', 'work', 'posts', 'pass'],
            description: 'Target public section: hub, work, posts, or pass.',
          },
        },
        required: ['section'],
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
      execute: (args) => {
        const target = String(args?.section || '').trim().toLowerCase() as PublicAgentSection;
        if (!ALLOWED_AGENT_SECTIONS.has(target)) {
          return {
            ok: false,
            error: 'Invalid section. Allowed public sections: hub, work, posts, pass.',
          };
        }
        deps.onNavigateSection(target);
        return { ok: true, activeSection: target };
      },
    },
  ];
}

export function resolveBrowserModelContext(): WebMcpModelContext | null {
  if (typeof navigator !== 'undefined' && navigator.modelContext) {
    return navigator.modelContext;
  }
  if (typeof document !== 'undefined' && document.modelContext) {
    return document.modelContext;
  }
  return null;
}

/**
 * Registers public WebMCP tools with the browser's Model Context API when available.
 * Returns a cleanup function that unregisters tools cleanly via AbortController.
 */
export function registerPublicWebMcpTools(
  deps: PublicWebMcpContextDeps,
  modelContextOverride?: WebMcpModelContext | null
): () => void {
  const ctx =
    modelContextOverride !== undefined
      ? modelContextOverride
      : resolveBrowserModelContext();

  if (!ctx) {
    return () => {};
  }

  const tools = buildPublicWebMcpTools(deps);
  const controller = new AbortController();

  if (typeof ctx.registerTool === 'function') {
    for (const tool of tools) {
      try {
        void ctx.registerTool(tool, { signal: controller.signal });
      } catch {
        // Non-fatal if experimental browser implementation rejects a duplicate tool
      }
    }
    return () => {
      controller.abort();
      if (typeof ctx.unregisterTool === 'function') {
        for (const tool of tools) {
          try {
            void ctx.unregisterTool(tool.name);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    };
  }

  if (typeof ctx.provideContext === 'function') {
    try {
      void ctx.provideContext({ tools });
    } catch {
      // Non-fatal in experimental implementations
    }
    return () => {
      if (typeof ctx.clearContext === 'function') {
        try {
          void ctx.clearContext();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }

  return () => {};
}
