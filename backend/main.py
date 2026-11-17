from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import get_db_connection

app = FastAPI(title="Emergency Shelter & Resource Locator API - Batch B15")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ShelterCreate(BaseModel):
    name: str
    address: str
    latitude: float
    longitude: float
    total_beds: int
    available_beds: int
    food_pkts: int = 0
    water_liters: int = 0

class ShelterUpdate(BaseModel):
    available_beds: int
    food_pkts: int
    water_liters: int

@app.get("/")
def health_check():
    return {"status": "online", "project": "Emergency Shelter & Resource Locator"}

@app.get("/shelters")
def get_all_shelters():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                id, name, address, latitude, longitude, 
                total_beds, available_beds, food_pkts, water_liters, is_active
            FROM shelters
            WHERE is_active = TRUE
        """
        cursor.execute(query)
        shelters = cursor.fetchall()
        cursor.close()
        conn.close()
        return shelters
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/shelters/{shelter_id}")
def get_shelter(shelter_id: int):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                id, name, address, latitude, longitude, 
                total_beds, available_beds, food_pkts, water_liters, is_active
            FROM shelters
            WHERE id = %s
        """
        cursor.execute(query, (shelter_id,))
        shelter = cursor.fetchone()
        cursor.close()
        conn.close()
        if not shelter:
            raise HTTPException(status_code=404, detail="Shelter not found")
        return shelter
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/shelters", status_code=201)
def create_shelter(shelter: ShelterCreate):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO shelters (name, address, latitude, longitude, total_beds, available_beds, food_pkts, water_liters)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (shelter.name, shelter.address, shelter.latitude, shelter.longitude, shelter.total_beds, shelter.available_beds, shelter.food_pkts, shelter.water_liters)
        )
        new_id = cursor.lastrowid
        conn.commit()
        cursor.close()
        conn.close()
        return {"id": new_id, "message": "Shelter created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/shelters/{shelter_id}")
def update_shelter(shelter_id: int, shelter: ShelterUpdate):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE shelters 
            SET available_beds = %s, food_pkts = %s, water_liters = %s 
            WHERE id = %s
            """,
            (shelter.available_beds, shelter.food_pkts, shelter.water_liters, shelter_id)
        )
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Shelter not found")
        conn.commit()
        cursor.close()
        conn.close()
        return {"message": "Shelter beds and supplies updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))