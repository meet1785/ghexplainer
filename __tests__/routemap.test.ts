import { discoverRouteMap } from '../lib/routemap';
import type { FileContent } from '../lib/github';

describe('RouteMap', () => {
  it('detects Express routes', () => {
    const files: FileContent[] = [
      {
        path: 'server.js',
        content: `
          const app = express();
          app.get('/api/users', (req, res) => {});
          router.post('/api/login', (req, res) => {});
        `
      }
    ];

    const report = discoverRouteMap(files);
    expect(report.totalRoutes).toBe(2);
    expect(report.routes.find(r => r.path === '/api/users')?.method).toBe('GET');
    expect(report.routes.find(r => r.path === '/api/login')?.method).toBe('POST');
    expect(report.frameworks).toContain('Express');
  });

  it('detects Next.js API routes', () => {
    const files: FileContent[] = [
      {
        path: 'app/api/auth/route.ts',
        content: `
          export async function POST(req: Request) {}
          export async function GET(req: Request) {}
        `
      }
    ];

    const report = discoverRouteMap(files);
    expect(report.totalRoutes).toBe(2);
    expect(report.routes.find(r => r.method === 'POST')?.path).toBe('/api/auth');
    expect(report.frameworks).toContain('Next.js');
  });
});
