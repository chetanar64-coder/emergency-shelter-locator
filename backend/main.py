import math
import os
import random
from datetime import datetime, timedelta
from typing import List, Optional

import bcrypt
from database import get_db_connection
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field

# Ensure database tables and initial seeds exist on startup
from init_db import init_db

load_dotenv()
init_db()

# Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "emergency_shelter_jwt_secret_key_bengaluru_2026_super_secure")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

app = FastAPI(
    title="Emergency Shelter & Resource Locator API",
    description="Full-stack Emergency Shelter System with Admin Dashboard & Real-Time Navigation",
    version="2.0.0"
)

# CORS middleware to support both file:// origin and localhost serving
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store to preserve client metadata across requests (Milestone 2)
booking_cache = {}

# ----------------- Helper Functions -----------------

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_admin(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing. Admin access required."
        )
    
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1]
    else:
        token = authorization

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        admin_id: int = payload.get("admin_id")
        username: str = payload.get("sub")
        if admin_id is None or username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload."
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired admin session token."
        )

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, username, email, full_name, is_active FROM admins WHERE id = %s", (admin_id,))
    admin = cursor.fetchone()
    cursor.close()
    conn.close()

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin account does not exist."
        )
    if not admin.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is inactive."
        )

    return admin

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS coordinates in kilometers."""
    R = 6371.0 # Earth's radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)

# ----------------- Pydantic Models -----------------

class AdminLogin(BaseModel):
    username_or_email: str
    password: str

class ShelterBase(BaseModel):
    name: str = Field(..., min_length=2, description="Shelter name")
    address: str = Field(..., min_length=3, description="Full address")
    latitude: float = Field(..., ge=-90.0, le=90.0, description="GPS Latitude")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="GPS Longitude")
    total_beds: int = Field(..., ge=0, description="Total bed/seat capacity")
    available_beds: int = Field(..., ge=0, description="Available beds/seats")
    food_pkts: int = Field(0, ge=0, description="Available food packets")
    water_liters: int = Field(0, ge=0, description="Available drinking water in liters")
    medical_status: str = Field("Available", description="Medical kit availability ('Available', 'Low', 'None')")
    contact_phone: str = Field("+91 80 2297 5000", description="Emergency contact phone number")
    description: Optional[str] = Field(None, description="Additional instructions or notes")
    is_active: bool = Field(True, description="Shelter operational status")

class ShelterCreateAdmin(ShelterBase):
    pass

class ShelterUpdateAdmin(ShelterBase):
    pass

class ShelterStatusUpdate(BaseModel):
    is_active: bool

class ShelterAvailabilityUpdate(BaseModel):
    available_beds: int = Field(..., ge=0)
    food_pkts: Optional[int] = Field(None, ge=0)
    water_liters: Optional[int] = Field(None, ge=0)

# Legacy Models
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

class VerifyOtpRequest(BaseModel):
    otp_code: str
    phone: Optional[str] = None

# ----------------- Admin Authentication Routes -----------------

@app.post("/admin/login")
def admin_login(payload: AdminLogin):
    """Authenticates an administrator with username/email and password."""
    identifier = payload.username_or_email.strip()
    if not identifier or not payload.password:
        raise HTTPException(status_code=400, detail="Username/email and password are required.")

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        """
        SELECT id, username, email, password_hash, full_name, is_active
        FROM admins
        WHERE username = %s OR email = %s
        """,
        (identifier, identifier)
    )
    admin = cursor.fetchone()

    if not admin:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Administrator account not found."
        )

    if not admin.get("is_active"):
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator account is disabled. Contact system administrator."
        )

    # Verify password hash using bcrypt
    password_bytes = payload.password.encode('utf-8')
    stored_hash_bytes = admin["password_hash"].encode('utf-8')

    try:
        is_valid = bcrypt.checkpw(password_bytes, stored_hash_bytes)
    except Exception:
        is_valid = False

    if not is_valid:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid password. Please try again."
        )

    # Update last login timestamp
    cursor.execute("UPDATE admins SET last_login = NOW() WHERE id = %s", (admin["id"],))
    cursor.close()
    conn.close()

    token = create_access_token(
        data={"sub": admin["username"], "admin_id": admin["id"], "email": admin["email"]}
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "admin": {
            "id": admin["id"],
            "username": admin["username"],
            "email": admin["email"],
            "full_name": admin["full_name"]
        }
    }

@app.get("/admin/me")
def get_admin_profile(current_admin: dict = Depends(get_current_admin)):
    """Returns the authenticated admin's profile."""
    return {"admin": current_admin}

@app.post("/admin/logout")
def admin_logout(current_admin: dict = Depends(get_current_admin)):
    """Logout confirmation endpoint."""
    return {"message": "Admin session terminated successfully."}

# ----------------- Admin Dashboard Statistics -----------------

@app.get("/admin/stats")
def get_admin_dashboard_stats(current_admin: dict = Depends(get_current_admin)):
    """Computes real-time shelter statistics for the admin dashboard."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT COUNT(*) as total FROM shelters")
        total_shelters = cursor.fetchone()["total"]

        cursor.execute("SELECT COUNT(*) as active FROM shelters WHERE is_active = TRUE")
        active_shelters = cursor.fetchone()["active"]

        cursor.execute("SELECT COUNT(*) as inactive FROM shelters WHERE is_active = FALSE")
        inactive_shelters = cursor.fetchone()["inactive"]

        cursor.execute("SELECT COUNT(*) as full_count FROM shelters WHERE is_active = TRUE AND available_beds = 0")
        full_shelters = cursor.fetchone()["full_count"]

        cursor.execute("SELECT COUNT(*) as available_count FROM shelters WHERE is_active = TRUE AND available_beds > 0")
        available_shelters = cursor.fetchone()["available_count"]

        cursor.execute("SELECT COALESCE(SUM(total_beds), 0) as total_cap FROM shelters")
        total_capacity = cursor.fetchone()["total_cap"]

        cursor.execute("SELECT COALESCE(SUM(available_beds), 0) as total_avail FROM shelters WHERE is_active = TRUE")
        total_available_beds = cursor.fetchone()["total_avail"]

        cursor.execute("SELECT COALESCE(SUM(food_pkts), 0) as total_food FROM shelters WHERE is_active = TRUE")
        total_food = cursor.fetchone()["total_food"]

        cursor.execute("SELECT COALESCE(SUM(water_liters), 0) as total_water FROM shelters WHERE is_active = TRUE")
        total_water = cursor.fetchone()["total_water"]

        cursor.execute("SELECT COUNT(*) as res_count FROM bed_reservations")
        total_reservations = cursor.fetchone()["res_count"]

        cursor.close()
        conn.close()

        return {
            "total_shelters": total_shelters,
            "active_shelters": active_shelters,
            "inactive_shelters": inactive_shelters,
            "full_shelters": full_shelters,
            "available_shelters": available_shelters,
            "total_capacity": int(total_capacity),
            "total_available_beds": int(total_available_beds),
            "total_food_pkts": int(total_food),
            "total_water_liters": int(total_water),
            "total_reservations": total_reservations
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- Admin Shelter Management (Protected CRUD) -----------------

@app.get("/admin/shelters")
def admin_get_all_shelters(
    current_admin: dict = Depends(get_current_admin),
    search: Optional[str] = Query(None, description="Search by name or address"),
    status_filter: Optional[str] = Query("all", description="all, active, inactive, full, available")
):
    """Returns all shelters (active and inactive) for admin management."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT 
                id, name, address, latitude, longitude,
                total_beds, available_beds, food_pkts, water_liters,
                medical_status, contact_phone, description, is_active,
                created_at, updated_at
            FROM shelters
            WHERE 1=1
        """
        params = []

        if search:
            query += " AND (name LIKE %s OR address LIKE %s)"
            search_param = f"%{search.strip()}%"
            params.extend([search_param, search_param])

        if status_filter == "active":
            query += " AND is_active = TRUE"
        elif status_filter == "inactive":
            query += " AND is_active = FALSE"
        elif status_filter == "full":
            query += " AND is_active = TRUE AND available_beds = 0"
        elif status_filter == "available":
            query += " AND is_active = TRUE AND available_beds > 0"

        query += " ORDER BY id DESC"

        cursor.execute(query, tuple(params))
        shelters = cursor.fetchall()
        cursor.close()
        conn.close()

        for s in shelters:
            s["avail_beds"] = s["available_beds"]
            if s.get("created_at"):
                s["created_at"] = str(s["created_at"])
            if s.get("updated_at"):
                s["updated_at"] = str(s["updated_at"])

        return shelters
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/admin/shelters", status_code=201)
def admin_create_shelter(shelter: ShelterCreateAdmin, current_admin: dict = Depends(get_current_admin)):
    """Creates a new shelter in the system."""
    if shelter.available_beds > shelter.total_beds:
        raise HTTPException(
            status_code=400,
            detail=f"Available beds ({shelter.available_beds}) cannot exceed total capacity ({shelter.total_beds})."
        )

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            INSERT INTO shelters (
                name, address, latitude, longitude,
                total_beds, available_beds, food_pkts, water_liters,
                medical_status, contact_phone, description, is_active
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                shelter.name.strip(),
                shelter.address.strip(),
                shelter.latitude,
                shelter.longitude,
                shelter.total_beds,
                shelter.available_beds,
                shelter.food_pkts,
                shelter.water_liters,
                shelter.medical_status,
                shelter.contact_phone.strip(),
                shelter.description,
                shelter.is_active
            )
        )
        new_id = cursor.lastrowid

        cursor.execute("SELECT * FROM shelters WHERE id = %s", (new_id,))
        created = cursor.fetchone()
        cursor.close()
        conn.close()

        if created:
            created["avail_beds"] = created["available_beds"]
            if created.get("created_at"):
                created["created_at"] = str(created["created_at"])
            if created.get("updated_at"):
                created["updated_at"] = str(created["updated_at"])

        return {"message": "Emergency shelter added successfully.", "shelter": created}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/admin/shelters/{shelter_id}")
def admin_update_shelter(
    shelter_id: int,
    shelter: ShelterUpdateAdmin,
    current_admin: dict = Depends(get_current_admin)
):
    """Updates full shelter information."""
    if shelter.available_beds > shelter.total_beds:
        raise HTTPException(
            status_code=400,
            detail=f"Available beds ({shelter.available_beds}) cannot exceed total capacity ({shelter.total_beds})."
        )

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT id FROM shelters WHERE id = %s", (shelter_id,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Shelter not found.")

        cursor.execute(
            """
            UPDATE shelters
            SET name = %s, address = %s, latitude = %s, longitude = %s,
                total_beds = %s, available_beds = %s, food_pkts = %s, water_liters = %s,
                medical_status = %s, contact_phone = %s, description = %s, is_active = %s
            WHERE id = %s
            """,
            (
                shelter.name.strip(),
                shelter.address.strip(),
                shelter.latitude,
                shelter.longitude,
                shelter.total_beds,
                shelter.available_beds,
                shelter.food_pkts,
                shelter.water_liters,
                shelter.medical_status,
                shelter.contact_phone.strip(),
                shelter.description,
                shelter.is_active,
                shelter_id
            )
        )

        cursor.execute("SELECT * FROM shelters WHERE id = %s", (shelter_id,))
        updated = cursor.fetchone()
        cursor.close()
        conn.close()

        if updated:
            updated["avail_beds"] = updated["available_beds"]
            if updated.get("created_at"):
                updated["created_at"] = str(updated["created_at"])
            if updated.get("updated_at"):
                updated["updated_at"] = str(updated["updated_at"])

        return {"message": "Shelter updated successfully.", "shelter": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/admin/shelters/{shelter_id}/status")
def admin_toggle_shelter_status(
    shelter_id: int,
    status_payload: ShelterStatusUpdate,
    current_admin: dict = Depends(get_current_admin)
):
    """Activates or deactivates a shelter."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT id FROM shelters WHERE id = %s", (shelter_id,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Shelter not found.")

        cursor.execute(
            "UPDATE shelters SET is_active = %s WHERE id = %s",
            (status_payload.is_active, shelter_id)
        )

        cursor.execute("SELECT * FROM shelters WHERE id = %s", (shelter_id,))
        updated = cursor.fetchone()
        cursor.close()
        conn.close()

        status_str = "activated" if status_payload.is_active else "deactivated"
        return {"message": f"Shelter {status_str} successfully.", "shelter": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/admin/shelters/{shelter_id}/availability")
def admin_update_availability(
    shelter_id: int,
    payload: ShelterAvailabilityUpdate,
    current_admin: dict = Depends(get_current_admin)
):
    """Quick update for live bed availability and resources."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT * FROM shelters WHERE id = %s", (shelter_id,))
        existing = cursor.fetchone()
        if not existing:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Shelter not found.")

        if payload.available_beds > existing["total_beds"]:
            cursor.close()
            conn.close()
            raise HTTPException(
                status_code=400,
                detail=f"Available beds ({payload.available_beds}) cannot exceed total capacity ({existing['total_beds']})."
            )

        new_food = payload.food_pkts if payload.food_pkts is not None else existing["food_pkts"]
        new_water = payload.water_liters if payload.water_liters is not None else existing["water_liters"]

        cursor.execute(
            """
            UPDATE shelters
            SET available_beds = %s, food_pkts = %s, water_liters = %s
            WHERE id = %s
            """,
            (payload.available_beds, new_food, new_water, shelter_id)
        )

        cursor.execute("SELECT * FROM shelters WHERE id = %s", (shelter_id,))
        updated = cursor.fetchone()
        cursor.close()
        conn.close()

        return {"message": "Live availability updated successfully.", "shelter": updated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/admin/shelters/{shelter_id}")
def admin_delete_shelter(shelter_id: int, current_admin: dict = Depends(get_current_admin)):
    """Deletes a shelter from the database."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT name FROM shelters WHERE id = %s", (shelter_id,))
        shelter = cursor.fetchone()
        if not shelter:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Shelter not found.")

        # Delete dependent rows in bed_reservations and shelter_resources if any
        cursor.execute("DELETE FROM bed_reservations WHERE shelter_id = %s", (shelter_id,))
        cursor.execute("DELETE FROM shelter_resources WHERE shelter_id = %s", (shelter_id,))
        cursor.execute("DELETE FROM shelters WHERE id = %s", (shelter_id,))

        cursor.close()
        conn.close()

        return {"message": f"Shelter '{shelter['name']}' deleted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- Public Shelter Locator Endpoints -----------------

@app.get("/")
def health_check():
    return {
        "status": "online",
        "project": "Emergency Shelter & Resource Locator",
        "version": "2.0.0",
        "docs": "/docs"
    }

@app.get("/shelters")
def get_all_active_shelters():
    """Returns active shelters for the public emergency map."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                id, name, address, latitude, longitude, 
                total_beds, available_beds, food_pkts, water_liters,
                medical_status, contact_phone, description, is_active
            FROM shelters
            WHERE is_active = TRUE
            ORDER BY available_beds DESC, id ASC
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

@app.get("/shelters/all")
def get_all_shelters_public():
    """Returns all shelters (including inactive/full) with their status."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                id, name, address, latitude, longitude, 
                total_beds, available_beds, food_pkts, water_liters,
                medical_status, contact_phone, description, is_active
            FROM shelters
            ORDER BY is_active DESC, available_beds DESC, id ASC
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

@app.get("/shelters/recommendations")
def get_recommended_shelters(
    lat: float = Query(..., description="User latitude"),
    lng: float = Query(..., description="User longitude"),
    limit: int = Query(5, ge=1, le=20, description="Max recommendations")
):
    """
    Shelter Recommendation Logic:
    1. Retrieve active shelters from database.
    2. Exclude inactive shelters.
    3. Exclude shelters with zero availability for recommended list.
    4. Calculate distance from user's location.
    5. Sort by distance.
    6. Return closest available shelters + next available if nearest is full.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT 
                id, name, address, latitude, longitude, 
                total_beds, available_beds, food_pkts, water_liters,
                medical_status, contact_phone, description, is_active
            FROM shelters
            WHERE is_active = TRUE
            """
        )
        active_shelters = cursor.fetchall()
        cursor.close()
        conn.close()

        available_list = []
        full_list = []

        for s in active_shelters:
            s["avail_beds"] = s["available_beds"]
            dist_km = haversine_distance(lat, lng, float(s["latitude"]), float(s["longitude"]))
            s["distance_km"] = dist_km
            s["distance_text"] = f"{dist_km} km"

            if s["available_beds"] > 0:
                available_list.append(s)
            else:
                full_list.append(s)

        # Sort both lists by distance
        available_list.sort(key=lambda x: x["distance_km"])
        full_list.sort(key=lambda x: x["distance_km"])

        # Check if the overall closest shelter was full
        all_sorted = sorted(active_shelters, key=lambda x: x["distance_km"])
        nearest_overall = all_sorted[0] if all_sorted else None
        closest_was_full = nearest_overall is not None and nearest_overall["available_beds"] == 0

        note = ""
        if closest_was_full:
            note = f"Closest shelter '{nearest_overall['name']}' ({nearest_overall['distance_km']} km) is currently FULL. Recommending next available shelters below."

        return {
            "user_location": {"latitude": lat, "longitude": lng},
            "recommendations": available_list[:limit],
            "total_available_nearby": len(available_list),
            "nearest_full_shelter": nearest_overall if closest_was_full else None,
            "notice": note
        }
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
                total_beds, available_beds, food_pkts, water_liters,
                medical_status, contact_phone, description, is_active
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

# ----------------- Citizen Reservation & OTP Endpoints (No User Registration Required) -----------------

@app.post("/reservations", status_code=201)
def create_reservation(reservation: ReservationCreate):
    """
    Allows citizens to instantly reserve emergency beds, food, and water without registering an account.
    Validates capacity, deducts from shelter stock in real-time, and issues a 6-digit Admission OTP code.
    """
    if reservation.beds_requested < 0:
        raise HTTPException(status_code=400, detail="beds_requested cannot be negative")
    if reservation.food_pkts_requested < 0:
        raise HTTPException(status_code=400, detail="food_pkts_requested cannot be negative")
    if reservation.water_liters_requested < 0:
        raise HTTPException(status_code=400, detail="water_liters_requested cannot be negative")
    if reservation.beds_requested == 0 and reservation.food_pkts_requested == 0 and reservation.water_liters_requested == 0:
        raise HTTPException(status_code=400, detail="Please request at least one resource: beds, food packets, or drinking water.")

    phone_clean = reservation.phone.strip()
    if not phone_clean:
        raise HTTPException(status_code=400, detail="Phone number is required for emergency OTP verification.")

    conn = get_db_connection()
    conn.autocommit = False
    cursor = conn.cursor(dictionary=True)

    try:
        # Lock shelter row for concurrent transaction safety
        cursor.execute("SELECT * FROM shelters WHERE id = %s FOR UPDATE", (reservation.shelter_id,))
        shelter = cursor.fetchone()

        if not shelter:
            conn.rollback()
            raise HTTPException(status_code=404, detail="Shelter not found")

        if not shelter["is_active"]:
            conn.rollback()
            raise HTTPException(status_code=400, detail="This shelter is currently inactive and cannot accept reservations.")

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

        # Generate 6-digit random Admission OTP code
        otp_code = f"{random.randint(100000, 999999)}"

        # Insert record into bed_reservations with all details
        cursor.execute(
            """
            INSERT INTO bed_reservations 
            (shelter_id, citizen_name, user_phone, beds_requested, food_pkts, water_liters, otp_code, reservation_status, expires_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'CONFIRMED', DATE_ADD(NOW(), INTERVAL 24 HOUR))
            """,
            (
                reservation.shelter_id,
                reservation.name.strip() or "Citizen",
                phone_clean,
                reservation.beds_requested,
                reservation.food_pkts_requested,
                reservation.water_liters_requested,
                otp_code
            )
        )
        booking_id = cursor.lastrowid

        # Insert record into help_requests to store citizen demand details
        cursor.execute(
            """
            INSERT INTO help_requests (user_phone, latitude, longitude, num_people, status)
            VALUES (%s, %s, %s, %s, 'RESOLVED')
            """,
            (phone_clean, shelter["latitude"], shelter["longitude"], reservation.beds_requested)
        )

        # Decrement available_beds, food_pkts, and water_liters
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
        cursor.execute("SELECT * FROM shelters WHERE id = %s", (reservation.shelter_id,))
        updated_shelter = cursor.fetchone()
        if updated_shelter:
            updated_shelter["avail_beds"] = updated_shelter["available_beds"]

        booking_cache[booking_id] = {
            "name": reservation.name,
            "phone": phone_clean,
            "beds_requested": reservation.beds_requested,
            "food_pkts_requested": reservation.food_pkts_requested,
            "water_liters_requested": reservation.water_liters_requested,
            "otp_code": otp_code
        }

        success_msg = f"Successfully reserved {reservation.beds_requested} bed(s) and relief supplies at {shelter['name']}."

        return {
            "booking_id": booking_id,
            "confirmation_id": f"BKG-{booking_id}",
            "otp_code": otp_code,
            "citizen_name": reservation.name,
            "phone": phone_clean,
            "beds_reserved": reservation.beds_requested,
            "food_pkts_reserved": reservation.food_pkts_requested,
            "water_liters_reserved": reservation.water_liters_requested,
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

@app.post("/reservations/verify-otp")
def verify_reservation_otp(payload: VerifyOtpRequest):
    """Verifies a citizen's admission OTP code at the shelter gate/reception."""
    code = payload.otp_code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="OTP code is required.")

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT r.*, s.name as shelter_name, s.address as shelter_address, s.contact_phone as shelter_phone
        FROM bed_reservations r
        JOIN shelters s ON r.shelter_id = s.id
        WHERE r.otp_code = %s
    """
    params = [code]

    if payload.phone:
        query += " AND r.user_phone = %s"
        params.append(payload.phone.strip())

    cursor.execute(query, tuple(params))
    booking = cursor.fetchone()

    if not booking:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Invalid OTP code or no matching reservation found.")

    # Mark as VERIFIED
    cursor.execute("UPDATE bed_reservations SET reservation_status = 'VERIFIED' WHERE id = %s", (booking["id"],))
    cursor.close()
    conn.close()

    booking["reservation_status"] = "VERIFIED"
    if booking.get("created_at"):
        booking["created_at"] = str(booking["created_at"])
    if booking.get("expires_at"):
        booking["expires_at"] = str(booking["expires_at"])

    return {
        "status": "success",
        "message": f"OTP {code} verified successfully! Admission confirmed for {booking.get('citizen_name', 'Citizen')}.",
        "reservation": booking
    }

@app.get("/reservations/lookup")
def lookup_reservation(phone: Optional[str] = Query(None), otp: Optional[str] = Query(None)):
    """Allows citizens to look up their active reservation and OTP code."""
    if not phone and not otp:
        raise HTTPException(status_code=400, detail="Provide phone number or OTP code to look up reservation.")

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT r.*, s.name as shelter_name, s.address as shelter_address, s.contact_phone as shelter_phone
        FROM bed_reservations r
        JOIN shelters s ON r.shelter_id = s.id
        WHERE 1=1
    """
    params = []
    if otp:
        query += " AND r.otp_code = %s"
        params.append(otp.strip())
    if phone:
        query += " AND r.user_phone = %s"
        params.append(phone.strip())

    query += " ORDER BY r.id DESC LIMIT 5"

    cursor.execute(query, tuple(params))
    results = cursor.fetchall()
    cursor.close()
    conn.close()

    for r in results:
        if r.get("created_at"):
            r["created_at"] = str(r["created_at"])
        if r.get("expires_at"):
            r["expires_at"] = str(r["expires_at"])

    return results

@app.get("/reservations")
def get_all_reservations():
    """Returns all citizen reservations for management."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT 
                r.id,
                r.shelter_id,
                s.name AS shelter_name,
                s.address AS shelter_address,
                s.contact_phone AS shelter_contact,
                r.citizen_name,
                r.user_phone,
                r.beds_requested,
                r.food_pkts,
                r.water_liters,
                r.otp_code,
                r.reservation_status,
                r.created_at,
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
            if not res.get("citizen_name"):
                res["citizen_name"] = cached.get("name", "Citizen")
            res["name"] = res["citizen_name"]
            res["phone"] = res["user_phone"]
            if res.get("beds_requested") is None:
                res["beds_requested"] = cached.get("beds_requested", 1)
            if res.get("food_pkts") is None:
                res["food_pkts"] = cached.get("food_pkts_requested", 0)
            if res.get("water_liters") is None:
                res["water_liters"] = cached.get("water_liters_requested", 0)
            res["food_pkts_requested"] = res["food_pkts"]
            res["water_liters_requested"] = res["water_liters"]
            if res.get("created_at"):
                res["created_at"] = str(res["created_at"])
            if res.get("expires_at"):
                res["expires_at"] = str(res["expires_at"])

        return reservations
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
        cursor.close()
        conn.close()
        return {"message": "Shelter beds and supplies updated successfully"}
    except HTTPException:
        raise
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

        target_avail = resources.available_beds if resources.available_beds is not None else (
            resources.avail_beds if resources.avail_beds is not None else existing["available_beds"]
        )
        target_total = resources.total_beds if resources.total_beds is not None else existing["total_beds"]
        target_food = resources.food_pkts if resources.food_pkts is not None else existing["food_pkts"]
        target_water = resources.water_liters if resources.water_liters is not None else existing["water_liters"]

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

        cursor.execute("SELECT * FROM shelters WHERE id = %s", (shelter_id,))
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

# ----------------- Serve Frontend Static Files -----------------
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "Frontend"))
if os.path.isdir(frontend_path):
    app.mount("/app", StaticFiles(directory=frontend_path, html=True), name="frontend")
