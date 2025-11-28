# Contributing to MCP *arr Server

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/mcp-arr.git
   cd mcp-arr
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development

### Watch Mode

```bash
npm run watch
```

### Build

```bash
npm run build
```

### Running Locally

```bash
SONARR_URL="http://localhost:8989" SONARR_API_KEY="your-key" node dist/index.js
```

## Adding New Tools

1. Add the API method to the appropriate client class in `src/arr-client.ts`:

```typescript
async getNewEndpoint(): Promise<SomeType[]> {
  return this['request']<SomeType[]>('/endpoint');
}
```

2. Add the tool definition to `src/index.ts`:

```typescript
if (clients.sonarr) {
  TOOLS.push({
    name: "sonarr_new_tool",
    description: "Description of what this tool does",
    inputSchema: {
      type: "object" as const,
      properties: {
        param: {
          type: "string",
          description: "Parameter description",
        },
      },
      required: ["param"],
    },
  });
}
```

3. Add the handler in the switch statement:

```typescript
case "sonarr_new_tool": {
  if (!clients.sonarr) throw new Error("Sonarr not configured");
  const result = await clients.sonarr.getNewEndpoint();
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
```

4. Update the README with the new tool.

## Code Style

- Use TypeScript strict mode
- Follow existing code patterns
- Add JSDoc comments for public methods
- Keep error messages user-friendly

## Submitting Changes

1. Ensure your code builds without errors:
   ```bash
   npm run build
   ```
2. Commit your changes with a descriptive message
3. Push to your fork
4. Open a Pull Request

## Reporting Issues

When reporting issues, please include:
- Node.js version
- *arr application version(s)
- Error messages (with sensitive info redacted)
- Steps to reproduce

## Questions?

Open an issue for any questions about contributing.
