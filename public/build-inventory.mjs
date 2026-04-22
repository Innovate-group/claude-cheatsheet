#!/usr/bin/env node
// Standalone script — no external dependencies.
// Usage:
//   node build-inventory.mjs > mi-cheatsheet.json
// Then drag the resulting file onto the Claude Cheatsheet web page.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLAUDE_DIR = process.env.CLAUDE_DIR || path.join(os.homedir(), '.claude');

const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
const readDir = p => exists(p) ? fs.readdirSync(p, { withFileTypes: true }) : [];

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { data: {}, content: raw };
  const body = m[1];
  const data = {};
  // Parse simple `key: value` lines. Tolerates quoted values and inline.
  // Skips nested structures (YAML arrays/maps); those keys simply won't be picked up.
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const mm = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!mm) continue;
    const [, key, rawVal] = mm;
    let val = rawVal.trim();
    if (!val) continue;
    // Strip matching quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }
  const content = raw.slice(m[0].length).replace(/^\r?\n/, '');
  return { data, content };
}

function deriveDescription(data, content) {
  if (data.description) return String(data.description).trim();
  const heading = content.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  const paragraph = content.split(/\n\s*\n/).find(b => b.trim() && !b.trim().startsWith('#'));
  return paragraph ? paragraph.trim().slice(0, 140) : '';
}

function parseMarkdown(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { data, content } = parseFrontmatter(raw);
  return {
    description: deriveDescription(data, content),
    argumentHint: data['argument-hint'] || null,
    allowedTools: data['allowed-tools'] || null,
    model: data.model || null,
    tools: data.tools || null,
  };
}

function collectCommands(dir, source) {
  return readDir(dir)
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => {
      const meta = parseMarkdown(path.join(dir, e.name));
      const name = e.name.replace(/\.md$/, '');
      return { type: 'command', name, invocation: '/' + name, source, ...meta };
    });
}

function collectSkills(dir, source) {
  return readDir(dir)
    .filter(e => e.isDirectory() || e.isSymbolicLink())
    .map(e => {
      const skillFile = path.join(dir, e.name, 'SKILL.md');
      if (!exists(skillFile)) return null;
      const meta = parseMarkdown(skillFile);
      return { type: 'skill', name: e.name, source, ...meta };
    })
    .filter(Boolean);
}

function collectAgents(dir, source) {
  return readDir(dir)
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => {
      const meta = parseMarkdown(path.join(dir, e.name));
      return { type: 'agent', name: e.name.replace(/\.md$/, ''), source, ...meta };
    });
}

export function buildInventory({ claudeDir = CLAUDE_DIR } = {}) {
  const commands = collectCommands(path.join(claudeDir, 'commands'), 'local');
  const skills = collectSkills(path.join(claudeDir, 'skills'), 'local');
  const agents = collectAgents(path.join(claudeDir, 'agents'), 'local');

  const marketplaces = [];
  const marketsDir = path.join(claudeDir, 'plugins', 'marketplaces');
  const seenSkillKeys = new Set(skills.map(s => s.name));

  for (const entry of readDir(marketsDir)) {
    if (!entry.isDirectory()) continue;
    const marketName = entry.name;
    const marketRoot = path.join(marketsDir, marketName);

    const manifestPath = path.join(marketRoot, '.claude-plugin', 'marketplace.json');
    let manifest = null;
    if (exists(manifestPath)) {
      try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {}
    }
    const listedPlugins = manifest?.plugins || [];

    const selfPluginJson = path.join(marketRoot, 'plugin.json');
    let selfPlugin = null;
    if (exists(selfPluginJson)) {
      try { selfPlugin = JSON.parse(fs.readFileSync(selfPluginJson, 'utf8')); } catch {}
    }

    const marketPlugins = [];

    if (selfPlugin) {
      const srcLabel = `plugin:${selfPlugin.name || marketName}`;
      const pSkills = collectSkills(path.join(marketRoot, 'skills'), srcLabel);
      const pCommands = collectCommands(path.join(marketRoot, 'commands'), srcLabel);
      const pAgents = collectAgents(path.join(marketRoot, 'agents'), srcLabel);
      for (const s of pSkills) if (!seenSkillKeys.has(s.name)) { skills.push(s); seenSkillKeys.add(s.name); }
      commands.push(...pCommands);
      agents.push(...pAgents);
      marketPlugins.push({
        name: selfPlugin.name || marketName,
        description: selfPlugin.description || '',
        skillsCount: pSkills.length,
        commandsCount: pCommands.length,
        agentsCount: pAgents.length,
      });
    }

    for (const p of listedPlugins) {
      const pluginDir = path.join(marketRoot, 'plugins', p.name);
      const srcLabel = `plugin:${p.name}`;
      let pSkills = [], pCommands = [], pAgents = [];
      if (exists(pluginDir)) {
        pSkills = collectSkills(path.join(pluginDir, 'skills'), srcLabel);
        pCommands = collectCommands(path.join(pluginDir, 'commands'), srcLabel);
        pAgents = collectAgents(path.join(pluginDir, 'agents'), srcLabel);
        for (const s of pSkills) if (!seenSkillKeys.has(s.name)) { skills.push(s); seenSkillKeys.add(s.name); }
        commands.push(...pCommands);
        agents.push(...pAgents);
      }
      marketPlugins.push({
        name: p.name,
        description: p.description || '',
        category: p.category || null,
        homepage: p.homepage || null,
        skillsCount: pSkills.length,
        commandsCount: pCommands.length,
        agentsCount: pAgents.length,
        downloaded: exists(pluginDir),
      });
    }

    marketplaces.push({
      type: 'marketplace',
      name: marketName,
      description: manifest?.description || selfPlugin?.description || '',
      owner: manifest?.owner?.name || null,
      plugins: marketPlugins,
      pluginCount: marketPlugins.length,
    });
  }

  let settings = {};
  const settingsPath = path.join(claudeDir, 'settings.json');
  if (exists(settingsPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings = {
        additionalDirectoriesCount: raw.additionalDirectories?.length || 0,
        permissionsAllowCount: raw.permissions?.allow?.length || 0,
        permissionsDenyCount: raw.permissions?.deny?.length || 0,
        alwaysThinkingEnabled: raw.alwaysThinkingEnabled ?? null,
        effortLevel: raw.effortLevel || null,
        model: raw.model || null,
        theme: raw.theme || null,
      };
    } catch {}
  }

  commands.sort((a, b) => a.name.localeCompare(b.name));
  skills.sort((a, b) => a.name.localeCompare(b.name));
  agents.sort((a, b) => a.name.localeCompare(b.name));
  marketplaces.sort((a, b) => a.name.localeCompare(b.name));

  const totalPlugins = marketplaces.reduce((n, m) => n + m.pluginCount, 0);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      commands: commands.length,
      skills: skills.length,
      plugins: totalPlugins,
      marketplaces: marketplaces.length,
      agents: agents.length,
    },
    commands,
    skills,
    marketplaces,
    agents,
    settings,
  };
}

// Run as script: print JSON to stdout
const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  const inventory = buildInventory();
  process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
}
