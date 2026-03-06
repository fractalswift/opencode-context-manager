import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { categorizeFile } from './git-analyzer.js';

/**
 * Codebase Summarizer
 * 
 * Extracts metadata, auto-generates summaries where possible, detects
 * project capabilities (database, auth, integrations, etc.), and determines
 * which files the AI agent needs to read for full context.
 * 
 * This runs as a non-AI preprocessing step (0 tokens) to minimize
 * what the AI agent needs to read.
 */

/**
 * Detect project capabilities by scanning for config files and imports
 * This is pure file/path detection - zero AI tokens
 */
export function detectProjectCapabilities(rootDir, graph = {}) {
  const capabilities = {};
  
  // Collect all imports across the project
  const allImports = new Set();
  for (const entry of Object.values(graph)) {
    for (const importPath of Object.keys(entry.imports || {})) {
      allImports.add(importPath);
    }
  }
  
  // ── Database & ORM ──
  if (existsSync(join(rootDir, 'prisma/schema.prisma'))) {
    capabilities.database = { orm: 'Prisma', schemaFile: 'prisma/schema.prisma' };
  } else if (existsSync(join(rootDir, 'drizzle.config.ts')) || existsSync(join(rootDir, 'drizzle.config.js'))) {
    capabilities.database = { orm: 'Drizzle' };
  } else if (allImports.has('typeorm') || allImports.has('TypeORM')) {
    capabilities.database = { orm: 'TypeORM' };
  } else if (allImports.has('sequelize')) {
    capabilities.database = { orm: 'Sequelize' };
  } else if (allImports.has('mongoose')) {
    capabilities.database = { orm: 'Mongoose', type: 'MongoDB' };
  } else if (allImports.has('knex')) {
    capabilities.database = { orm: 'Knex' };
  }
  
  // ── Authentication ──
  if (allImports.has('@clerk/nextjs') || allImports.has('@clerk/clerk-sdk-node')) {
    capabilities.auth = { provider: 'Clerk' };
  } else if (allImports.has('@auth0/nextjs-auth0') || allImports.has('auth0')) {
    capabilities.auth = { provider: 'Auth0' };
  } else if (allImports.has('next-auth') || allImports.has('@auth/core')) {
    capabilities.auth = { provider: 'NextAuth / Auth.js' };
  } else if (allImports.has('@supabase/auth-helpers-nextjs') || allImports.has('@supabase/supabase-js')) {
    capabilities.auth = { provider: 'Supabase Auth' };
  } else if (allImports.has('passport')) {
    capabilities.auth = { provider: 'Passport.js' };
  } else if (allImports.has('jsonwebtoken') || allImports.has('jose')) {
    capabilities.auth = { strategy: 'JWT (custom)' };
  }
  
  // ── State Management ──
  if (allImports.has('zustand')) {
    capabilities.stateManagement = { client: 'Zustand' };
  } else if (allImports.has('@reduxjs/toolkit') || allImports.has('redux')) {
    capabilities.stateManagement = { client: 'Redux' };
  } else if (allImports.has('jotai')) {
    capabilities.stateManagement = { client: 'Jotai' };
  } else if (allImports.has('recoil')) {
    capabilities.stateManagement = { client: 'Recoil' };
  } else if (allImports.has('pinia')) {
    capabilities.stateManagement = { client: 'Pinia' };
  }
  
  // Server state
  if (allImports.has('@tanstack/react-query') || allImports.has('react-query')) {
    capabilities.stateManagement = { ...capabilities.stateManagement, server: 'React Query' };
  } else if (allImports.has('swr')) {
    capabilities.stateManagement = { ...capabilities.stateManagement, server: 'SWR' };
  } else if (allImports.has('@apollo/client')) {
    capabilities.stateManagement = { ...capabilities.stateManagement, server: 'Apollo Client' };
  }
  
  // ── Third-Party Integrations ──
  const integrations = [];
  if (allImports.has('stripe') || allImports.has('@stripe/stripe-js')) integrations.push('Stripe');
  if (allImports.has('@sendgrid/mail')) integrations.push('SendGrid');
  if (allImports.has('resend')) integrations.push('Resend');
  if (allImports.has('postmark')) integrations.push('Postmark');
  if (allImports.has('@aws-sdk/client-s3') || allImports.has('aws-sdk')) integrations.push('AWS');
  if (allImports.has('@google-cloud/storage')) integrations.push('Google Cloud');
  if (allImports.has('openai')) integrations.push('OpenAI');
  if (allImports.has('@anthropic-ai/sdk')) integrations.push('Anthropic');
  if (allImports.has('twilio')) integrations.push('Twilio');
  if (allImports.has('firebase') || allImports.has('firebase-admin')) integrations.push('Firebase');
  if (allImports.has('@supabase/supabase-js')) integrations.push('Supabase');
  if (integrations.length > 0) capabilities.integrations = integrations;
  
  // ── Monitoring & Error Tracking ──
  if (allImports.has('@sentry/node') || allImports.has('@sentry/nextjs') || allImports.has('@sentry/react')) {
    capabilities.monitoring = { errorTracking: 'Sentry' };
  } else if (allImports.has('@datadog/browser-rum') || allImports.has('dd-trace')) {
    capabilities.monitoring = { apm: 'Datadog' };
  }
  
  if (allImports.has('posthog-js') || allImports.has('posthog-node')) {
    capabilities.analytics = 'PostHog';
  } else if (allImports.has('@segment/analytics-node')) {
    capabilities.analytics = 'Segment';
  }
  
  // ── Styling ──
  if (existsSync(join(rootDir, 'tailwind.config.js')) || existsSync(join(rootDir, 'tailwind.config.ts'))) {
    capabilities.styling = { framework: 'Tailwind CSS' };
  }
  if (allImports.has('@radix-ui/react-dialog') || allImports.has('@radix-ui/react-popover')) {
    capabilities.styling = { ...capabilities.styling, components: 'Radix UI' };
  } else if (allImports.has('@mui/material')) {
    capabilities.styling = { ...capabilities.styling, components: 'Material UI' };
  } else if (allImports.has('@chakra-ui/react')) {
    capabilities.styling = { ...capabilities.styling, components: 'Chakra UI' };
  }
  
  // ── API Style ──
  if (allImports.has('@trpc/server') || allImports.has('@trpc/client')) {
    capabilities.api = { style: 'tRPC' };
  } else if (allImports.has('graphql') || allImports.has('@apollo/server')) {
    capabilities.api = { style: 'GraphQL' };
  } else if (allImports.has('@grpc/grpc-js')) {
    capabilities.api = { style: 'gRPC' };
  }
  if (existsSync(join(rootDir, 'openapi.json')) || existsSync(join(rootDir, 'openapi.yaml'))) {
    capabilities.api = { ...capabilities.api, docs: 'OpenAPI' };
  }
  
  // ── Realtime ──
  if (allImports.has('socket.io') || allImports.has('socket.io-client')) {
    capabilities.realtime = 'Socket.io';
  } else if (allImports.has('ws')) {
    capabilities.realtime = 'WebSocket (ws)';
  } else if (allImports.has('pusher') || allImports.has('pusher-js')) {
    capabilities.realtime = 'Pusher';
  }
  
  // ── Background Jobs ──
  if (allImports.has('bullmq') || allImports.has('bull')) {
    capabilities.queues = 'BullMQ';
  } else if (allImports.has('@aws-sdk/client-sqs')) {
    capabilities.queues = 'AWS SQS';
  }
  
  // ── i18n ──
  if (allImports.has('next-intl')) {
    capabilities.i18n = 'next-intl';
  } else if (allImports.has('i18next') || allImports.has('react-i18next')) {
    capabilities.i18n = 'i18next';
  } else if (allImports.has('react-intl')) {
    capabilities.i18n = 'react-intl';
  }
  
  // ── Validation ──
  if (allImports.has('zod')) {
    capabilities.validation = 'Zod';
  } else if (allImports.has('yup')) {
    capabilities.validation = 'Yup';
  } else if (allImports.has('joi')) {
    capabilities.validation = 'Joi';
  }
  
  // ── Deployment (file-based detection) ──
  const deployment = {};
  if (existsSync(join(rootDir, 'vercel.json')) || existsSync(join(rootDir, '.vercel'))) deployment.platform = 'Vercel';
  if (existsSync(join(rootDir, 'Dockerfile'))) deployment.docker = true;
  if (existsSync(join(rootDir, 'docker-compose.yml')) || existsSync(join(rootDir, 'docker-compose.yaml'))) deployment.dockerCompose = true;
  if (existsSync(join(rootDir, '.github/workflows'))) deployment.ci = 'GitHub Actions';
  if (existsSync(join(rootDir, '.gitlab-ci.yml'))) deployment.ci = 'GitLab CI';
  if (existsSync(join(rootDir, 'fly.toml'))) deployment.platform = 'Fly.io';
  if (existsSync(join(rootDir, 'railway.json')) || existsSync(join(rootDir, 'railway.toml'))) deployment.platform = 'Railway';
  if (existsSync(join(rootDir, 'terraform'))) deployment.iac = 'Terraform';
  if (Object.keys(deployment).length > 0) capabilities.deployment = deployment;
  
  // ── Testing ──
  const testing = {};
  if (allImports.has('vitest')) testing.framework = 'Vitest';
  else if (allImports.has('jest') || existsSync(join(rootDir, 'jest.config.js')) || existsSync(join(rootDir, 'jest.config.ts'))) testing.framework = 'Jest';
  else if (allImports.has('@playwright/test')) testing.framework = 'Playwright';
  else if (allImports.has('cypress')) testing.framework = 'Cypress';
  if (allImports.has('@testing-library/react')) testing.utilities = 'React Testing Library';
  if (Object.keys(testing).length > 0) capabilities.testing = testing;
  
  // ── Logging ──
  if (allImports.has('pino')) capabilities.logging = 'Pino';
  else if (allImports.has('winston')) capabilities.logging = 'Winston';
  
  // ── Monorepo ──
  if (existsSync(join(rootDir, 'turbo.json'))) capabilities.monorepo = 'Turborepo';
  else if (existsSync(join(rootDir, 'nx.json'))) capabilities.monorepo = 'Nx';
  else if (existsSync(join(rootDir, 'lerna.json'))) capabilities.monorepo = 'Lerna';
  else if (existsSync(join(rootDir, 'pnpm-workspace.yaml'))) capabilities.monorepo = 'pnpm workspaces';
  
  // ── Developer Experience ──
  const devex = {};
  if (existsSync(join(rootDir, '.eslintrc.js')) || existsSync(join(rootDir, '.eslintrc.json')) || existsSync(join(rootDir, 'eslint.config.js'))) devex.linting = 'ESLint';
  if (existsSync(join(rootDir, '.prettierrc')) || existsSync(join(rootDir, '.prettierrc.json')) || existsSync(join(rootDir, 'prettier.config.js'))) devex.formatting = 'Prettier';
  if (existsSync(join(rootDir, '.husky'))) devex.gitHooks = 'Husky';
  if (Object.keys(devex).length > 0) capabilities.devExperience = devex;
  
  return capabilities;
}

/**
 * Auto-generate summary for a file based on its static analysis data
 * Returns null if the file needs AI reading (not enough info)
 */
export function autoGenerateSummary(filePath, graphEntry) {
  if (!graphEntry) return null;
  
  const exports = graphEntry.exports || [];
  const lineCount = graphEntry.lineCount || 0;
  const category = categorizeFile(filePath);
  
  // If file has JSDoc on the file itself, use that
  if (graphEntry.fileJSDoc) {
    return {
      summary: graphEntry.fileJSDoc,
      source: 'file-jsdoc',
      confidence: 'high'
    };
  }
  
  // If all exports have JSDoc, combine them
  const exportsWithJSDoc = exports.filter(e => e.jsdoc);
  if (exportsWithJSDoc.length > 0 && exportsWithJSDoc.length === exports.length) {
    const summary = exportsWithJSDoc.map(e => `${e.name}: ${e.jsdoc}`).join('. ');
    return {
      summary: summary.length > 300 ? summary.slice(0, 297) + '...' : summary,
      source: 'export-jsdoc',
      confidence: 'high'
    };
  }
  
  // Type definitions - compiler extracts everything
  if (category === 'type' || exports.every(e => e.isTypeOnly)) {
    const typeNames = exports.map(e => {
      if (e.type === 'interface' && e.members) {
        return `${e.name} (${e.members.length} members)`;
      }
      return e.name;
    });
    
    if (typeNames.length > 0) {
      return {
        summary: `Type definitions: ${typeNames.join(', ')}`,
        source: 'type-analysis',
        confidence: 'high'
      };
    }
  }
  
  // Simple utility functions with clear names (< 30 lines per export)
  if (category === 'utility' && lineCount < 50 && exports.length > 0 && exports.length <= 5) {
    const funcNames = exports.map(e => {
      if (e.signature) return e.signature.replace(/^export\s+(async\s+)?/, '');
      return e.name;
    });
    
    return {
      summary: `Utility functions: ${funcNames.join(', ')}`,
      source: 'signature-analysis',
      confidence: 'medium'
    };
  }
  
  // Enums
  if (exports.every(e => e.type === 'enum')) {
    const enumDesc = exports.map(e => `${e.name} (${(e.members || []).length} values)`);
    return {
      summary: `Enum definitions: ${enumDesc.join(', ')}`,
      source: 'enum-analysis',
      confidence: 'high'
    };
  }
  
  // Small files with clear export names
  if (lineCount < 30 && exports.length === 1) {
    const exp = exports[0];
    return {
      summary: `Exports ${exp.type} '${exp.name}'${exp.signature ? ': ' + exp.signature.replace(/^export\s+(async\s+)?/, '').slice(0, 100) : ''}`,
      source: 'single-export',
      confidence: 'medium'
    };
  }
  
  // Can't auto-generate a good summary
  return null;
}

/**
 * Generate auto-summaries for all files in the graph
 * Returns which files have auto-summaries and which need AI reading
 */
export function generateAutoSummaries(graph) {
  const summaries = {};
  const needsAIReading = [];
  
  for (const [filePath, entry] of Object.entries(graph)) {
    // Skip test files
    if (filePath.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) {
      summaries[filePath] = {
        summary: 'Test file',
        source: 'skip',
        confidence: 'high'
      };
      continue;
    }
    
    const autoSummary = autoGenerateSummary(filePath, entry);
    
    if (autoSummary) {
      summaries[filePath] = autoSummary;
    } else {
      needsAIReading.push(filePath);
    }
  }
  
  return { summaries, needsAIReading };
}

/**
 * Generate the complete pre-analysis output that the AI agent will consume
 * This is the main entry point - runs all static analysis with zero AI tokens
 */
export function generatePreAnalysis(rootDir, graph, importanceScores) {
  // Detect project capabilities
  const project = detectProjectCapabilities(rootDir, graph);
  
  // Auto-generate summaries where possible
  const { summaries, needsAIReading } = generateAutoSummaries(graph);
  
  // Build category statistics
  const categoryStats = {};
  for (const filePath of Object.keys(graph)) {
    const category = categorizeFile(filePath);
    categoryStats[category] = (categoryStats[category] || 0) + 1;
  }
  
  // Find the most-imported files (architecture backbone)
  const mostImported = Object.entries(graph)
    .map(([path, entry]) => ({
      path,
      importerCount: (entry.importedBy || []).length
    }))
    .filter(f => f.importerCount > 0)
    .sort((a, b) => b.importerCount - a.importerCount)
    .slice(0, 10);
  
  return {
    project,
    summaries,
    needsAIReading,
    categoryStats,
    mostImported,
    stats: {
      totalFiles: Object.keys(graph).length,
      autoSummarized: Object.keys(summaries).length,
      needsAIReading: needsAIReading.length,
      autoSummarizedPercent: Object.keys(graph).length > 0 
        ? Math.round(Object.keys(summaries).length / Object.keys(graph).length * 100)
        : 0
    }
  };
}

/**
 * Update summaries incrementally for changed files only
 */
export function updateSummariesForChangedFiles(existingSummaries, changedFiles, graph) {
  const updated = { ...existingSummaries };
  const needsAIReading = [];
  
  for (const filePath of changedFiles) {
    if (graph[filePath]) {
      const autoSummary = autoGenerateSummary(filePath, graph[filePath]);
      
      if (autoSummary) {
        updated[filePath] = autoSummary;
      } else {
        // Remove old summary, needs AI re-reading
        delete updated[filePath];
        needsAIReading.push(filePath);
      }
    } else {
      // File was deleted
      delete updated[filePath];
    }
  }
  
  return { summaries: updated, needsAIReading };
}
