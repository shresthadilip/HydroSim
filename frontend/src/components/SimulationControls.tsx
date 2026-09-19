"use client";

import { useState } from "react";
import { RiverInfo, SimulationRequest } from "@/types/simulation";
import { Droplets, Play, RotateCcw, MapPin, Gauge, Waves, Clock, Sparkles, Milestone, ArrowRightLeft } from "lucide-react";

interface SimulationControlsProps {
  rivers: RiverInfo[];
  selectedRiver: RiverInfo;
  onSelectRiver: (river: RiverInfo) => void;
  originCoords: [number, number];
  isPickingOrigin: boolean;
  setIsPickingOrigin: (picking: boolean) => void;
  onRunSimulation: (req: SimulationRequest) => void;
  isLoading: boolean;
  onReset: () => void;
}

export default function SimulationControls({
  rivers,
  selectedRiver,
  onSelectRiver,
  originCoords,
  isPickingOrigin,
  setIsPickingOrigin,
  onRunSimulation,
  isLoading,
  onReset,
}: SimulationControlsProps) {
  const [volumeM3, setVolumeM3] = useState<number>(5_000_000);
  const [durationHours, setDurationHours] = useState<number>(1.5);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number>(100);
  const [bufferDistanceKm, setBufferDistanceKm] = useState<number>(2.0);
  const [manningN, setManningN] = useState<number>(0.045);

  const VOLUME_PRESETS = [
    { label: "1M m³", value: 1_000_000 },
    { label: "5M m³", value: 5_000_000 },
    { label: "10M m³", value: 10_000_000 },
    { label: "25M m³", value: 25_000_000 },
    { label: "50M m³", value: 50_000_000 },
  ];

  const DISTANCE_PRESETS = [
    { label: "25 km", value: 25 },
    { label: "50 km", value: 50 },
    { label: "100 km", value: 100 },
    { label: "200 km", value: 200 },
    { label: "Full (300 km)", value: 300 },
  ];

  const BUFFER_PRESETS = [
    { label: "0.5 km", value: 0.5 },
    { label: "1.0 km", value: 1.0 },
    { label: "2.0 km", value: 2.0 },
    { label: "3.0 km", value: 3.0 },
    { label: "5.0 km", value: 5.0 },
  ];

  const handleRun = () => {
    onRunSimulation({
      river_id: selectedRiver.id,
      origin_lon: originCoords[0],
      origin_lat: originCoords[1],
      volume_m3: volumeM3,
      duration_hours: durationHours,
      max_distance_km: maxDistanceKm >= 300 ? undefined : maxDistanceKm,
      buffer_distance_km: bufferDistanceKm,
      manning_n: manningN,
    });
  };

  return (
    <div className="flex flex-col gap-4 text-slate-100 w-full">
      {/* River Selection */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Droplets className="w-3.5 h-3.5 text-cyan-400" />
          Selected River Basin
        </label>
        <select
          value={selectedRiver.id}
          onChange={(e) => {
            const r = rivers.find((it) => it.id === e.target.value);
            if (r) onSelectRiver(r);
          }}
          className="bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50 cursor-pointer"
        >
          {rivers.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.region})
            </option>
          ))}
        </select>
      </div>

      {/* Breach Origin Coordinates */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-red-400" />
            Breach / Outflow Origin
          </label>
          <button
            onClick={() => setIsPickingOrigin(!isPickingOrigin)}
            className={`text-[11px] px-2.5 py-0.5 rounded-lg font-medium transition-all ${
              isPickingOrigin
                ? "bg-amber-500 text-slate-950 shadow-md font-bold"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
            }`}
          >
            {isPickingOrigin ? "Picking on Map..." : "🎯 Pick on Map"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-slate-400 text-[10px] block">Longitude</span>
            <span className="font-mono text-cyan-300 font-semibold">{originCoords[0].toFixed(4)}°E</span>
          </div>
          <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs">
            <span className="text-slate-400 text-[10px] block">Latitude</span>
            <span className="font-mono text-cyan-300 font-semibold">{originCoords[1].toFixed(4)}°N</span>
          </div>
        </div>
      </div>

      {/* Water Volume */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-blue-400" />
            Total Water Volume
          </label>
          <span className="font-mono text-xs font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-700/40 px-2 py-0.5 rounded-lg">
            {(volumeM3 / 1_000_000).toFixed(1)} Million m³
          </span>
        </div>

        <input
          type="range"
          min={500_000}
          max={50_000_000}
          step={500_000}
          value={volumeM3}
          onChange={(e) => setVolumeM3(Number(e.target.value))}
          className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
        />

        {/* Volume Presets */}
        <div className="flex gap-1.5">
          {VOLUME_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setVolumeM3(p.value)}
              className={`flex-1 py-1 rounded-lg text-[10px] font-medium transition-all ${
                volumeM3 === p.value
                  ? "bg-cyan-500 text-white font-bold shadow-md shadow-cyan-500/20"
                  : "bg-slate-800/90 text-slate-400 hover:bg-slate-700/80 hover:text-white border border-slate-700/50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Breach Duration */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            Release Duration
          </label>
          <span className="font-mono text-xs font-bold text-amber-300 bg-amber-950/60 border border-amber-700/40 px-2 py-0.5 rounded-lg">
            {durationHours.toFixed(1)} Hours
          </span>
        </div>
        <input
          type="range"
          min={0.5}
          max={6.0}
          step={0.5}
          value={durationHours}
          onChange={(e) => setDurationHours(Number(e.target.value))}
          className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
        />
      </div>

      {/* Downstream Reach Distance */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Milestone className="w-3.5 h-3.5 text-emerald-400" />
            Downstream Reach to Simulate
          </label>
          <span className="font-mono text-xs font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-700/40 px-2 py-0.5 rounded-lg">
            {maxDistanceKm >= 300 ? "Full River (300 km)" : `${maxDistanceKm} km`}
          </span>
        </div>

        <input
          type="range"
          min={10}
          max={300}
          step={10}
          value={maxDistanceKm}
          onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
          className="w-full accent-emerald-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
        />

        {/* Distance Presets */}
        <div className="flex gap-1.5">
          {DISTANCE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setMaxDistanceKm(p.value)}
              className={`flex-1 py-1 rounded-lg text-[10px] font-medium transition-all ${
                maxDistanceKm === p.value
                  ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                  : "bg-slate-800/90 text-slate-400 hover:bg-slate-700/80 hover:text-white border border-slate-700/50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Disaster Evaluation Buffer Zone */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border border-dashed border-amber-400 inline-block" />
            Disaster Buffer Envelope
          </label>
          <span className="font-mono text-xs font-bold text-amber-300 bg-amber-950/60 border border-amber-700/40 px-2 py-0.5 rounded-lg">
            {bufferDistanceKm.toFixed(1)} km Buffer
          </span>
        </div>

        <input
          type="range"
          min={0.5}
          max={5.0}
          step={0.5}
          value={bufferDistanceKm}
          onChange={(e) => setBufferDistanceKm(Number(e.target.value))}
          className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
        />

        {/* Buffer Presets */}
        <div className="flex gap-1.5">
          {BUFFER_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setBufferDistanceKm(p.value)}
              className={`flex-1 py-1 rounded-lg text-[10px] font-medium transition-all ${
                bufferDistanceKm === p.value
                  ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                  : "bg-slate-800/90 text-slate-400 hover:bg-slate-700/80 hover:text-white border border-slate-700/50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* CTA Run Simulation */}
      <button
        onClick={handleRun}
        disabled={isLoading}
        className="mt-2 w-full bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed group active:scale-[0.99]"
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Computing 3D Hydraulics...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 text-cyan-200 group-hover:rotate-12 transition-transform" />
            <span>Simulate 3D Flood Wave</span>
          </>
        )}
      </button>
    </div>
  );
}
