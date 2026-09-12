"""Application configuration and physical constants."""


class Settings:
    # Service metadata
    PROJECT_NAME: str = "Bike Speed Simulation API"
    VERSION: str = "0.1.0"
    API_PREFIX: str = "/api"

    # CORS
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://miloszbuda.github.io",
        "https://*.github.io",
        "*",
    ]

    # Open-Meteo Endpoints
    OPEN_METEO_ARCHIVE_URL: str = "https://archive-api.open-meteo.com/v1/archive"
    OPEN_METEO_FORECAST_URL: str = "https://api.open-meteo.com/v1/forecast"

    # Physics & Environment Constants
    GRAVITY: float = 9.80665  # m/s^2
    R_DRY_AIR: float = 287.058  # J / (kg * K) - Specific gas constant for dry air
    
    # Wind height log profile defaults
    Z_REF: float = 10.0  # Reference weather station measurement height (meters)
    Z_CYCLIST: float = 1.2  # Effective cyclist height (meters)
    Z0_ROUGHNESS_OPEN_ROAD: float = 0.03  # Roughness length for open road / flat terrain (meters)

    # Cyclist / bike defaults
    DEFAULT_RHO: float = 1.20  # kg/m^3 standard sea level air density
    DEFAULT_MASS: float = 78.0  # kg (cyclist + bike + kit)
    DEFAULT_ETA: float = 0.97  # mechanical drivetrain efficiency (97%)
    DEFAULT_CRR: float = 0.004  # coefficient of rolling resistance (road tires)
    DEFAULT_CDA: float = 0.32  # drag area (m^2)


settings = Settings()
