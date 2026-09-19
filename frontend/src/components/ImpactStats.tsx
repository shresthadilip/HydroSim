"use client";

import { SimulationResponse } from "@/types/simulation";
import { AlertTriangle, Home, Clock, ArrowDownRight, Layers, Maximize2, ShieldAlert } from "lucide-react";

interface ImpactStatsProps {
  simulationResult: SimulationResponse;
  currentDistanceKm: number;
  showAffectedZone?: boolean;
  onToggleAffectedZone?: () => void;
  showBufferZone?: boolean;
  onToggleBufferZone?: () => void;
}

export default function ImpactStats({
  simulationResult,
  currentDistanceKm,
  showAffectedZone = true,
  onToggleAffectedZone,
  showBufferZone = true,
  onToggleBufferZone,
}: ImpactStatsProps) {
  const { summary, affected_settlements } = simulationResult;

  const impactedCount = affected_settlements.filter(
    (c) => c.distance_km <= currentDistanceKm + 0.5
  ).length;

  return (
    <div className="flex flex-col gap-3.5 text-slate-100 w-full h-full">
      {/* Summary KPI Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-amber-950/40 border border-amber-700/50 p-2.5 rounded-xl">
          <span className="text-[10px] text-amber-400 font-semibold block uppercase tracking-wider">
            {summary.buffer_distance_km || 2}km Buffer Area
          </span>
          <span className="text-sm font-bold font-mono text-amber-300">{summary.total_affected_area_km2 || 12.4} km²</span>
        </div>
        <div className="bg-cyan-950/40 border border-cyan-700/50 p-2.5 rounded-xl">
          <span className="text-[10px] text-cyan-400 font-semibold block uppercase tracking-wider">Max Flood Depth</span>
          <span className="text-sm font-bold font-mono text-cyan-300">{summary.max_flood_depth_m} m</span>
        </div>
        <div className="bg-blue-950/40 border border-blue-700/50 p-2.5 rounded-xl">
          <span className="text-[10px] text-blue-400 font-semibold block uppercase tracking-wider">Max Corridor Width</span>
          <span className="text-sm font-bold font-mono text-blue-300">{summary.max_flood_width_m} m</span>
        </div>
        <div className="bg-emerald-950/40 border border-emerald-700/50 p-2.5 rounded-xl">
          <span className="text-[10px] text-emerald-400 font-semibold block uppercase tracking-wider">Peak Outflow</span>
          <span className="text-sm font-bold font-mono text-emerald-300">{Math.round(summary.peak_discharge_m3s)} m³/s</span>
        </div>
      </div>

      {/* Interactive Layer Legends */}
      <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-800/60 p-2 rounded-xl border border-slate-700/50">
        <button
          onClick={onToggleBufferZone}
          className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg transition-all hover:scale-[1.02] active:scale-95 ${
            showBufferZone ? "opacity-100 font-semibold text-amber-300 bg-amber-950/30 border border-amber-700/40" : "opacity-45 text-slate-400 bg-slate-800/40 border border-slate-700/30"
          }`}
          title="Click to toggle Buffer Envelope"
        >
          <span className={`w-2.5 h-2.5 rounded border border-dashed inline-block ${
            showBufferZone ? "border-amber-400 bg-amber-500/30" : "border-slate-600 bg-slate-800"
          }`} />
          <span className={showBufferZone ? "" : "line-through"}>
            {summary.buffer_distance_km || 2}km Buffer
          </span>
        </button>

        <button
          onClick={onToggleAffectedZone}
          className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg transition-all hover:scale-[1.02] active:scale-95 ${
            showAffectedZone ? "opacity-100 font-semibold text-cyan-300 bg-cyan-950/30 border border-cyan-700/40" : "opacity-45 text-slate-400 bg-slate-800/40 border border-slate-700/30"
          }`}
          title="Click to toggle Hydraulic Flood Extent"
        >
          <span className={`w-2.5 h-2.5 rounded border inline-block ${
            showAffectedZone ? "bg-cyan-500/60 border-cyan-300" : "bg-slate-700 border-slate-600"
          }`} />
          <span className={showAffectedZone ? "" : "line-through"}>Flood Extent</span>
        </button>
      </div>

      {/* Affected Settlements List Header */}
      <div className="flex items-center justify-between pt-1">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Home className="w-3.5 h-3.5 text-red-400" />
          Downstream Settlements
        </h4>
        <span className="text-[10px] font-mono font-bold bg-red-950 text-red-300 border border-red-800/80 px-2 py-0.5 rounded-full">
          {impactedCount} / {affected_settlements.length} reached
        </span>
      </div>

      {/* Affected Settlements List */}
      <div className="overflow-y-auto max-h-[260px] pr-1 space-y-1.5 custom-scrollbar">
        {affected_settlements.map((city, idx) => {
          const reached = city.distance_km <= currentDistanceKm + 0.5;
          return (
            <div
              key={idx}
              className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-all ${
                reached
                  ? "bg-red-950/40 border-red-800/70 text-white shadow-sm"
                  : "bg-slate-800/40 border-slate-700/40 text-slate-400"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    reached ? "bg-red-500 animate-pulse ring-4 ring-red-500/20" : "bg-slate-600"
                  }`}
                />
                <div>
                  <span className="font-semibold block">{city.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {city.distance_km.toFixed(1)} km &middot; {Math.round(city.elevation_m)}m elev
                  </span>
                </div>
              </div>

              <div className="text-right font-mono">
                <span className={`block font-bold ${reached ? "text-red-300" : "text-slate-400"}`}>
                  +{Math.round(city.arrival_time_min)} min
                </span>
                <span className="text-[10px] text-cyan-300">
                  {city.peak_depth_m.toFixed(1)}m depth
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
