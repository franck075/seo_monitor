"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('role', sa.String(length=20), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('telegram_chat_id', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_id', 'users', ['id'])

    # user_api_credentials
    op.create_table('user_api_credentials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.String(length=50), nullable=False),
        sa.Column('label', sa.String(length=255), nullable=True),
        sa.Column('credentials_enc', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_user_api_credentials_id', 'user_api_credentials', ['id'])

    # websites
    op.create_table('websites',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('domain', sa.String(length=255), nullable=False),
        sa.Column('display_name', sa.String(length=255), nullable=True),
        sa.Column('gsc_property', sa.String(length=500), nullable=True),
        sa.Column('ga4_property_id', sa.String(length=100), nullable=True),
        sa.Column('gsc_cred_id', sa.Integer(), nullable=True),
        sa.Column('ga4_cred_id', sa.Integer(), nullable=True),
        sa.Column('timezone', sa.String(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('health_score', sa.SmallInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['gsc_cred_id'], ['user_api_credentials.id']),
        sa.ForeignKeyConstraint(['ga4_cred_id'], ['user_api_credentials.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_websites_id', 'websites', ['id'])
    op.create_index('ix_websites_user_id', 'websites', ['user_id'])

    # keywords
    op.create_table('keywords',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('query', sa.String(length=500), nullable=False),
        sa.Column('page', sa.String(length=2000), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('website_id', 'query'),
    )
    op.create_index('ix_keywords_id', 'keywords', ['id'])
    op.create_index('ix_keywords_website_id', 'keywords', ['website_id'])

    # keyword_positions
    op.create_table('keyword_positions',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('keyword_id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('recorded_date', sa.Date(), nullable=False),
        sa.Column('position', sa.Numeric(6, 2), nullable=True),
        sa.Column('clicks', sa.Integer(), nullable=True),
        sa.Column('impressions', sa.Integer(), nullable=True),
        sa.Column('ctr', sa.Numeric(6, 4), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['keyword_id'], ['keywords.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('keyword_id', 'recorded_date'),
    )
    op.create_index('ix_keyword_positions_id', 'keyword_positions', ['id'])
    op.create_index('ix_keyword_positions_keyword_id', 'keyword_positions', ['keyword_id'])
    op.create_index('ix_keyword_positions_website_id', 'keyword_positions', ['website_id'])

    # traffic_snapshots
    op.create_table('traffic_snapshots',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('recorded_date', sa.Date(), nullable=False),
        sa.Column('sessions', sa.Integer(), nullable=True),
        sa.Column('users', sa.Integer(), nullable=True),
        sa.Column('new_users', sa.Integer(), nullable=True),
        sa.Column('pageviews', sa.Integer(), nullable=True),
        sa.Column('bounce_rate', sa.Numeric(6, 4), nullable=True),
        sa.Column('avg_session_duration', sa.Numeric(10, 2), nullable=True),
        sa.Column('source', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('website_id', 'recorded_date', 'source'),
    )
    op.create_index('ix_traffic_snapshots_website_id', 'traffic_snapshots', ['website_id'])

    # gsc_performance_snapshots
    op.create_table('gsc_performance_snapshots',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('recorded_date', sa.Date(), nullable=False),
        sa.Column('total_clicks', sa.Integer(), nullable=True),
        sa.Column('total_impressions', sa.Integer(), nullable=True),
        sa.Column('avg_ctr', sa.Numeric(6, 4), nullable=True),
        sa.Column('avg_position', sa.Numeric(6, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('website_id', 'recorded_date'),
    )

    # core_web_vitals
    op.create_table('core_web_vitals',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('page_url', sa.String(length=2000), nullable=False),
        sa.Column('strategy', sa.String(length=10), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('lcp', sa.Numeric(8, 2), nullable=True),
        sa.Column('cls', sa.Numeric(8, 4), nullable=True),
        sa.Column('inp', sa.Numeric(8, 2), nullable=True),
        sa.Column('ttfb', sa.Numeric(8, 2), nullable=True),
        sa.Column('fcp', sa.Numeric(8, 2), nullable=True),
        sa.Column('performance_score', sa.SmallInteger(), nullable=True),
        sa.Column('lcp_rating', sa.String(length=20), nullable=True),
        sa.Column('cls_rating', sa.String(length=20), nullable=True),
        sa.Column('inp_rating', sa.String(length=20), nullable=True),
        sa.Column('ttfb_rating', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_core_web_vitals_website_id', 'core_web_vitals', ['website_id'])

    # seo_snapshots
    op.create_table('seo_snapshots',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('page_url', sa.String(length=2000), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('title', sa.Text(), nullable=True),
        sa.Column('meta_description', sa.Text(), nullable=True),
        sa.Column('h1', sa.Text(), nullable=True),
        sa.Column('h2s', sa.ARRAY(sa.Text()), nullable=True),
        sa.Column('canonical', sa.String(length=2000), nullable=True),
        sa.Column('robots_meta', sa.String(length=255), nullable=True),
        sa.Column('schema_types', sa.ARRAY(sa.Text()), nullable=True),
        sa.Column('og_title', sa.Text(), nullable=True),
        sa.Column('og_description', sa.Text(), nullable=True),
        sa.Column('content_hash', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_seo_snapshots_website_id', 'seo_snapshots', ['website_id'])

    # seo_changes
    op.create_table('seo_changes',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('page_url', sa.String(length=2000), nullable=False),
        sa.Column('detected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('field', sa.String(length=100), nullable=False),
        sa.Column('old_value', sa.Text(), nullable=True),
        sa.Column('new_value', sa.Text(), nullable=True),
        sa.Column('snapshot_before', sa.BigInteger(), nullable=True),
        sa.Column('snapshot_after', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['snapshot_before'], ['seo_snapshots.id']),
        sa.ForeignKeyConstraint(['snapshot_after'], ['seo_snapshots.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_seo_changes_website_id', 'seo_changes', ['website_id'])

    # http_checks
    op.create_table('http_checks',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('page_url', sa.String(length=2000), nullable=False),
        sa.Column('checked_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('status_code', sa.SmallInteger(), nullable=True),
        sa.Column('redirect_url', sa.String(length=2000), nullable=True),
        sa.Column('redirect_chain', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('response_time', sa.Numeric(8, 2), nullable=True),
        sa.Column('is_error', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_http_checks_website_id', 'http_checks', ['website_id'])

    # robots_snapshots
    op.create_table('robots_snapshots',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('content_hash', sa.String(length=64), nullable=True),
        sa.Column('fetch_status', sa.SmallInteger(), nullable=True),
        sa.Column('has_changed', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_robots_snapshots_website_id', 'robots_snapshots', ['website_id'])

    # sitemap_snapshots
    op.create_table('sitemap_snapshots',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('sitemap_url', sa.String(length=2000), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('url_count', sa.Integer(), nullable=True),
        sa.Column('content_hash', sa.String(length=64), nullable=True),
        sa.Column('last_modified', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_frozen', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sitemap_snapshots_website_id', 'sitemap_snapshots', ['website_id'])

    # sitemap_urls
    op.create_table('sitemap_urls',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('snapshot_id', sa.BigInteger(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('url', sa.String(length=2000), nullable=False),
        sa.Column('lastmod', sa.Date(), nullable=True),
        sa.Column('changefreq', sa.String(length=50), nullable=True),
        sa.Column('priority', sa.Numeric(3, 2), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(['snapshot_id'], ['sitemap_snapshots.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_sitemap_urls_snapshot_id', 'sitemap_urls', ['snapshot_id'])

    # indexation_errors
    op.create_table('indexation_errors',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('page_url', sa.String(length=2000), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('error_type', sa.String(length=100), nullable=True),
        sa.Column('coverage_state', sa.String(length=100), nullable=True),
        sa.Column('last_crawled', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_indexable', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_indexation_errors_website_id', 'indexation_errors', ['website_id'])

    # alert_rules
    op.create_table('alert_rules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('metric', sa.String(length=100), nullable=False),
        sa.Column('condition', sa.String(length=50), nullable=False),
        sa.Column('threshold', sa.Numeric(12, 4), nullable=True),
        sa.Column('window_minutes', sa.Integer(), nullable=True),
        sa.Column('channels', sa.ARRAY(sa.String()), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('cooldown_minutes', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_alert_rules_user_id', 'alert_rules', ['user_id'])
    op.create_index('ix_alert_rules_website_id', 'alert_rules', ['website_id'])

    # alert_events
    op.create_table('alert_events',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('rule_id', sa.Integer(), nullable=False),
        sa.Column('website_id', sa.Integer(), nullable=False),
        sa.Column('fired_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('metric_value', sa.Numeric(12, 4), nullable=True),
        sa.Column('context_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('channels_sent', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['rule_id'], ['alert_rules.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['website_id'], ['websites.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_alert_events_rule_id', 'alert_events', ['rule_id'])
    op.create_index('ix_alert_events_website_id', 'alert_events', ['website_id'])


def downgrade() -> None:
    op.drop_table('alert_events')
    op.drop_table('alert_rules')
    op.drop_table('indexation_errors')
    op.drop_table('sitemap_urls')
    op.drop_table('sitemap_snapshots')
    op.drop_table('robots_snapshots')
    op.drop_table('http_checks')
    op.drop_table('seo_changes')
    op.drop_table('seo_snapshots')
    op.drop_table('core_web_vitals')
    op.drop_table('gsc_performance_snapshots')
    op.drop_table('traffic_snapshots')
    op.drop_table('keyword_positions')
    op.drop_table('keywords')
    op.drop_table('websites')
    op.drop_table('user_api_credentials')
    op.drop_table('users')
