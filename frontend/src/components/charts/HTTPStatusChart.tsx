"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface HTTPStatusChartProps {
  data: { name: string; value: number; color: string }[];
}

export function HTTPStatusChart({ data }: HTTPStatusChartProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Statuts HTTP</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
