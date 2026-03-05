-- ============================================
-- TREND & MARKET INTELLIGENCE
-- ============================================

CREATE TABLE IF NOT EXISTS scraped_trends (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    listing_url TEXT,
    title TEXT,
    description TEXT,
    price DECIMAL(10,2),
    sales_count INTEGER,
    review_count INTEGER,
    rating DECIMAL(3,2),
    favorites INTEGER,
    views INTEGER,
    keywords TEXT[],
    tags TEXT[],
    category VARCHAR(100),
    style VARCHAR(100),
    subject VARCHAR(100),
    color_palette JSONB,
    image_urls TEXT[],
    scraped_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trends_platform ON scraped_trends(platform);
CREATE INDEX IF NOT EXISTS idx_trends_keywords ON scraped_trends USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_trends_scraped_at ON scraped_trends(scraped_at);

CREATE TABLE IF NOT EXISTS demand_scores (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(200) UNIQUE NOT NULL,
    search_volume INTEGER,
    sales_velocity DECIMAL(10,2),
    social_engagement INTEGER,
    competition_count INTEGER,
    demand_score DECIMAL(10,2),
    trend_direction VARCHAR(20),
    saturation_level DECIMAL(5,2),
    avg_price DECIMAL(10,2),
    calculated_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_score ON demand_scores(demand_score DESC);
CREATE INDEX IF NOT EXISTS idx_keyword ON demand_scores(keyword);

CREATE TABLE IF NOT EXISTS market_opportunities (
    id SERIAL PRIMARY KEY,
    niche VARCHAR(200),
    demand_score DECIMAL(10,2),
    competition_level VARCHAR(20),
    profit_potential DECIMAL(10,2),
    trend_strength DECIMAL(5,2),
    recommended_price DECIMAL(10,2),
    recommended_styles TEXT[],
    recommended_keywords TEXT[],
    opportunity_rank INTEGER,
    status VARCHAR(20) DEFAULT 'active',
    identified_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CATEGORY & SILO SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS silos (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(100),
    description TEXT,
    target_daily_output INTEGER DEFAULT 4,
    priority INTEGER DEFAULT 50,
    performance_score DECIMAL(5,2),
    total_artworks INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0,
    avg_conversion DECIMAL(5,4),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS silo_keywords (
    id SERIAL PRIMARY KEY,
    silo_id INTEGER REFERENCES silos(id),
    keyword VARCHAR(200),
    relevance_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_silo_keywords
    ON silo_keywords (silo_id, keyword);

-- ============================================
-- AI ARTIST SYSTEM
-- ============================================

CREATE TABLE IF NOT EXISTS ai_artists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    persona TEXT,
    silo_id INTEGER REFERENCES silos(id),
    preferred_ai_engine VARCHAR(50),
    backup_ai_engine VARCHAR(50),
    style_rules JSONB,
    color_palettes JSONB,
    composition_rules JSONB,
    prompt_templates JSONB,
    negative_prompts TEXT[],
    technical_params JSONB,
    daily_quota INTEGER DEFAULT 4,
    total_created INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    avg_sale_rate DECIMAL(5,4),
    performance_score DECIMAL(5,2),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_library (
    id SERIAL PRIMARY KEY,
    artist_id INTEGER REFERENCES ai_artists(id),
    prompt_template TEXT NOT NULL,
    variation_rules JSONB,
    success_rate DECIMAL(5,4),
    avg_sales DECIMAL(5,2),
    times_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- IMAGE PRODUCTION
-- ============================================

CREATE TABLE IF NOT EXISTS artworks (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    artist_id INTEGER REFERENCES ai_artists(id),
    silo_id INTEGER REFERENCES silos(id),
    title VARCHAR(200),
    prompt TEXT,
    negative_prompt TEXT,
    ai_engine VARCHAR(50),
    ai_params JSONB,
    style_tags TEXT[],
    color_palette JSONB,
    master_image_url TEXT,
    master_image_path TEXT,
    image_hash VARCHAR(64),
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    quality_score DECIMAL(5,2),
    status VARCHAR(20) DEFAULT 'generated',
    generation_time INTEGER,
    generation_cost DECIMAL(6,4),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artworks_artist ON artworks(artist_id);
CREATE INDEX IF NOT EXISTS idx_artworks_silo ON artworks(silo_id);
CREATE INDEX IF NOT EXISTS idx_artworks_status ON artworks(status);
CREATE INDEX IF NOT EXISTS idx_artworks_created ON artworks(created_at);

CREATE TABLE IF NOT EXISTS artwork_variations (
    id SERIAL PRIMARY KEY,
    artwork_id INTEGER REFERENCES artworks(id),
    variation_type VARCHAR(50),
    image_url TEXT,
    image_path TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mockups (
    id SERIAL PRIMARY KEY,
    artwork_id INTEGER REFERENCES artworks(id),
    scene_type VARCHAR(50),
    mockup_url TEXT,
    mockup_path TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PRODUCT PACKAGES
-- ============================================

CREATE TABLE IF NOT EXISTS product_packages (
    id SERIAL PRIMARY KEY,
    artwork_id INTEGER REFERENCES artworks(id),
    package_type VARCHAR(50),
    formats JSONB,
    file_paths JSONB,
    total_files INTEGER,
    package_size INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- DISTRIBUTION & LISTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS listings (
    id SERIAL PRIMARY KEY,
    artwork_id INTEGER REFERENCES artworks(id),
    platform VARCHAR(50) NOT NULL,
    platform_listing_id VARCHAR(100),
    listing_url TEXT,
    title VARCHAR(200),
    description TEXT,
    tags TEXT[],
    price DECIMAL(10,2),
    discount_price DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'draft',
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_artwork ON listings(artwork_id);
CREATE INDEX IF NOT EXISTS idx_listings_platform ON listings(platform);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);

CREATE TABLE IF NOT EXISTS listing_images (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES listings(id),
    image_url TEXT,
    image_type VARCHAR(50),
    display_order INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SALES & ANALYTICS
-- ============================================

CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES listings(id),
    artwork_id INTEGER REFERENCES artworks(id),
    platform VARCHAR(50),
    sale_date TIMESTAMP,
    quantity INTEGER DEFAULT 1,
    price DECIMAL(10,2),
    platform_fee DECIMAL(10,2),
    net_revenue DECIMAL(10,2),
    customer_location VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_artwork ON sales(artwork_id);
CREATE INDEX IF NOT EXISTS idx_sales_platform ON sales(platform);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);

CREATE TABLE IF NOT EXISTS analytics_daily (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    artworks_created INTEGER DEFAULT 0,
    listings_published INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    total_clicks INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    gross_revenue DECIMAL(10,2) DEFAULT 0,
    net_revenue DECIMAL(10,2) DEFAULT 0,
    ai_costs DECIMAL(10,2) DEFAULT 0,
    platform_fees DECIMAL(10,2) DEFAULT 0,
    profit DECIMAL(10,2) DEFAULT 0,
    conversion_rate DECIMAL(5,4),
    avg_sale_price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    artwork_id INTEGER REFERENCES artworks(id),
    platform VARCHAR(50),
    views INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    favorites INTEGER DEFAULT 0,
    sales INTEGER DEFAULT 0,
    revenue DECIMAL(10,2) DEFAULT 0,
    conversion_rate DECIMAL(5,4),
    last_updated TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SYSTEM OPERATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS job_queue (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL,
    job_data JSONB,
    priority INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    scheduled_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_queue(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled ON job_queue(scheduled_at);

CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20),
    component VARCHAR(50),
    message TEXT,
    data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created ON system_logs(created_at);

CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    service VARCHAR(50),
    endpoint VARCHAR(100),
    cost DECIMAL(10,4),
    response_time INTEGER,
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CONFIGURATION
-- ============================================

CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO system_config (key, value, description) VALUES
('daily_production_target', '200', 'Target number of artworks per day'),
('min_quality_score', '80', 'Minimum quality score to publish'),
('max_listings_per_day', '50', 'Max new listings per platform per day'),
('auto_republish', 'true', 'Auto-republish underperformers'),
('adaptive_learning', 'true', 'Enable adaptive learning system')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- ARTIST INSPIRATION & STYLE DNA
-- ============================================

CREATE TABLE IF NOT EXISTS artist_inspirations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    era VARCHAR(50),
    style_characteristics JSONB,
    color_signatures JSONB,
    composition_patterns JSONB,
    famous_works TEXT[],
    market_value_tier VARCHAR(20),
    cultural_influence INTEGER,
    atlas_application JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_artist_dna (
    id SERIAL PRIMARY KEY,
    ai_artist_id INTEGER REFERENCES ai_artists(id),
    inspiration_source_id INTEGER REFERENCES artist_inspirations(id),
    influence_percentage INTEGER,
    inherited_characteristics JSONB,
    style_fusion_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS style_clusters (
    id SERIAL PRIMARY KEY,
    cluster_name VARCHAR(100) UNIQUE,
    description TEXT,
    inspiration_ids INTEGER[],
    market_segment VARCHAR(50),
    target_platforms TEXT[],
    avg_price_point DECIMAL(10,2),
    performance_score DECIMAL(5,2),
    cultural_markers JSONB,
    key_characteristics JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE artworks
    ADD COLUMN IF NOT EXISTS inspiration_dna_id INTEGER REFERENCES artist_inspirations(id),
    ADD COLUMN IF NOT EXISTS style_cluster_id INTEGER REFERENCES style_clusters(id);

-- ============================================
-- MODEL DISCOVERY (Engine 9)
-- ============================================

CREATE TABLE IF NOT EXISTS discovered_models (
    id SERIAL PRIMARY KEY,
    model_id VARCHAR(200) UNIQUE NOT NULL,
    source VARCHAR(50),
    name VARCHAR(200),
    description TEXT,
    benchmark_scores JSONB,
    avg_quality_score DECIMAL(5,2),
    avg_speed_ms INTEGER,
    cost_per_image DECIMAL(8,4),
    overall_score DECIMAL(5,2),
    status VARCHAR(20) DEFAULT 'discovered',
    discovered_at TIMESTAMP DEFAULT NOW(),
    last_benchmarked TIMESTAMP
);
