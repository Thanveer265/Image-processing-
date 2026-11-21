from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ImageRecord(Base):
    __tablename__ = "images"

    id = Column(String(64), primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False, unique=True)
    relative_path = Column(String(512), nullable=False)
    format = Column(String(32), nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    channels = Column(Integer, nullable=False)
    color_mode = Column(String(32), nullable=False)
    file_size = Column(Integer, nullable=False)
    mean_intensity = Column(Float, nullable=False)
    std_dev_intensity = Column(Float, nullable=False)
    is_preprocessed = Column(Boolean, default=False, nullable=False)
    parent_image_id = Column(String(64), ForeignKey("images.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    preprocessing_records = relationship(
        "PreprocessingRecord",
        foreign_keys="PreprocessingRecord.source_image_id",
        back_populates="source_image",
        cascade="all, delete-orphan",
    )
    feature_results = relationship(
        "FeatureResultRecord",
        back_populates="image",
        cascade="all, delete-orphan",
    )
    svd_results = relationship(
        "SVDResultRecord",
        back_populates="image",
        cascade="all, delete-orphan",
    )


class PreprocessingRecord(Base):
    __tablename__ = "preprocessing_records"

    id = Column(String(64), primary_key=True, index=True)
    source_image_id = Column(String(64), ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True)
    processed_image_id = Column(String(64), ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True)
    relative_path = Column(String(512), nullable=False)
    parameters_json = Column(Text, nullable=False)
    applied_operations_json = Column(Text, nullable=False)
    output_width = Column(Integer, nullable=False)
    output_height = Column(Integer, nullable=False)
    output_channels = Column(Integer, nullable=False)
    processing_time_ms = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    source_image = relationship("ImageRecord", foreign_keys=[source_image_id], back_populates="preprocessing_records")


class FeatureResultRecord(Base):
    __tablename__ = "feature_results"

    id = Column(String(64), primary_key=True, index=True)
    image_id = Column(String(64), ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True)
    extraction_method = Column(String(64), nullable=False)
    parameters_json = Column(Text, nullable=False)
    feature_names_json = Column(Text, nullable=False)
    feature_values_json = Column(Text, nullable=False)
    details_json = Column(Text, nullable=False)
    edge_sobel_path = Column(String(512), nullable=True)
    edge_canny_path = Column(String(512), nullable=True)
    edge_laplacian_path = Column(String(512), nullable=True)
    lbp_map_path = Column(String(512), nullable=True)
    glcm_map_path = Column(String(512), nullable=True)
    shape_mask_path = Column(String(512), nullable=True)
    processing_time_ms = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    image = relationship("ImageRecord", back_populates="feature_results")


class PCAModelRecord(Base):
    __tablename__ = "pca_models"

    id = Column(String(64), primary_key=True, index=True)
    model_name = Column(String(255), nullable=False)
    image_ids_json = Column(Text, nullable=False)
    feature_names_json = Column(Text, nullable=False)
    n_samples = Column(Integer, nullable=False)
    n_features = Column(Integer, nullable=False)
    n_components = Column(Integer, nullable=False)
    variance_threshold = Column(Float, nullable=True)
    explained_variance_ratio_json = Column(Text, nullable=False)
    cumulative_variance_json = Column(Text, nullable=False)
    total_explained_variance = Column(Float, nullable=False)
    artifact_relative_path = Column(String(512), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    processing_time_ms = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


class SVDResultRecord(Base):
    __tablename__ = "svd_results"

    id = Column(String(64), primary_key=True, index=True)
    image_id = Column(String(64), ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True)
    matrix_rows = Column(Integer, nullable=False)
    matrix_cols = Column(Integer, nullable=False)
    max_rank = Column(Integer, nullable=False)
    singular_values_json = Column(Text, nullable=False)
    cache_relative_path = Column(String(512), nullable=False)
    decompose_time_ms = Column(Float, nullable=False)
    last_rank = Column(Integer, nullable=True)
    last_retained_energy = Column(Float, nullable=True)
    last_mse = Column(Float, nullable=True)
    last_psnr = Column(Float, nullable=True)
    last_reconstructed_path = Column(String(512), nullable=True)
    last_difference_path = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    image = relationship("ImageRecord", back_populates="svd_results")


class ExperimentRecord(Base):
    __tablename__ = "experiments"

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    input_image_ids_json = Column(Text, nullable=False)
    dataset_name = Column(String(255), nullable=False)
    selected_methods_json = Column(Text, nullable=False)
    primary_method = Column(String(64), nullable=False, index=True)
    processing_params_json = Column(Text, nullable=False)
    feature_settings_json = Column(Text, nullable=False)
    pca_settings_json = Column(Text, nullable=False)
    svd_rank = Column(Integer, nullable=True)
    results_json = Column(Text, nullable=False)
    metrics_json = Column(Text, nullable=False)
    model_version = Column(String(128), nullable=True)
    status = Column(String(32), nullable=False, default="COMPLETED", index=True)
    error_details = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class JobRecord(Base):
    __tablename__ = "jobs"

    id = Column(String(64), primary_key=True, index=True)
    job_type = Column(String(64), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="QUEUED", index=True)
    progress_measurable = Column(Boolean, default=False, nullable=False)
    progress = Column(Float, nullable=True)
    message = Column(String(255), nullable=True)
    result_json = Column(Text, nullable=True)
    error_details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class ReportRecord(Base):
    __tablename__ = "reports"

    id = Column(String(64), primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    report_type = Column(String(64), nullable=False)
    format = Column(String(16), nullable=False)
    experiment_ids_json = Column(Text, nullable=False)
    relative_path = Column(String(512), nullable=False)
    file_size = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


Index("ix_experiments_created_at", ExperimentRecord.created_at.desc())
Index("ix_images_created_at", ImageRecord.created_at.desc())
