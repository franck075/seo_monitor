"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface PositionDataPoint {
  date: string;
  position: number;
}

export function KeywordPositionChart({ data, keyword }: { data: PositionDataPoint[]; keyword?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        Position {keyword ? `— ${keyword}` : ""}
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis reversed tick={{ fontSize: 11 }} domain={[1, 100]} />
          <Tooltip />
          <Line type="monotone" dataKey="position" stroke="#6366f1" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
