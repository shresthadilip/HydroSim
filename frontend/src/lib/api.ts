import { RiverInfo, SimulationRequest, SimulationResponse } from "@/types/simulation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export async function fetchRivers(): Promise<RiverInfo[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/rivers`);
    if (!res.ok) throw new Error("Failed to load rivers");
    return await res.json();
  } catch (err) {
    console.warn("Using fallback river info due to API connection error", err);
    return [
      {
        id: "bhotekoshi",
        name: "Bhotekoshi – Trishuli River",
        region: "Rasuwa / Bagmati, Nepal",
        default_origin: [85.5194, 28.2968],
        default_zoom: 11.5,
        default_bounds: [
          [84.69, 27.8],
          [85.55, 28.35],
        ],
      },
    ];
  }
}

export async function runSimulation(req: SimulationRequest): Promise<SimulationResponse> {
  const res = await fetch(`${API_BASE_URL}/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: "Simulation calculation failed" }));
    throw new Error(errData.detail || "Simulation failed");
  }

  return await res.json();
}

export async function fetchCrossSection(params: {
  river_id: string;
  origin_lon: number;
  origin_lat: number;
  click_lon: number;
  click_lat: number;
  volume_m3?: number;
  duration_hours?: number;
  buffer_distance_km?: number;
  max_distance_km?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/cross_section`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: "Failed to extract cross-section" }));
    throw new Error(errData.detail || "Cross-section extraction failed");
  }

  return await res.json();
}

