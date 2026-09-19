from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any

from app.core.config import RIVER_FILES
from app.models.schemas import RiverInfo, SimulationRequest, SimulationResponse, CrossSectionRequest, CrossSectionResponse
from app.services.simulation import run_flood_simulation
from app.services.cross_section import extract_valley_cross_section

router = APIRouter(prefix="/api/v1")

@router.get("/health")
def healthcheck():
    return {"status": "ok", "service": "flood-simulation-api"}

@router.get("/rivers", response_model=List[RiverInfo])
def list_rivers():
    results = []
    for r_id, info in RIVER_FILES.items():
        results.append(RiverInfo(
            id=info["id"],
            name=info["name"],
            region=info["region"],
            default_origin=info["default_origin"],
            default_zoom=info["default_zoom"],
            default_bounds=info["default_bounds"],
        ))
    return results

@router.post("/simulate", response_model=SimulationResponse)
def simulate_flood(req: SimulationRequest):
    try:
        response = run_flood_simulation(req)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")

@router.post("/cross_section", response_model=CrossSectionResponse)
def get_cross_section(req: CrossSectionRequest):
    try:
        response = extract_valley_cross_section(req)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cross-section error: {str(e)}")

