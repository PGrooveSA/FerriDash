"use client";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, Legend, LineChart, Line,
} from "recharts";

const axis = { stroke: "var(--muted)", fontSize: 12, tickLine: false, axisLine: false } as const;
const tooltipStyle = { contentStyle: { background: "var(--glass-solid)", border: "1px solid var(--glass-border)", borderRadius: 14, backdropFilter: "blur(12px)", color: "var(--ink)", fontSize: 12 }, cursor: { fill: "rgb(148 163 184 / 0.12)" } };

export function Donut({ data, center, sub, height = 220 }: { data: { name: string; value: number; color: string }[]; center?: string; sub?: string; height?: number }) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie isAnimationActive={false} data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="92%" paddingAngle={3} cornerRadius={10} stroke="none">
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      {center && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
          <div><p className="text-3xl font-bold">{center}</p>{sub && <p className="text-xs muted">{sub}</p>}</div>
        </div>
      )}
    </div>
  );
}

export function Bars({ data, xKey, series, height = 260, yMax, unit = "" }: { data: Record<string, string | number | null>[]; xKey: string; series: { key: string; name: string; color: string }[]; height?: number; yMax?: number; unit?: string }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={6}>
          <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--line)" />
          <XAxis dataKey={xKey} {...axis} />
          <YAxis {...axis} width={40} domain={[0, yMax ?? "auto"]} unit={unit} />
          <Tooltip {...tooltipStyle} formatter={(v) => `${v}${unit}`} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => <Bar isAnimationActive={false} key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[8, 8, 8, 8]} maxBarSize={18} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBars({ data, height }: { data: { name: string; value: number | null; color?: string }[]; height?: number }) {
  return (
    <div style={{ height: height ?? Math.max(160, data.length * 44) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }}>
          <CartesianGrid strokeDasharray="3 6" horizontal={false} stroke="var(--line)" />
          <XAxis type="number" domain={[0, 100]} {...axis} unit="%" />
          <YAxis type="category" dataKey="name" {...axis} width={150} />
          <Tooltip {...tooltipStyle} formatter={(v) => `${v}%`} />
          <Bar isAnimationActive={false} dataKey="value" name="Mark" radius={[0, 10, 10, 0]} maxBarSize={22}>
            {data.map((d, i) => <Cell key={i} fill={d.color ?? "#f9c95e"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaTrend({ data, xKey, series, height = 260, money = false }: { data: Record<string, string | number | null>[]; xKey: string; series: { key: string; name: string; color: string }[]; height?: number; money?: boolean }) {
  const fmt = (v: number) => (money ? `R${v >= 1000 ? Math.round(v / 1000) + "k" : v}` : String(v));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--line)" />
          <XAxis dataKey={xKey} {...axis} />
          <YAxis {...axis} width={48} tickFormatter={fmt} />
          <Tooltip {...tooltipStyle} formatter={(v) => (money ? new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(Number(v)) : String(v))} />
          {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => <Area isAnimationActive={false} key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={3} fill={`url(#g-${s.key})`} dot={false} activeDot={{ r: 6 }} />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Trend({ data, xKey, series, height = 220 }: { data: Record<string, string | number | null>[]; xKey: string; series: { key: string; name: string; color: string }[]; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--line)" />
          <XAxis dataKey={xKey} {...axis} />
          <YAxis {...axis} width={36} domain={[0, 100]} />
          <Tooltip {...tooltipStyle} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => <Line isAnimationActive={false} key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={3} dot={{ r: 4 }} connectNulls />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
