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
    food_status: str = "HIGH"
    water_status: str = "HIGH"
    medical_status: str = "HIGH"

class ShelterUpdate(BaseModel):
    available_beds: int
    food_status: str
    water_status: str
    medical_status: str

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
                s.id, s.name, s.address, s.latitude, s.longitude, 
                s.total_beds, s.available_beds, s.is_active,
                r.food_status, r.water_status, r.medical_status, r.last_updated
            FROM shelters s
            LEFT JOIN shelter_resources r ON s.id = r.shelter_id
            WHERE s.is_active = TRUE
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
                s.id, s.name, s.address, s.latitude, s.longitude, 
                s.total_beds, s.available_beds, s.is_active,
                r.food_status, r.water_status, r.medical_status, r.last_updated
            FROM shelters s
            LEFT JOIN shelter_resources r ON s.id = r.shelter_id
            WHERE s.id = %s
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
            INSERT INTO shelters (name, address, latitude, longitude, total_beds, available_beds)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (shelter.name, shelter.address, shelter.latitude, shelter.longitude, shelter.total_beds, shelter.available_beds)
        )
        new_id = cursor.lastrowid
        cursor.execute(
            """
            INSERT INTO shelter_resources (shelter_id, food_status, water_status, medical_status)
            VALUES (%s, %s, %s, %s)
            """,
            (new_id, shelter.food_status, shelter.water_status, shelter.medical_status)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"id": new_id, "message": "Shelter and resource records created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/shelters/{shelter_id}")
def update_shelter(shelter_id: int, shelter: ShelterUpdate):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE shelters SET available_beds = %s WHERE id = %s",
            (shelter.available_beds, shelter_id)
        )
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Shelter not found")
        cursor.execute(
            """
            UPDATE shelter_resources 
            SET food_status = %s, water_status = %s, medical_status = %s 
            WHERE shelter_id = %s
            """,
            (shelter.food_status, shelter.water_status, shelter.medical_status, shelter_id)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return {"message": "Shelter beds and resource statuses updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))