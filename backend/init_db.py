"""
Database initialization script.
Creates all tables and optionally seeds initial data.
"""
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app, db
from models import Constellation, Satellite, GroundStation, TLEHistory
from config import Config


def create_tables():
    """Create all database tables."""
    with app.app_context():
        db.create_all()
        print("[OK] Database tables created")


def seed_constellations():
    """Seed initial constellation data from configuration."""
    with app.app_context():
        for slug, config in Config.CONSTELLATIONS.items():
            existing = Constellation.query.filter_by(slug=slug).first()
            if not existing:
                constellation = Constellation(
                    name=config['name'],
                    slug=slug,
                    description=config['description'],
                    celestrak_group=config['group'],
                    color=config['color'],
                    tle_source_url=f"{Config.CELESTRAK_BASE_URL}?GROUP={config['group']}&FORMAT=tle",
                )
                db.session.add(constellation)
                print(f"  Added constellation: {config['name']}")
        
        db.session.commit()
        print("[OK] Constellations seeded")


def update_tle_data(constellations=None):
    """
    Update TLE data for specified constellations.
    
    Args:
        constellations: List of constellation slugs, or None for all
    """
    from services.tle_service import tle_service
    
    with app.app_context():
        if constellations is None:
            constellations = list(Config.CONSTELLATIONS.keys())
        
        for slug in constellations:
            try:
                print(f"  Updating {slug}...")
                new, updated = tle_service.update_constellation_tle(slug)
                print(f"    {new} new, {updated} updated")
            except Exception as e:
                print(f"    Error: {e}")
        
        print("[OK] TLE data updated")


def main():
    """Main initialization function."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Initialize Satellite Tracker database')
    parser.add_argument('--seed', action='store_true', help='Seed constellation data')
    parser.add_argument('--update-tle', action='store_true', help='Update TLE data')
    parser.add_argument('--constellations', nargs='+', help='Specific constellations to update')
    parser.add_argument('--all', action='store_true', help='Run all initialization steps')
    
    args = parser.parse_args()
    
    print("=" * 50)
    print("Satellite Tracker Database Initialization")
    print("=" * 50)
    
    # Always create tables
    create_tables()
    
    if args.all or args.seed:
        seed_constellations()
    
    if args.all or args.update_tle:
        constellations = args.constellations if args.constellations else None
        update_tle_data(constellations)
    
    print("=" * 50)
    print("Initialization complete!")
    print("=" * 50)


if __name__ == '__main__':
    main()
