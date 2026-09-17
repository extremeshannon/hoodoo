from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog_json import build_catalog_dict
from app.database import get_db
from app.deps import require_staff
from app.models import Category

router = APIRouter(prefix="/catalog", tags=["catalog"], dependencies=[Depends(require_staff)])


@router.get("")
def get_catalog(db: Session = Depends(get_db)):
    has_rows = db.scalar(select(Category.id).limit(1)) is not None
    meta_extra = {"lastUpdated": date.today().isoformat() if has_rows else None}
    return build_catalog_dict(db, meta_override=meta_extra)
