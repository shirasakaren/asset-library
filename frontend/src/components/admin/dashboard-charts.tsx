'use client';

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { useLocale } from 'next-intl';
import type { LocaleCode } from '@/lib/api/types';

const COLOR = {
  blue: '#3a6dc5',
  green: '#0f8657',
  yellow: '#f7bf33',
  red: '#f94141',
};

interface Series {
  date: string;
  count: number;
}

interface DashboardChartsProps {
  downloads: Series[];
  publishes: Series[];
  newUsers: Series[];
  storage: { bucket: string; bytes: number }[];
}

function fmtDate(d: string, locale: LocaleCode) {
  return new Date(d).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const tooltipStyle = {
  background: '#0e1116',
  borderRadius: 12,
  border: 'none',
  color: '#fff',
  fontSize: 12,
  padding: '8px 10px',
};

export function DashboardCharts({ downloads, publishes, newUsers, storage }: DashboardChartsProps) {
  const locale = useLocale() as LocaleCode;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <ChartCard title="Downloads (30d)" eyebrow="Activity">
        <ResponsiveContainer>
          <AreaChart data={downloads}>
            <defs>
              <linearGradient id="grad-dl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR.blue} stopOpacity={0.4} />
                <stop offset="100%" stopColor={COLOR.blue} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ececea" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" stroke="#9aa1ad" fontSize={11} tickFormatter={(d) => fmtDate(d, locale)} />
            <YAxis stroke="#9aa1ad" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="count" stroke={COLOR.blue} strokeWidth={2} fill="url(#grad-dl)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Publishes (30d)" eyebrow="Activity">
        <ResponsiveContainer>
          <AreaChart data={publishes}>
            <defs>
              <linearGradient id="grad-pub" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR.green} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLOR.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ececea" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" stroke="#9aa1ad" fontSize={11} tickFormatter={(d) => fmtDate(d, locale)} />
            <YAxis stroke="#9aa1ad" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="count" stroke={COLOR.green} strokeWidth={2} fill="url(#grad-pub)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="New users (30d)" eyebrow="Growth">
        <ResponsiveContainer>
          <AreaChart data={newUsers}>
            <defs>
              <linearGradient id="grad-usr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR.yellow} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLOR.yellow} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ececea" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" stroke="#9aa1ad" fontSize={11} tickFormatter={(d) => fmtDate(d, locale)} />
            <YAxis stroke="#9aa1ad" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="count" stroke={COLOR.yellow} strokeWidth={2} fill="url(#grad-usr)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Storage by bucket" eyebrow="Storage">
        <ResponsiveContainer>
          <BarChart data={storage} layout="vertical" margin={{ left: 16 }}>
            <CartesianGrid stroke="#ececea" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" stroke="#9aa1ad" fontSize={11} tickFormatter={fmtBytes} />
            <YAxis dataKey="bucket" type="category" stroke="#9aa1ad" fontSize={11} width={90} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtBytes(v)} />
            <Bar dataKey="bytes" fill={COLOR.blue} radius={[6, 6, 6, 6]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding="lg">
      <p className="text-eyebrow uppercase tracking-[0.12em] text-ink-3">{eyebrow}</p>
      <h2 className="font-display text-h3 text-ink tracking-[-0.005em] mt-1 mb-4">{title}</h2>
      <div className="h-[220px]">{children}</div>
    </Card>
  );
}

function fmtBytes(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`;
}
