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

-- Sample shelter records
INSERT INTO shelters
(name, address, latitude, longitude, total_beds, available_beds)
VALUES
('Bengaluru Emergency Shelter 1',
 'MG Road, Bengaluru',
 12.97500000, 77.60600000, 100, 65),

('Bengaluru Emergency Shelter 2',
 'Indiranagar, Bengaluru',
 12.97840000, 77.64080000, 80, 30);

-- Sample resource records
INSERT INTO shelter_resources
(shelter_id, food_status, water_status, medical_status)
VALUES
(1, 'HIGH', 'HIGH', 'MEDIUM'),
(2, 'MEDIUM', 'HIGH', 'HIGH');
