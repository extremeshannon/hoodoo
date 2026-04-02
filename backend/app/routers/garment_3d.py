from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Garment3dAsset, Product
from app.schemas import Garment3dAssetOut

router = APIRouter(prefix="/products", tags=["garment-3d"])


@router.get("/{slug}/3d", response_model=list[Garment3dAssetOut])
def list_product_3d_assets(slug: str, db: Session = Depends(get_db)):
    """
    Assets for the future Three.js (or similar) configurator.
    Export GLB/glTF or preview images from CLO3D, upload or place files, then insert rows here (or via admin UI).
    """
    product = db.scalar(select(Product).where(Product.slug == slug))
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    rows = db.scalars(
        select(Garment3dAsset)
        .where(Garment3dAsset.product_id == product.id)
        .order_by(Garment3dAsset.sort_order, Garment3dAsset.id)
    ).all()
    return list(rows)
