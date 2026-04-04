"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface TrafficDataPoint {
  date: string;
  sessions: number;
  users: number;
}

export function TrafficChart({ data }: { data: TrafficDataPoint[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Trafic Organique</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Area type="monotone" dataKey="sessions" stroke="#3b82f6" fill="#dbeafe" name="Sessions" />
          <Area type="monotone" dataKey="users" stroke="#10b981" fill="#d1fae5" name="Utilisateurs" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
