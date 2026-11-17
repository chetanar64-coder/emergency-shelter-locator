
CREATE DATABASE IF NOT EXISTS emergency_shelter;
USE emergency_shelter;

-- Remove old tables before recreating them
DROP TABLE IF EXISTS help_requests;
DROP TABLE IF EXISTS hazard_zones;
DROP TABLE IF EXISTS bed_reservations;
DROP TABLE IF EXISTS shelter_resources;
DROP TABLE IF EXISTS shelters;

-- 1. Master Shelter Directory
CREATE TABLE shelters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    address TEXT,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    total_beds INT,
    available_beds INT,
    food_pkts INT DEFAULT 0,
    water_liters INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- 2. Shelter Resources
CREATE TABLE shelter_resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shelter_id INT,
    food_status ENUM('HIGH','MEDIUM','LOW','OUT'),
    water_status ENUM('HIGH','MEDIUM','LOW','OUT'),
    medical_status ENUM('HIGH','MEDIUM','LOW','OUT'),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (shelter_id)
        REFERENCES shelters(id)
        ON DELETE CASCADE
);

-- 3. Bed Reservations
CREATE TABLE bed_reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shelter_id INT,
    user_phone VARCHAR(15),
    otp_code VARCHAR(6),
    reservation_status ENUM(
        'PENDING_OTP','CONFIRMED','EXPIRED'
    ),
    expires_at TIMESTAMP,
    FOREIGN KEY (shelter_id)
        REFERENCES shelters(id)
        ON DELETE CASCADE
);

-- 4. Hazard Zones
CREATE TABLE hazard_zones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hazard_type ENUM('FLOOD','FIRE','LANDSLIDE'),
    title VARCHAR(100),
    polygon_geojson JSON,
    is_active BOOLEAN DEFAULT TRUE
);

-- 5. Help Requests
CREATE TABLE help_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_phone VARCHAR(15),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    num_people INT,
    status ENUM('PENDING','DISPATCHED','RESOLVED')
);

-- 8 Bengaluru shelter records
INSERT INTO shelters
(name, address, latitude, longitude, total_beds, available_beds, food_pkts, water_liters)
VALUES
('Sree Kanteerava Stadium', 'Kasturba Road, Bengaluru', 12.96945000, 77.59270000, 150, 42, 320, 900),
('Yeshwanthpura TTMC', 'Yeshwanthpur, Bengaluru', 13.01810000, 77.55653000, 100, 28, 250, 700),
('Kempegowda Bus Station (Majestic)', 'Majestic, Bengaluru', 12.97679000, 77.57260000, 120, 0, 300, 800),
('Koramangala Indoor Stadium', 'Koramangala, Bengaluru', 12.94351000, 77.62280000, 80, 19, 180, 500),
('Jayanagar Civic Association', 'Jayanagar, Bengaluru', 12.92651000, 77.58324000, 100, 64, 220, 650),
('Freedom Park', 'Seshadri Road, Bengaluru', 12.97741000, 77.58190000, 90, 0, 200, 600),
('Cubbon Park', 'Kasturba Road, Bengaluru', 12.97417000, 77.59342000, 70, 25, 150, 450),
('Bengaluru Palace', 'Palace Road, Bengaluru', 13.00350000, 77.58910000, 150, 38, 310, 850);
