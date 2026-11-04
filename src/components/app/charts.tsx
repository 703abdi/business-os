"use client";

// Thin wrappers around recharts with the app's colors.
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Series = { key: string; label: string; color: string };

const money = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`);
const axis = { fontSize: 11, fill: "#5b6672" };

export function Bars({ data, series, height = 220, stacked = false, isMoney = true }: { data: Record<string, string | number>[]; series: Series[]; height?: number; stacked?: boolean; isMoney?: boolean }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e2e5e9" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={isMoney ? money : undefined} width={48} allowDecimals={false} />
          <Tooltip formatter={(v) => (isMoney ? `$${Number(v).toLocaleString()}` : String(v))} cursor={{ fill: "rgba(14,124,134,0.06)" }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? "a" : undefined} radius={stacked && i < series.length - 1 ? 0 : [3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Lines({ data, series, height = 220, isMoney = true, goal }: { data: Record<string, string | number>[]; series: Series[]; height?: number; isMoney?: boolean; goal?: number }) {
  const rows = goal ? data.map((d) => ({ ...d, __goal: goal })) : data;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e2e5e9" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={isMoney ? money : undefined} width={48} allowDecimals={false} />
          <Tooltip formatter={(v) => (isMoney ? `$${Number(v).toLocaleString()}` : String(v))} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} dot={false} type="monotone" />
          ))}
          {goal && <Line dataKey="__goal" name="Goal" stroke="#d97706" strokeDasharray="5 5" dot={false} strokeWidth={1.5} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
