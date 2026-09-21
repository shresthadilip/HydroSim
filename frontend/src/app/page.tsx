"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { RiverInfo, SimulationRequest, SimulationResponse, CrossSectionData, AffectedCity } from "@/types/simulation";
import { fetchRivers, runSimulation } from "@/lib/api";
import SimulationControls from "@/components/SimulationControls";
import TimelinePlayer from "@/components/TimelinePlayer";
import ImpactStats from "@/components/ImpactStats";
import CrossSectionModal from "@/components/CrossSectionModal";
import {
  Waves,
  ShieldAlert,
  Sliders,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Activity,
} from "lucide-react";

// Dynamically import 3D Map to prevent SSR issues with maplibre-gl
const Map3D = dynamic(() => import("@/components/Map3D"), { ssr: false });

export default function Home() {
  const [rivers, setRivers] = useState<RiverInfo[]>([]);
  const [selectedRiver, setSelectedRiver] = useState<RiverInfo | null>(null);
  const [originCoords, setOriginCoords] = useState<[number, number]>([85.5194, 28.2968]);
  const [isPickingOrigin, setIsPickingOrigin] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationResponse | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Left Collapsible Nav State
  const [isNavOpen, setIsNavOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"config" | "impact">("config");
  const [showAffectedZone, setShowAffectedZone] = useState(true);
  const [showBufferZone, setShowBufferZone] = useState(true);

  // Valley Cross Section Modal State
  const [activeCrossSection, setActiveCrossSection] = useState<CrossSectionData | null>(null);

  // Selected Settlement focus
  const [selectedSettlement, setSelectedSettlement] = useState<AffectedCity | null>(null);

  useEffect(() => {
    fetchRivers().then((rList) => {
      setRivers(rList);
      if (rList.length > 0) {
        setSelectedRiver(rList[0]);
        setOriginCoords(rList[0].default_origin);
      }
    });
  }, []);

  const handleRunSimulation = async (req: SimulationRequest) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await runSimulation(req);
      setSimulationResult(res);
      setCurrentStepIndex(0);
      setIsPlaying(true);
      setActiveTab("impact"); // Auto-switch to impact tab on simulation success
      setSelectedSettlement(null);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to run simulation. Please ensure the backend is running.");
    } finally {
      setIsLoading(false);
      setIsPickingOrigin(false);
    }
  };

  const handleReset = () => {
    setSimulationResult(null);
    setActiveCrossSection(null);
    setSelectedSettlement(null);
    setCurrentStepIndex(0);
    setIsPlaying(false);
    setErrorMsg(null);
    setActiveTab("config");
  };

  const currentStep = simulationResult?.steps[currentStepIndex] || null;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      {/* 3D Map Viewport */}
      {selectedRiver && (
        <Map3D
          river={selectedRiver}
          originCoords={originCoords}
          onOriginChange={(coords) => {
            setOriginCoords(coords);
            setIsPickingOrigin(false);
          }}
          simulationResult={simulationResult}
          currentStep={currentStep}
          isPickingOrigin={isPickingOrigin}
          showAffectedZone={showAffectedZone}
          setShowAffectedZone={setShowAffectedZone}
          showBufferZone={showBufferZone}
          setShowBufferZone={setShowBufferZone}
          activeCrossSection={activeCrossSection}
          onSelectCrossSection={setActiveCrossSection}
          selectedSettlement={selectedSettlement}
          onSelectSettlement={setSelectedSettlement}
        />
      )}

      {/* Collapsible Left Nav Drawer */}
      <div
        className={`absolute top-4 left-4 bottom-4 z-20 w-[410px] max-w-[calc(100vw-2rem)] flex flex-col transition-all duration-300 ease-in-out pointer-events-none ${
          isNavOpen ? "translate-x-0 opacity-100" : "-translate-x-[440px] opacity-0"
        }`}
      >
        <div className="bg-slate-900/90 backdrop-blur-2xl border border-slate-700/60 rounded-3xl shadow-2xl flex flex-col h-full overflow-hidden pointer-events-auto">
          {/* Nav Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/25">
                <Waves className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white tracking-wide">HydroSim 3D</h1>
                <p className="text-[10px] text-slate-400">Flood Routing & Impact Modeler</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleReset}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors"
                title="Reset simulation parameters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsNavOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Dual Navigation Tabs */}
          <div className="grid grid-cols-2 p-1.5 m-3 bg-slate-800/80 rounded-2xl border border-slate-700/60 text-xs font-semibold">
            <button
              onClick={() => setActiveTab("config")}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all ${
                activeTab === "config"
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Simulator Setup
            </button>

            <button
              onClick={() => setActiveTab("impact")}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all relative ${
                activeTab === "impact"
                  ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Affected Area
              {simulationResult && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping absolute top-1.5 right-2" />
              )}
            </button>
          </div>

          {/* Tab Content Area */}
          <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
            {activeTab === "config" && selectedRiver && (
              <SimulationControls
                rivers={rivers}
                selectedRiver={selectedRiver}
                onSelectRiver={(r) => {
                  setSelectedRiver(r);
                  setOriginCoords(r.default_origin);
                  handleReset();
                }}
                originCoords={originCoords}
                isPickingOrigin={isPickingOrigin}
                setIsPickingOrigin={setIsPickingOrigin}
                onRunSimulation={handleRunSimulation}
                isLoading={isLoading}
                onReset={handleReset}
              />
            )}

            {activeTab === "impact" && (
              <div>
                {simulationResult ? (
                  <ImpactStats
                    simulationResult={simulationResult}
                    currentDistanceKm={currentStep ? currentStep.distance_km : 0}
                    showAffectedZone={showAffectedZone}
                    onToggleAffectedZone={() => setShowAffectedZone((prev) => !prev)}
                    showBufferZone={showBufferZone}
                    onToggleBufferZone={() => setShowBufferZone((prev) => !prev)}
                    selectedSettlement={selectedSettlement}
                    onSelectSettlement={setSelectedSettlement}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-14 text-center px-4">
                    <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 text-amber-400 mb-3">
                      <AlertTriangle className="w-8 h-8 opacity-70" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-200 mb-1">No Active Simulation</h3>
                    <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed mb-4">
                      Set your water volume and run a 3D flood simulation to generate risk zone footprints & settlement impact analytics.
                    </p>
                    <button
                      onClick={() => setActiveTab("config")}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-xs rounded-xl border border-slate-700 transition-all"
                    >
                      Configure Simulation →
                    </button>
                  </div>
                )}
              </div>
            )}

            {errorMsg && (
              <div className="mt-3 bg-red-950/85 border border-red-800 text-red-200 text-xs p-3 rounded-2xl backdrop-blur-md shadow-xl flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Toggle Button when Left Nav is Collapsed */}
      {!isNavOpen && (
        <button
          onClick={() => setIsNavOpen(true)}
          className="absolute top-4 left-4 z-20 bg-slate-900/90 hover:bg-slate-800 text-slate-200 p-3 rounded-2xl border border-slate-700/60 shadow-2xl backdrop-blur-xl transition-all flex items-center gap-2 text-xs font-bold active:scale-95 group"
        >
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-sm">
            <Waves className="w-3.5 h-3.5" />
          </div>
          <span>Open Simulator Controls</span>
          <ChevronRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* Click-to-inspect helper pill when simulation is ready */}
      {simulationResult && !activeCrossSection && (
        <div className="absolute top-[62px] left-1/2 -translate-x-1/2 z-10 hidden sm:flex items-center gap-2 px-3.5 py-1.5 bg-slate-900/90 border border-cyan-500/40 text-cyan-200 rounded-full text-[11px] font-medium backdrop-blur-xl shadow-xl shadow-cyan-500/10 pointer-events-none animate-pulse">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>Click anywhere along the river corridor to inspect 3D Cross-Section</span>
        </div>
      )}

      {/* Interactive Valley Cross Section Inspector Modal */}
      {activeCrossSection && (
        <CrossSectionModal
          data={activeCrossSection}
          onClose={() => setActiveCrossSection(null)}
        />
      )}

      {/* Bottom Center Playback Scrubber (Shown when simulation result exists) */}
      {simulationResult && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-full max-w-2xl px-4">
          <TimelinePlayer
            simulationResult={simulationResult}
            currentStepIndex={currentStepIndex}
            setCurrentStepIndex={setCurrentStepIndex}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
          />
        </div>
      )}
    </main>
  );
}
