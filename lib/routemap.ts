import type { FileContent } from "./github";

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD' | 'ANY';

export interface ApiRoute {
  method: HttpMethod;
  path: string;
  framework: string;
  file: string;
  line: number;
}

export interface RouteMapReport {
  routes: ApiRoute[];
  totalRoutes: number;
  frameworks: string[];
}

const ROUTE_REGEXES = [
  // Express / Node.js
  {
    regex: /(?:app|router)\.(get|post|put|delete|patch|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]/i,
    framework: "Express"
  },
  // FastAPI / Python
  {
    regex: /@(?:app|router)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"]([^'"]+)['"]/i,
    framework: "FastAPI"
  },
  // Flask / Python
  {
    regex: /@app\.route\s*\(\s*['"]([^'"]+)['"](?:.*methods=\[([^\]]+)\])?/i,
    framework: "Flask"
  },
  // Spring Boot / Java
  {
    regex: /@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(?:value\s*=\s*)?['"]([^'"]+)['"]/i,
    framework: "Spring Boot"
  },
  // Gin / Go
  {
    regex: /(?:r|router)\.(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|Any)\s*\(\s*['"`]([^'"`]+)['"`]/,
    framework: "Gin"
  }
];

export function discoverRouteMap(files: FileContent[]): RouteMapReport {
  const routes: ApiRoute[] = [];
  const frameworks = new Set<string>();

  files.forEach(file => {
    // Detect Next.js App Router API Routes
    if (file.path.includes("app/api/") && file.path.match(/route\.(ts|js)$/)) {
      const match = file.path.match(/app\/api\/(.+)\/route\.(ts|js)$/);
      if (match) {
        const routePath = `/api/${match[1]}`;
        const lines = file.content.split('\n');
        
        lines.forEach((line, idx) => {
          const exportMatch = line.match(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)/);
          if (exportMatch) {
            routes.push({
              method: exportMatch[1] as HttpMethod,
              path: routePath,
              framework: "Next.js",
              file: file.path,
              line: idx + 1
            });
            frameworks.add("Next.js");
          }
        });
      }
      return; // Skip standard regexes for this file
    }

    const lines = file.content.split('\n');
    lines.forEach((line, idx) => {
      for (const { regex, framework } of ROUTE_REGEXES) {
        const match = line.match(regex);
        if (match) {
          if (framework === "Flask") {
            const path = match[1];
            let methodStr = match[2] ? match[2].toUpperCase() : "GET";
            const methods = methodStr.match(/(GET|POST|PUT|DELETE|PATCH)/g) || ["GET"];
            
            methods.forEach(method => {
              routes.push({ method: method as HttpMethod, path, framework, file: file.path, line: idx + 1 });
            });
          } else {
            let method = match[1].toUpperCase();
            if (method === "ALL" || method === "ANY") method = "ANY";
            
            routes.push({
              method: method as HttpMethod,
              path: match[2],
              framework,
              file: file.path,
              line: idx + 1
            });
          }
          frameworks.add(framework);
          break; // Stop checking other regexes for this line
        }
      }
    });
  });

  return {
    routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
    totalRoutes: routes.length,
    frameworks: Array.from(frameworks).sort()
  };
}

export function toRouteMapMarkdown(report: RouteMapReport): string {
  let md = `# RouteMap API Discovery\n\n`;
  md += `- **Total Endpoints:** ${report.totalRoutes}\n`;
  md += `- **Frameworks Detected:** ${report.frameworks.join(", ") || "None"}\n\n`;

  if (report.routes.length > 0) {
    md += `| Method | Path | Framework | File |\n`;
    md += `|--------|------|-----------|------|\n`;
    report.routes.forEach(r => {
      md += `| \`${r.method}\` | \`${r.path}\` | ${r.framework} | \`${r.file}:${r.line}\` |\n`;
    });
  }

  return md;
}

export function toRouteMapJSON(report: RouteMapReport): string {
  return JSON.stringify(report, null, 2);
}
