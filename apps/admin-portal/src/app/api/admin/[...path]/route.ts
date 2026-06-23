import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

type RouteContext = { params: { path: string[] } };

async function proxyToAdminService(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  const token = cookies().get('admin_token')?.value;

  if (!token) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  const adminServiceUrl = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007';
  const targetPath = context.params.path.join('/');
  const searchParams = req.nextUrl.searchParams.toString();
  const url = `${adminServiceUrl}/admin/api/${targetPath}${searchParams ? `?${searchParams}` : ''}`;

  const body = req.method !== 'GET' && req.method !== 'DELETE' ? await req.text() : undefined;

  const upstream = await fetch(url, {
    method: req.method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body,
  });

  const json = await upstream.json();
  return NextResponse.json(json, { status: upstream.status });
}

export const GET = (req: NextRequest, ctx: RouteContext) => proxyToAdminService(req, ctx);
export const POST = (req: NextRequest, ctx: RouteContext) => proxyToAdminService(req, ctx);
export const PATCH = (req: NextRequest, ctx: RouteContext) => proxyToAdminService(req, ctx);
export const DELETE = (req: NextRequest, ctx: RouteContext) => proxyToAdminService(req, ctx);
