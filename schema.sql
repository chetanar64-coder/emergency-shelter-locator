CREATE DATABASE IF NOT EXISTS emergency_shelter;

USE emergency_shelter;

CREATE TABLE IF NOT EXISTS shelters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    total_beds INT DEFAULT 0,
    available_beds INT DEFAULT 0,
    food_status VARCHAR(20),
    water_status VARCHAR(20)
);

INSERT INTO shelters
(name, location, latitude, longitude, total_beds, available_beds, food_status, water_status)
VALUES
('Bengaluru Emergency Shelter 1', 'MG Road, Bengaluru', 12.9750, 77.6060, 100, 65, 'Available', 'Available'),
('Bengaluru Emergency Shelter 2', 'Indiranagar, Bengaluru', 12.9784, 77.6408, 80, 30, 'Limited', 'Available');