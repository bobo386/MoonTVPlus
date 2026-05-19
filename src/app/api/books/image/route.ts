import { NextRequest, NextResponse } from 'next/server';

import { legadoClient } from '@/lib/legado.client';
import { validateProxyUrlServerSide } from '@/lib/server/ssrf';

import { getAuthorizedBooksUsername } from '../_utils';

export const runtime = 'nodejs';

function asObjectHeader(value?: string | Record<string, string>): Record<string, string> {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return value.split('\n').reduce<Record<string, string>>((headers, line) => {
      const index = line.indexOf(':');
      if (index > 0) headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
      return headers;
    }, {});
  }
}

export async function GET(request: NextRequest) {
  const username = await getAuthorizedBooksUsername(request);
  if (username instanceof NextResponse) return username;

  try {
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get('sourceId') || '';
    const url = searchParams.get('url') || '';
    if (!sourceId || !url) return NextResponse.json({ error: '缺少 sourceId 或 url' }, { status: 400 });
    if (!(await validateProxyUrlServerSide(url))) return NextResponse.json({ error: '图片地址未通过安全校验' }, { status: 400 });
    const source = await legadoClient.getSourceById(sourceId);
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
      Referer: source.legado?.bookSourceUrl || source.url,
      ...asObjectHeader(source.legado?.header),
    };
    delete headers.Host;
    delete headers.host;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ error: `图片请求失败: ${res.status}` }, { status: res.status });
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '图片代理失败' }, { status: 500 });
  }
}
