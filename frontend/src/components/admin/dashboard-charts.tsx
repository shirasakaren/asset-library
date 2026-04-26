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
