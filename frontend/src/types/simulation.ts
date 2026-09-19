export interface RiverInfo {
  id: string;
  name: string;
  region: string;
  default_origin: [number, number]; // [lon, lat]
  default_zoom: number;
  default_bounds: [[number, number], [number, number]];
}

export interface SimulationRequest {
  river_id: string;
  origin_lon: number;
  origin_lat: number;
  volume_m3: number;
  duration_hours: number;
  max_distance_km?: number;
  buffer_distance_km?: number;
  manning_n?: number;
}

export interface AffectedCity {
  name: string;
  distance_km: number;
  elevation_m: number;
  arrival_time_min: number;
  peak_depth_m: number;
  inundation_width_m: number;
  lon: number;
  lat: number;
}

export interface SimulationStep {
  time_min: number;
  distance_km: number;
  front_lon: number;
  front_lat: number;
  peak_discharge_m3s: number;
  water_depth_m: number;
  inundation_width_m: number;
  geojson_polygon?: GeoJSON.FeatureCollection | GeoJSON.Feature;
}

export interface SimulationSummary {
  total_volume_m3: number;
  duration_hours: number;
  peak_discharge_m3s: number;
  total_river_length_km: number;
  total_transit_time_min: number;
  max_flood_depth_m: number;
  max_flood_width_m: number;
  elevation_drop_m: number;
  total_affected_area_km2: number;
  buffer_distance_km?: number;
}

export interface SimulationResponse {
  success: boolean;
  summary: SimulationSummary;
  affected_settlements: AffectedCity[];
  affected_area_polygon: GeoJSON.FeatureCollection | GeoJSON.Feature;
  buffer_zone_polygon?: GeoJSON.FeatureCollection | GeoJSON.Feature;
  steps: SimulationStep[];
  profile: {
    distance_km: number[];
    elevation_m: number[];
    water_depth_m: number[];
    arrival_time_min: number[];
    lon: number[];
    lat: number[];
  };
}

export interface CrossSectionData {
  success: boolean;
  station_distance_km: number;
  nearest_settlement?: string;
  bed_elevation_m: number;
  water_depth_m: number;
  wse_m: number;
  top_width_m: number;
  velocity_ms: number;
  discharge_m3s: number;
  arrival_time_min: number;
  buffer_distance_km: number;
  transect_offsets_m: number[];
  terrain_elevations_m: number[];
  flood_left_offset_m: number;
  flood_right_offset_m: number;
  buffer_left_offset_m: number;
  buffer_right_offset_m: number;
  transect_line_geojson: GeoJSON.Feature;
  center_coords: [number, number];
  water_body_3d_geojson?: GeoJSON.FeatureCollection;
  flood_curtains_3d_geojson?: GeoJSON.FeatureCollection;
  buffer_curtains_3d_geojson?: GeoJSON.FeatureCollection;
  transect_profile_3d_geojson?: GeoJSON.Feature;
}

