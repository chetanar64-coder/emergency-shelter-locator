import os
import bcrypt
from database import get_db_connection

def init_db():
    """Initializes the database tables and ensures the default admin and initial shelters are seeded."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # 1. Admins table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) NOT NULL UNIQUE,
            email VARCHAR(150) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            full_name VARCHAR(150) DEFAULT 'Disaster Management Admin',
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP NULL
        )
        """)

        # 2. Shelters table
        cur.execute("""
        CREATE TABLE IF NOT EXISTS shelters (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            address TEXT,
            latitude DECIMAL(10,8) NOT NULL,
            longitude DECIMAL(11,8) NOT NULL,
            total_beds INT NOT NULL DEFAULT 100,
            available_beds INT NOT NULL DEFAULT 0,
            food_pkts INT DEFAULT 0,
            water_liters INT DEFAULT 0,
            medical_status VARCHAR(50) DEFAULT 'Available',
            contact_phone VARCHAR(50) DEFAULT '+91 80 2297 5000',
            description TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
        """)

        # Check and add missing columns to shelters
        cur.execute("SHOW COLUMNS FROM shelters")
        cols = [c[0].lower() for c in cur.fetchall()]
        if 'medical_status' not in cols:
            cur.execute("ALTER TABLE shelters ADD COLUMN medical_status VARCHAR(50) DEFAULT 'Available'")
        if 'contact_phone' not in cols:
            cur.execute("ALTER TABLE shelters ADD COLUMN contact_phone VARCHAR(50) DEFAULT '+91 80 2297 5000'")
        if 'description' not in cols:
            cur.execute("ALTER TABLE shelters ADD COLUMN description TEXT")
        if 'updated_at' not in cols:
            cur.execute("ALTER TABLE shelters ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")

        # 3. Shelter resources
        cur.execute("""
        CREATE TABLE IF NOT EXISTS shelter_resources (
            id INT AUTO_INCREMENT PRIMARY KEY,
            shelter_id INT,
            food_status ENUM('HIGH','MEDIUM','LOW','OUT'),
            water_status ENUM('HIGH','MEDIUM','LOW','OUT'),
            medical_status ENUM('HIGH','MEDIUM','LOW','OUT'),
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (shelter_id) REFERENCES shelters(id) ON DELETE CASCADE
        )
        """)

        # 4. Bed reservations with citizen details & OTP
        cur.execute("""
        CREATE TABLE IF NOT EXISTS bed_reservations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            shelter_id INT,
            citizen_name VARCHAR(150) DEFAULT 'Citizen',
            user_phone VARCHAR(20),
            beds_requested INT DEFAULT 1,
            food_pkts INT DEFAULT 0,
            water_liters INT DEFAULT 0,
            otp_code VARCHAR(10),
            reservation_status VARCHAR(30) DEFAULT 'CONFIRMED',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NULL,
            FOREIGN KEY (shelter_id) REFERENCES shelters(id) ON DELETE CASCADE
        )
        """)

        # Check and add missing columns to bed_reservations if upgrading
        cur.execute("SHOW COLUMNS FROM bed_reservations")
        res_cols = [c[0].lower() for c in cur.fetchall()]
        if 'citizen_name' not in res_cols:
            cur.execute("ALTER TABLE bed_reservations ADD COLUMN citizen_name VARCHAR(150) DEFAULT 'Citizen'")
        if 'beds_requested' not in res_cols:
            cur.execute("ALTER TABLE bed_reservations ADD COLUMN beds_requested INT DEFAULT 1")
        if 'food_pkts' not in res_cols:
            cur.execute("ALTER TABLE bed_reservations ADD COLUMN food_pkts INT DEFAULT 0")
        if 'water_liters' not in res_cols:
            cur.execute("ALTER TABLE bed_reservations ADD COLUMN water_liters INT DEFAULT 0")
        if 'created_at' not in res_cols:
            cur.execute("ALTER TABLE bed_reservations ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        cur.execute("ALTER TABLE bed_reservations MODIFY COLUMN reservation_status VARCHAR(30) DEFAULT 'CONFIRMED'")

        # 5. Hazard zones
        cur.execute("""
        CREATE TABLE IF NOT EXISTS hazard_zones (
            id INT AUTO_INCREMENT PRIMARY KEY,
            hazard_type ENUM('FLOOD','FIRE','LANDSLIDE'),
            title VARCHAR(100),
            polygon_geojson JSON,
            is_active BOOLEAN DEFAULT TRUE
        )
        """)

        # 6. Help requests
        cur.execute("""
        CREATE TABLE IF NOT EXISTS help_requests (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_phone VARCHAR(20),
            latitude DECIMAL(10,8),
            longitude DECIMAL(11,8),
            num_people INT,
            status ENUM('PENDING','DISPATCHED','RESOLVED')
        )
        """)

        # Seed default administrator if not present
        cur.execute("SELECT COUNT(*) FROM admins WHERE username = 'admin'")
        if cur.fetchone()[0] == 0:
            default_pw = "Admin@Shelter2026"
            pw_hash = bcrypt.hashpw(default_pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            cur.execute(
                """
                INSERT INTO admins (username, email, password_hash, full_name)
                VALUES (%s, %s, %s, %s)
                """,
                ('admin', 'admin@shelter.org', pw_hash, 'Emergency Relief Coordinator')
            )
            print("[Init DB] Seeded default administrator: admin / Admin@Shelter2026")

        # Seed shelters if empty
        cur.execute("SELECT COUNT(*) FROM shelters")
        if cur.fetchone()[0] == 0:
            shelters_data = [
                ('Sree Kanteerava Stadium', 'Kasturba Road, Sampangi Rama Nagar, Bengaluru', 12.96945000, 77.59270000, 150, 42, 320, 900, 'Available', '+91 80 2222 0001', 'Major indoor stadium relief camp. First aid center active near Gate 2.'),
                ('Yeshwanthpura TTMC', 'Tumkur Road, Yeshwanthpur, Bengaluru', 13.01810000, 77.55653000, 100, 28, 250, 700, 'Available', '+91 80 2337 1102', 'Transit management center equipped with emergency rations and clean resting mats.'),
                ('Kempegowda Bus Station (Majestic)', 'Tank Bund Road, Majestic, Bengaluru', 12.97679000, 77.57260000, 120, 0, 300, 800, 'Low', '+91 80 2287 3303', 'Central bus station concourse. Currently at capacity; redirecting to Freedom Park or Kanteerava.'),
                ('Koramangala Indoor Stadium', '80 Feet Road, 8th Block, Koramangala, Bengaluru', 12.94351000, 77.62280000, 80, 19, 180, 500, 'Available', '+91 80 2553 4404', 'Community indoor arena with clean drinking water and baby food packets available.'),
                ('Jayanagar Civic Association', 'Near 4th Block Complex, Jayanagar, Bengaluru', 12.92651000, 77.58324000, 100, 64, 220, 650, 'Available', '+91 80 2664 5505', 'High-capacity community hall. Medical triage and emergency beds ready on Ground Floor.'),
                ('Freedom Park', 'Seshadri Road, Gandhi Nagar, Bengaluru', 12.97741000, 77.58190000, 90, 0, 200, 600, 'Low', '+91 80 2220 6606', 'Outdoor park pavilion with covered shelters. Currently full.'),
                ('Cubbon Park Relief Post', 'Near High Court, Kasturba Road, Bengaluru', 12.97417000, 77.59342000, 70, 25, 150, 450, 'Available', '+91 80 2286 7707', 'Temporary relief camp with paramedical staff and bottled water.'),
                ('Bengaluru Palace Grounds', 'Palace Road, Vasanth Nagar, Bengaluru', 13.00350000, 77.58910000, 150, 38, 310, 850, 'Available', '+91 80 2336 8808', 'Spacious exhibition hall relief center with high-volume food distribution.')
            ]
            cur.executemany(
                """
                INSERT INTO shelters 
                (name, address, latitude, longitude, total_beds, available_beds, food_pkts, water_liters, medical_status, contact_phone, description)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                shelters_data
            )
            print(f"[Init DB] Seeded {len(shelters_data)} initial shelters.")

        cur.close()
        conn.close()
        print("[Init DB] Database schema successfully verified and up-to-date.")
    except Exception as e:
        print("[Init DB] Database initialization note/warning:", e)

if __name__ == "__main__":
    init_db()
