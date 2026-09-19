from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class RiverInfo(BaseModel):
    id: str
    name: str
    region: str
    default_origin: List[float]
    default_zoom: float
    default_bounds: List[List[float]]

class SimulationRequest(BaseModel):
    river_id: str = Field(default="bhotekoshi", description="ID of selected river")
    origin_lon: float = Field(..., description="Breach / origin longitude")
    origin_lat: float = Field(..., description="Breach / origin latitude")
    volume_m3: float = Field(default=5_000_000.0, ge=10_000, le=500_000_000, description="Total water volume in m³")
    duration_hours: float = Field(default=1.5, ge=0.1, le=24.0, description="Outflow duration in hours")
    max_distance_km: Optional[float] = Field(default=None, ge=1.0, le=500.0, description="Max downstream reach to simulate in km")
    buffer_distance_km: Optional[float] = Field(default=2.0, ge=0.2, le=10.0, description="Disaster buffer zone width in km (e.g. 2.0 km)")
    manning_n: Optional[float] = Field(default=0.045, ge=0.01, le=0.15, description="Manning's roughness coefficient")

class AffectedCity(BaseModel):
    name: str
    distance_km: float
    elevation_m: float
    arrival_time_min: float
    peak_depth_m: float
    inundation_width_m: float
    lon: float
    lat: float

class SimulationStep(BaseModel):
    time_min: float
    distance_km: float
    front_lon: float
    front_lat: float
    peak_discharge_m3s: float
    water_depth_m: float
    geojson_polygon: Optional[Dict[str, Any]] = None

class SimulationSummary(BaseModel):
    total_volume_m3: float
    duration_hours: float
    peak_discharge_m3s: float
    total_river_length_km: float
    total_transit_time_min: float
    max_flood_depth_m: float
    max_flood_width_m: float
    elevation_drop_m: float
    total_affected_area_km2: float
    buffer_distance_km: float = 2.0

class SimulationResponse(BaseModel):
    success: bool
    summary: SimulationSummary
    affected_settlements: List[AffectedCity]
    affected_area_polygon: Dict[str, Any] # Full estimated hydraulic flood extent
    buffer_zone_polygon: Optional[Dict[str, Any]] = None # Configured disaster buffer zone (e.g. 2km yellow dotted line)
    steps: List[SimulationStep]
    profile: Dict[str, List[float]] # distance_km, elevation_m, water_depth_m, arrival_time_min

class CrossSectionRequest(BaseModel):
    river_id: str = Field(default="bhotekoshi")
    origin_lon: float
    origin_lat: float
    click_lon: float
    click_lat: float
    volume_m3: float = Field(default=5_000_000.0)
    duration_hours: float = Field(default=1.5)
    buffer_distance_km: float = Field(default=2.0)
    manning_n: Optional[float] = Field(default=0.045)
    max_distance_km: Optional[float] = None

class CrossSectionResponse(BaseModel):
    success: bool
    station_distance_km: float
    nearest_settlement: Optional[str] = None
    bed_elevation_m: float
    water_depth_m: float
    wse_m: float
    top_width_m: float
    velocity_ms: float
    discharge_m3s: float
    arrival_time_min: float
    buffer_distance_km: float
    transect_offsets_m: List[float]
    terrain_elevations_m: List[float]
    flood_left_offset_m: float
    flood_right_offset_m: float
    buffer_left_offset_m: float
    buffer_right_offset_m: float
    transect_line_geojson: Dict[str, Any]
    center_coords: List[float]
    water_body_3d_geojson: Optional[Dict[str, Any]] = None
    flood_curtains_3d_geojson: Optional[Dict[str, Any]] = None
    buffer_curtains_3d_geojson: Optional[Dict[str, Any]] = None
    transect_profile_3d_geojson: Optional[Dict[str, Any]] = None

