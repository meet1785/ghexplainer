import type { FileContent } from "./github";

export interface Dependency {
  name: string;
  version: string;
  ecosystem: "npm" | "pip" | "go" | "maven" | "cargo";
  type: "production" | "development" | "peer" | "unknown";
}

export interface ArchLensReport {
  score: number; // 0 - 100
  dependencies: Dependency[];
  techStack: string[];
  totalDependencies: number;
}

const TECH_KEYWORDS: Record<string, string[]> = {
  "React": ["react", "react-dom", "next", "gatsby"],
  "Vue": ["vue", "nuxt"],
  "Angular": ["@angular/core"],
  "Svelte": ["svelte"],
  "Express": ["express"],
  "NestJS": ["@nestjs/core"],
  "Django": ["django"],
  "Flask": ["flask"],
  "FastAPI": ["fastapi"],
  "Spring Boot": ["spring-boot"],
  "Gin": ["github.com/gin-gallery/gin", "github.com/gin-gonic/gin"],
  "Tailwind CSS": ["tailwindcss"],
  "TypeScript": ["typescript"],
  "Jest": ["jest"],
  "Vitest": ["vitest"],
  "Prisma": ["prisma", "@prisma/client"],
  "Docker": [], // Detected via Dockerfile
  "Kubernetes": [], // Detected via k8s yamls
};

export function auditArchLens(files: FileContent[]): ArchLensReport {
  const dependencies: Dependency[] = [];
  const techStack = new Set<string>();

  files.forEach(file => {
    // 1. npm (package.json)
    if (file.path.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(file.content);
        
        const processDeps = (depObj: any, type: Dependency["type"]) => {
          if (depObj && typeof depObj === "object") {
            for (const [name, version] of Object.entries(depObj)) {
              dependencies.push({
                name,
                version: String(version),
                ecosystem: "npm",
                type
              });
            }
          }
        };

        processDeps(pkg.dependencies, "production");
        processDeps(pkg.devDependencies, "development");
        processDeps(pkg.peerDependencies, "peer");
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    // 2. Python (requirements.txt)
    if (file.path.endsWith("requirements.txt")) {
      const lines = file.content.split("\n");
      for (const line of lines) {
        const match = line.match(/^([A-Za-z0-9_\-]+)[=><~]+(.*)$/);
        if (match) {
          dependencies.push({
            name: match[1],
            version: match[2].trim(),
            ecosystem: "pip",
            type: "production"
          });
        }
      }
    }

    // 3. Go (go.mod)
    if (file.path.endsWith("go.mod")) {
      const lines = file.content.split("\n");
      let inRequire = false;
      for (let line of lines) {
        line = line.trim();
        if (line.startsWith("require (")) {
          inRequire = true;
          continue;
        }
        if (inRequire && line === ")") {
          inRequire = false;
          continue;
        }
        
        if (inRequire) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            dependencies.push({
              name: parts[0],
              version: parts[1],
              ecosystem: "go",
              type: parts.includes("// indirect") ? "development" : "production"
            });
          }
        } else if (line.startsWith("require ")) {
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            dependencies.push({
              name: parts[1],
              version: parts[2],
              ecosystem: "go",
              type: "production"
            });
          }
        }
      }
    }

    // Infrastructure detection
    if (file.path.includes("Dockerfile")) techStack.add("Docker");
    if (file.path.endsWith(".yaml") || file.path.endsWith(".yml")) {
      if (file.content.includes("apiVersion:") && file.content.includes("kind:")) {
        techStack.add("Kubernetes");
      }
    }
  });

  // Infer tech stack from dependencies
  dependencies.forEach(dep => {
    for (const [tech, keywords] of Object.entries(TECH_KEYWORDS)) {
      if (keywords.includes(dep.name.toLowerCase())) {
        techStack.add(tech);
      }
    }
  });

  // Score calculation
  let score = 100;
  if (dependencies.length > 50) score -= 10;
  if (dependencies.length > 100) score -= 20;

  return {
    score: Math.max(0, score),
    dependencies,
    techStack: Array.from(techStack).sort(),
    totalDependencies: dependencies.length
  };
}

export function toArchLensMarkdown(report: ArchLensReport): string {
  let md = `# ArchLens Report\n\n`;
  md += `**Score:** ${report.score} / 100\n`;
  md += `- **Tech Stack:** ${report.techStack.join(", ") || "Unknown"}\n`;
  md += `- **Total Dependencies:** ${report.totalDependencies}\n\n`;

  if (report.dependencies.length > 0) {
    md += `## Dependencies\n`;
    report.dependencies.forEach(d => {
      md += `- \`${d.name}\` (${d.version}) [${d.ecosystem} - ${d.type}]\n`;
    });
  }

  return md;
}

export function toArchLensJSON(report: ArchLensReport): string {
  return JSON.stringify(report, null, 2);
}
