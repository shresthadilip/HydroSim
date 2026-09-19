"use client";

import { useEffect, useState } from "react";
import { SimulationResponse, SimulationStep } from "@/types/simulation";
import { Play, Pause, RotateCcw, FastForward, Activity, Gauge, MapPin, Sliders } from "lucide-react";

interface TimelinePlayerProps {
  simulationResult: SimulationResponse;
  currentStepIndex: number;
  setCurrentStepIndex: React.Dispatch<React.SetStateAction<number>>;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
}

export default function TimelinePlayer({
  simulationResult,
  currentStepIndex,
  setCurrentStepIndex,
  isPlaying,
  setIsPlaying,
}: TimelinePlayerProps) {
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0); // 0.5x, 1x, 2x
  const steps = simulationResult.steps;
  const currentStep = steps[currentStepIndex] || steps[0];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      // Base interval slowed to 750ms per step for smooth, observable propagation
      const intervalMs = Math.round(750 / speedMultiplier);

      interval = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    }
    return () => clearInterval(interval);
  }, [isPlaying, steps.length, speedMultiplier, setCurrentStepIndex, setIsPlaying]);

  const handlePlayToggle = () => {
    if (currentStepIndex >= steps.length - 1) {
      setCurrentStepIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  };

  const cycleSpeed = () => {
    if (speedMultiplier === 0.5) setSpeedMultiplier(1.0);
    else if (speedMultiplier === 1.0) setSpeedMultiplier(2.0);
    else setSpeedMultiplier(0.5);
  };

  return (
    <div className="bg-slate-900/85 backdrop-blur-xl border border-slate-700/60 p-4 rounded-2xl shadow-2xl text-slate-100 flex flex-col gap-3 w-full max-w-2xl">
      {/* Top Controls & Live Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlayToggle}
            className="p-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-cyan-500/30 transition-all active:scale-95 flex items-center justify-center"
            title={isPlaying ? "Pause simulation" : "Play simulation"}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          
          <button
            onClick={handleReset}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
            title="Reset to origin"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Speed Selector */}
          <button
            onClick={cycleSpeed}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-mono text-cyan-300 transition-all"
            title="Toggle playback speed"
          >
            {speedMultiplier}x Speed
          </button>
        </div>

        {/* Live Step Stats */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex flex-col items-start">
            <span className="text-[10px] text-slate-400 font-sans">Elapsed Time</span>
            <span className="text-cyan-300 font-bold">
              {Math.floor(currentStep.time_min / 60)}h {Math.round(currentStep.time_min % 60)}m
            </span>
          </div>

          <div className="flex flex-col items-start">
            <span className="text-[10px] text-slate-400 font-sans">Flood Front</span>
            <span className="text-blue-300 font-bold">{currentStep.distance_km.toFixed(1)} km</span>
          </div>

          <div className="flex flex-col items-start">
            <span className="text-[10px] text-slate-400 font-sans">Peak Depth</span>
            <span className="text-emerald-300 font-bold">{currentStep.water_depth_m.toFixed(1)} m</span>
          </div>

          <div className="flex flex-col items-start">
            <span className="text-[10px] text-slate-400 font-sans">Peak Discharge</span>
            <span className="text-amber-300 font-bold">{Math.round(currentStep.peak_discharge_m3s)} m³/s</span>
          </div>
        </div>
      </div>

      {/* Scrubber Range Slider */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-mono text-slate-400">0 km</span>
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          value={currentStepIndex}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentStepIndex(Number(e.target.value));
          }}
          className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />
        <span className="text-[11px] font-mono text-slate-400">
          {simulationResult.summary.total_river_length_km.toFixed(0)} km
        </span>
      </div>
    </div>
  );
}
