from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="Mentee Updates Dashboard API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Supabase client
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_ANON_KEY")
if not supabase_url or not supabase_key:
    raise ValueError("Missing Supabase credentials in environment variables")

supabase: Client = create_client(supabase_url, supabase_key)

# Pydantic models for response validation
class MenteeResponse(BaseModel):
    name: str
    discord_id: str
    house_role: Optional[str]
    response_count: int

class ResponseDetail(BaseModel):
    id: int
    week_number: int
    text_response: Optional[str]
    voice_response_url: Optional[str]
    created_at: datetime

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve the main HTML page
@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("templates/index.html", "r") as f:
        return f.read()

# API endpoint to get all unique houses
@app.get("/api/houses", response_model=List[str])
async def get_houses():
    try:
        # Get unique house roles from mentees table
        response = supabase.table("mentees").select("house_role").execute()
        
        # Extract unique non-null house roles
        houses = set()
        for mentee in response.data:
            if mentee.get("house_role"):
                houses.add(mentee["house_role"])
        
        return sorted(list(houses))
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching houses: {str(e)}")

# API endpoint to get mentees with optional filtering and sorting
# Update the get_mentees endpoint (around line 75)
@app.get("/api/mentees", response_model=List[MenteeResponse])
async def get_mentees(
    house: Optional[str] = None,
    sort_by: str = "name",
    sort_order: str = "asc",
    search: Optional[str] = None  # Add search parameter
):
    try:
        # Build query
        query = supabase.table("mentees").select("*")
        
        # Apply house filter if provided
        if house:
            query = query.eq("house_role", house)
        
        # Apply search filter if provided
        if search and search.strip():  # Check if search is not empty
            # Use ilike for case-insensitive search
            search_term = search.strip()
            query = query.ilike("name", f"%{search_term}%")
        
        # Execute query
        response = query.execute()
        mentees_data = response.data
        
        # Get response counts for each mentee
        mentees_with_counts = []
        for mentee in mentees_data:
            # Get count of responses for this mentee
            count_response = supabase.table("responses").select("id", count="exact").eq("mentee_id", mentee["id"]).execute()
            
            mentees_with_counts.append({
                "name": mentee["name"],
                "discord_id": mentee["discord_id"],
                "house_role": mentee.get("house_role"),
                "response_count": count_response.count if hasattr(count_response, 'count') else 0
            })
        
        # Sort the results
        reverse = (sort_order == "desc")
        if sort_by == "name":
            mentees_with_counts.sort(key=lambda x: x["name"].lower(), reverse=reverse)
        elif sort_by == "house_role":
            mentees_with_counts.sort(key=lambda x: (x["house_role"] or "").lower(), reverse=reverse)
        elif sort_by == "response_count":
            mentees_with_counts.sort(key=lambda x: x["response_count"], reverse=reverse)
        
        return mentees_with_counts
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching mentees: {str(e)}")

# API endpoint to get responses for a specific mentee
@app.get("/api/mentees/{discord_id}/responses", response_model=List[ResponseDetail])
async def get_mentee_responses(discord_id: str):
    try:
        # First, get the mentee to find their ID
        mentee_response = supabase.table("mentees").select("id").eq("discord_id", discord_id).execute()
        
        if not mentee_response.data:
            raise HTTPException(status_code=404, detail="Mentee not found")
        
        mentee_id = mentee_response.data[0]["id"]
        
        # Get all responses for this mentee
        responses_response = supabase.table("responses").select("*").eq("mentee_id", mentee_id).order("week_number", desc=True).execute()
        
        # Format the responses
        formatted_responses = []
        for resp in responses_response.data:
            formatted_responses.append({
                "id": resp["id"],
                "week_number": resp["week_number"],
                "text_response": resp.get("text_response"),
                "voice_response_url": resp.get("voice_response_url"),
                "created_at": datetime.fromisoformat(resp["created_at"]) if resp.get("created_at") else datetime.now()
            })
        
        return formatted_responses
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching responses: {str(e)}")

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
