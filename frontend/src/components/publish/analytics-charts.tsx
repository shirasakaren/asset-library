'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
} from 'recharts';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import type { AssetAnalyticsDetail } from '@/lib/api/types';

const COLOR_BLUE = '#3a6dc5';
const COLOR_GREEN = '#0f8657';
const COLOR_YELLOW = '#f7bf33';

const SOURCE_COLOR: Record<string, string> = {
  WEB: COLOR_BLUE,
  UNITY: COLOR_GREEN,
  UNREAL: COLOR_YELLOW,
};

interface Props {
  data: AssetAnalyticsDetail;
}

export function AnalyticsCharts({ data }: Props) {
  const t = useTranslations('publish.analytics');
  const bySource = useMemo(
    () =>
      Object.entries(data.bySource ?? {})
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
    [data.bySource],
  );
  const byCountry = useMemo(
    () =>
      Object.entries(data.byCountry ?? {})
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count),
    [data.byCountry],
  );

  return (
    <div className="mt-8 grid lg:grid-cols-2 gap-4">
      <Card padding="lg" className="lg:col-span-2">
        <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">{t('daily')}</p>
        <h2 className="font-display text-h2 text-ink tracking-[-0.01em] mt-1 mb-4">
          {t('downloads')}
        </h2>
        <div className="h-[260px]">
          <ResponsiveContainer>
            <AreaChart data={data.daily}>
              <defs>
                <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_BLUE} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={COLOR_BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#ececea" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#9aa1ad"
                fontSize={11}
                tickFormatter={(d) =>
                  new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                }
              />
              <YAxis stroke="#9aa1ad" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: '#0e1116',
                  borderRadius: 12,
                  border: 'none',
                  color: '#fff',
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke={COLOR_BLUE}
                strokeWidth={2}
                fill="url(#dlGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card padding="lg">
        <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">{t('bySource')}</p>
        <h2 className="font-display text-h3 text-ink tracking-[-0.005em] mt-1 mb-4">
          {t('bySource')}
        </h2>
        <div className="h-[220px]">
          <ResponsiveContainer>
            <BarChart data={bySource} layout="vertical" margin={{ left: 12 }}>
              <CartesianGrid stroke="#ececea" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" stroke="#9aa1ad" fontSize={11} />
              <YAxis dataKey="source" type="category" stroke="#9aa1ad" fontSize={11} width={70} />
              <Tooltip
                contentStyle={{
                  background: '#0e1116',
                  borderRadius: 12,
                  border: 'none',
                  color: '#fff',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 4, 4]}>
                {bySource.map((d) => (
                  <Cell key={d.source} fill={SOURCE_COLOR[d.source] ?? COLOR_BLUE} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card padding="lg">
        <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">{t('byVersion')}</p>
        <h2 className="font-display text-h3 text-ink tracking-[-0.005em] mt-1 mb-4">
          {t('byVersion')}
        </h2>
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-eyebrow uppercase tracking-[0.12em] text-ink-3">
              <th className="py-1.5">{t('version')}</th>
              <th className="py-1.5 text-right">{t('downloads')}</th>
            </tr>
          </thead>
          <tbody>
            {data.byVersion.map((v) => (
              <tr key={v.versionId} className="border-t border-line">
                <td className="py-1.5 font-mono">{v.semver}</td>
                <td className="py-1.5 text-right geist-tnum">{v.downloads.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card padding="lg" className="lg:col-span-2">
        <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">{t('byCountry')}</p>
        <table className="w-full text-[13.5px] mt-3">
          <thead>
            <tr className="text-left text-eyebrow uppercase tracking-[0.12em] text-ink-3">
              <th className="py-1.5">{t('byCountry')}</th>
              <th className="py-1.5 text-right">{t('downloads')}</th>
            </tr>
          </thead>
          <tbody>
            {byCountry.map((c) => (
              <tr key={c.country} className="border-t border-line">
                <td className="py-1.5">{c.country}</td>
                <td className="py-1.5 text-right geist-tnum">{c.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
