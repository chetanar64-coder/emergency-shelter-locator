import random
from typing import Optional
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

# In-memory store to preserve client metadata across requests
booking_cache = {}

# ----------------- Pydantic Models -----------------

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

class ShelterResourceUpdate(BaseModel):
    available_beds: Optional[int] = None
    avail_beds: Optional[int] = None
    total_beds: Optional[int] = None
    food_pkts: Optional[int] = None
    water_liters: Optional[int] = None

class ReservationCreate(BaseModel):
    name: str
    phone: str
    shelter_id: int
    beds_requested: int = 1
    food_pkts_requested: int = 0
    water_liters_requested: int = 0

# ----------------- Routes -----------------

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
        for s in shelters:
            s["avail_beds"] = s["available_beds"]
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
        shelter["avail_beds"] = shelter["available_beds"]
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

# ----------------- Milestone 2 Endpoints -----------------

@app.post("/reservations", status_code=201)
def create_reservation(reservation: ReservationCreate):
    if reservation.beds_requested < 0:
        raise HTTPException(status_code=400, detail="beds_requested cannot be negative")
    if reservation.food_pkts_requested < 0:
        raise HTTPException(status_code=400, detail="food_pkts_requested cannot be negative")
    if reservation.water_liters_requested < 0:
        raise HTTPException(status_code=400, detail="water_liters_requested cannot be negative")
    if reservation.beds_requested == 0 and reservation.food_pkts_requested == 0 and reservation.water_liters_requested == 0:
        raise HTTPException(status_code=400, detail="Please request at least one resource: beds, food packets, or drinking water.")

    conn = get_db_connection()
    conn.autocommit = False
    cursor = conn.cursor(dictionary=True)

    try:
        # Lock shelter row for transaction
        cursor.execute("SELECT * FROM shelters WHERE id = %s FOR UPDATE", (reservation.shelter_id,))
        shelter = cursor.fetchone()

        if not shelter:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Shelter not found")

        # Capacity validations
        if reservation.beds_requested > 0 and shelter["available_beds"] < reservation.beds_requested:
            conn.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Capacity exceeded: Requested {reservation.beds_requested} beds, but only {shelter['available_beds']} are available."
            )

        if reservation.food_pkts_requested > 0 and shelter["food_pkts"] < reservation.food_pkts_requested:
            conn.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Capacity exceeded: Requested {reservation.food_pkts_requested} food packets, but only {shelter['food_pkts']} are available."
            )

        if reservation.water_liters_requested > 0 and shelter["water_liters"] < reservation.water_liters_requested:
            conn.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Capacity exceeded: Requested {reservation.water_liters_requested}L water, but only {shelter['water_liters']}L are available."
            )

        # Generate 6-digit OTP code
        otp_code = f"{random.randint(100000, 999999)}"

        # a) Insert record into bed_reservations
        cursor.execute(
            """
            INSERT INTO bed_reservations (shelter_id, user_phone, otp_code, reservation_status, expires_at)
            VALUES (%s, %s, %s, 'CONFIRMED', DATE_ADD(NOW(), INTERVAL 24 HOUR))
            """,
            (reservation.shelter_id, reservation.phone, otp_code)
        )
        booking_id = cursor.lastrowid

        # Insert record into help_requests to store citizen demand details
        cursor.execute(
            """
            INSERT INTO help_requests (user_phone, latitude, longitude, num_people, status)
            VALUES (%s, %s, %s, %s, 'RESOLVED')
            """,
            (reservation.phone, shelter["latitude"], shelter["longitude"], reservation.beds_requested)
        )

        # b) Decrement available_beds, food_pkts, and water_liters
        new_avail_beds = max(0, shelter["available_beds"] - reservation.beds_requested)
        new_food = max(0, shelter["food_pkts"] - reservation.food_pkts_requested)
        new_water = max(0, shelter["water_liters"] - reservation.water_liters_requested)

        cursor.execute(
            """
            UPDATE shelters
            SET available_beds = %s, food_pkts = %s, water_liters = %s
            WHERE id = %s
            """,
            (new_avail_beds, new_food, new_water, reservation.shelter_id)
        )

        conn.commit()

        # Fetch updated shelter state
        cursor.execute(
            """
            SELECT id, name, address, latitude, longitude, total_beds, available_beds, food_pkts, water_liters, is_active
            FROM shelters
            WHERE id = %s
            """,
            (reservation.shelter_id,)
        )
        updated_shelter = cursor.fetchone()
        if updated_shelter:
            updated_shelter["avail_beds"] = updated_shelter["available_beds"]

        # Cache citizen details for dashboard joins
        booking_cache[booking_id] = {
            "name": reservation.name,
            "phone": reservation.phone,
            "beds_requested": reservation.beds_requested,
            "food_pkts_requested": reservation.food_pkts_requested,
            "water_liters_requested": reservation.water_liters_requested
        }

        if reservation.beds_requested > 0:
            success_msg = f"Successfully reserved {reservation.beds_requested} bed(s) and supplies at {shelter['name']}."
        else:
            success_msg = f"Successfully reserved emergency supplies ({reservation.food_pkts_requested} food pkts, {reservation.water_liters_requested}L water) at {shelter['name']}."

        return {
            "booking_id": booking_id,
            "confirmation_id": booking_id,
            "otp_code": otp_code,
            "reservation_status": "CONFIRMED",
            "message": success_msg,
            "shelter": updated_shelter
        }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.get("/reservations")
def get_all_reservations():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                r.id,
                r.shelter_id,
                s.name AS shelter_name,
                r.user_phone,
                r.otp_code,
                r.reservation_status,
                r.expires_at
            FROM bed_reservations r
            JOIN shelters s ON r.shelter_id = s.id
            ORDER BY r.id DESC
        """
        cursor.execute(query)
        reservations = cursor.fetchall()
        cursor.close()
        conn.close()

        for res in reservations:
            b_id = res["id"]
            cached = booking_cache.get(b_id, {})
            res["name"] = cached.get("name", "Citizen")
            res["citizen_name"] = res["name"]
            res["phone"] = res["user_phone"]
            res["beds_requested"] = cached.get("beds_requested", 1)
            res["food_pkts_requested"] = cached.get("food_pkts_requested", 0)
            res["water_liters_requested"] = cached.get("water_liters_requested", 0)
            if res.get("expires_at"):
                res["expires_at"] = str(res["expires_at"])

        return reservations
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/shelters/{shelter_id}/resources")
def update_shelter_resources(shelter_id: int, resources: ShelterResourceUpdate):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT * FROM shelters WHERE id = %s", (shelter_id,))
        existing = cursor.fetchone()

        if not existing:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Shelter not found")

        # Resolve field values
        target_avail = resources.available_beds if resources.available_beds is not None else (
            resources.avail_beds if resources.avail_beds is not None else existing["available_beds"]
        )
        target_total = resources.total_beds if resources.total_beds is not None else existing["total_beds"]
        target_food = resources.food_pkts if resources.food_pkts is not None else existing["food_pkts"]
        target_water = resources.water_liters if resources.water_liters is not None else existing["water_liters"]

        # Enforce validation rules: 0 <= avail_beds <= total_beds and non-negative food/water
        if target_total < 0:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail="total_beds cannot be negative")

        if target_avail < 0 or target_avail > target_total:
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=400,
                detail=f"available_beds ({target_avail}) must be between 0 and total_beds ({target_total})"
            )

        if target_food < 0:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail="food_pkts cannot be negative")

        if target_water < 0:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail="water_liters cannot be negative")

        cursor.execute(
            """
            UPDATE shelters
            SET available_beds = %s, total_beds = %s, food_pkts = %s, water_liters = %s
            WHERE id = %s
            """,
            (target_avail, target_total, target_food, target_water, shelter_id)
        )
        conn.commit()

        cursor.execute(
            """
            SELECT id, name, address, latitude, longitude, total_beds, available_beds, food_pkts, water_liters, is_active
            FROM shelters
            WHERE id = %s
            """,
            (shelter_id,)
        )
        updated = cursor.fetchone()
        cursor.close()
        conn.close()

        if updated:
            updated["avail_beds"] = updated["available_beds"]

        return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
