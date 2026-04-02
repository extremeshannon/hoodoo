from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings. Set REPO_ROOT in Docker to the directory that contains data/ and index.html."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://hoodoo:hoodoo@localhost:5432/hoodoo"
    catalog_seed_path: str = "data/catalog.json"
    repo_root: str | None = None
    cart_cookie_name: str = "hoodoo_cart_id"
    cart_cookie_max_age: int = 60 * 60 * 24 * 60  # 60 days


@lru_cache
def get_settings() -> Settings:
    return Settings()
