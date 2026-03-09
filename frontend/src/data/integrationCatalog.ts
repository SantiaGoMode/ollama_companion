export interface IntegrationPreset {
  id: string;
  name: string;
  description: string;
  category: 'development' | 'productivity' | 'data' | 'web' | 'google' | 'communication';
  icon: string;
  color: string;
  transport: 'stdio' | 'sse';
  command: string;
  args: string[];
  envKeys: { key: string; label: string; placeholder: string; required: boolean }[];
  docsUrl: string;
}

export const INTEGRATION_CATALOG: IntegrationPreset[] = [
  // ─── Development ───
  {
    id: 'github',
    name: 'GitHub',
    description: 'Manage repos, issues, PRs, and code search via the GitHub API.',
    category: 'development',
    icon: 'GH',
    color: '#24292e',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    envKeys: [
      { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub Token', placeholder: 'ghp_xxxxxxxxxxxx', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Interact with GitLab repositories, merge requests, and pipelines.',
    category: 'development',
    icon: 'GL',
    color: '#fc6d26',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gitlab'],
    envKeys: [
      { key: 'GITLAB_PERSONAL_ACCESS_TOKEN', label: 'GitLab Token', placeholder: 'glpat-xxxxxxxxxxxx', required: true },
      { key: 'GITLAB_API_URL', label: 'GitLab API URL', placeholder: 'https://gitlab.com/api/v4', required: false },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gitlab',
  },

  // ─── Productivity ───
  {
    id: 'slack',
    name: 'Slack',
    description: 'Read channels, send messages, manage conversations in Slack workspaces.',
    category: 'communication',
    icon: 'SL',
    color: '#4a154b',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    envKeys: [
      { key: 'SLACK_BOT_TOKEN', label: 'Bot Token', placeholder: 'xoxb-xxxxxxxxxxxx', required: true },
      { key: 'SLACK_TEAM_ID', label: 'Team ID', placeholder: 'T0XXXXXXXXX', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Search, read, and create pages and databases in Notion.',
    category: 'productivity',
    icon: 'NT',
    color: '#000000',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    envKeys: [
      { key: 'OPENAPI_MCP_HEADERS', label: 'Auth Header JSON', placeholder: '{"Authorization":"Bearer ntn_xxx","Notion-Version":"2022-06-28"}', required: true },
    ],
    docsUrl: 'https://github.com/makenotion/notion-mcp-server',
  },

  // ─── Google ───
  {
    id: 'google-workspace',
    name: 'Google Workspace',
    description: 'Access Google Drive, Docs, Sheets, Gmail, and Calendar.',
    category: 'google',
    icon: 'GW',
    color: '#4285f4',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/google-workspace-mcp'],
    envKeys: [
      { key: 'GOOGLE_CLIENT_ID', label: 'OAuth Client ID', placeholder: 'xxxx.apps.googleusercontent.com', required: true },
      { key: 'GOOGLE_CLIENT_SECRET', label: 'OAuth Client Secret', placeholder: 'GOCSPX-xxxx', required: true },
      { key: 'GOOGLE_REFRESH_TOKEN', label: 'Refresh Token', placeholder: '1//xxxx', required: true },
    ],
    docsUrl: 'https://github.com/anthropics/google-workspace-mcp',
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    description: 'Geocoding, directions, place search, and elevation data via Google Maps API.',
    category: 'google',
    icon: 'GM',
    color: '#34a853',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-maps'],
    envKeys: [
      { key: 'GOOGLE_MAPS_API_KEY', label: 'Google Maps API Key', placeholder: 'AIzaSy...', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Search and read files from Google Drive.',
    category: 'google',
    icon: 'GD',
    color: '#0f9d58',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gdrive'],
    envKeys: [
      { key: 'GDRIVE_CLIENT_ID', label: 'OAuth Client ID', placeholder: 'xxxx.apps.googleusercontent.com', required: true },
      { key: 'GDRIVE_CLIENT_SECRET', label: 'OAuth Client Secret', placeholder: 'GOCSPX-xxxx', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive',
  },

  // ─── Data ───
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query and manage SQLite databases. Read schema, run SQL, analyze data.',
    category: 'data',
    icon: 'DB',
    color: '#003b57',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-sqlite', '--db-path'],
    envKeys: [
      { key: 'SQLITE_DB_PATH', label: 'Database Path', placeholder: '/path/to/database.db', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Connect to PostgreSQL databases. Run queries and inspect schema.',
    category: 'data',
    icon: 'PG',
    color: '#336791',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    envKeys: [
      { key: 'POSTGRES_CONNECTION_STRING', label: 'Connection String', placeholder: 'postgresql://user:pass@localhost:5432/dbname', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
  },

  // ─── Web ───
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web and local search via the Brave Search API.',
    category: 'web',
    icon: 'BS',
    color: '#fb542b',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    envKeys: [
      { key: 'BRAVE_API_KEY', label: 'Brave API Key', placeholder: 'BSA...', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Fetch and extract content from any URL. Converts HTML to markdown.',
    category: 'web',
    icon: 'FE',
    color: '#0ea5e9',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    envKeys: [],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation. Navigate, screenshot, interact with web pages.',
    category: 'web',
    icon: 'PP',
    color: '#40b5a4',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    envKeys: [],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
  },

  // ─── Filesystem & Memory ───
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read, write, and manage files and directories with sandboxed access.',
    category: 'development',
    icon: 'FS',
    color: '#6b7280',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    envKeys: [
      { key: 'FILESYSTEM_ALLOWED_DIRS', label: 'Allowed Directories', placeholder: '/Users/you/projects,/tmp', required: true },
    ],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent knowledge graph for long-term memory across conversations.',
    category: 'productivity',
    icon: 'MM',
    color: '#8b5cf6',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    envKeys: [],
    docsUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
  },
];

export type IntegrationCategory = IntegrationPreset['category'];

export const CATEGORY_LABELS: Record<IntegrationCategory, { label: string; color: string }> = {
  development: { label: 'Development', color: '#8b5cf6' },
  productivity: { label: 'Productivity', color: '#f59e0b' },
  data: { label: 'Data', color: '#10b981' },
  web: { label: 'Web', color: '#0ea5e9' },
  google: { label: 'Google', color: '#4285f4' },
  communication: { label: 'Communication', color: '#f43f5e' },
};
